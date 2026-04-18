import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import type { EditTarget } from "./types.js";

const execFile = promisify(execFileCallback);

interface LoudnessMetrics {
  integratedLufs: number;
  truePeakDbtp: number;
}

export async function measurePeakDbfs(
  inputPath: string,
  options?: {
    ffmpegPath?: string;
    target?: EditTarget;
  },
): Promise<number> {
  const { stderr } = await execFile(options?.ffmpegPath ?? "ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i",
    inputPath,
    "-af",
    `${buildTargetMeasurementPrefix(options?.target)}astats=metadata=1:reset=0`,
    "-f",
    "null",
    "-",
  ]);

  return parseLastMetricValue(stderr, /Peak level dB:\s*(-?\d+(?:\.\d+)?|-inf)/gu, "Peak level dB");
}

export async function measureLoudness(
  inputPath: string,
  options?: {
    ffmpegPath?: string;
    target?: EditTarget;
  },
): Promise<LoudnessMetrics> {
  const { stderr } = await execFile(options?.ffmpegPath ?? "ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i",
    inputPath,
    "-af",
    `${buildTargetMeasurementPrefix(options?.target)}loudnorm=I=-24:TP=-2:LRA=7:print_format=json`,
    "-f",
    "null",
    "-",
  ]);

  const metrics = parseLoudnormMetrics(stderr);
  if (metrics === undefined) {
    throw new Error(`Could not parse loudnorm metrics from ffmpeg output for ${inputPath}.`);
  }

  return metrics;
}

function buildTargetMeasurementPrefix(target?: EditTarget): string {
  if (target === undefined || target.scope === "full_file") {
    return "";
  }

  if (target.scope !== "time_range") {
    throw new Error("Measurement helpers currently support only full_file or time_range targets.");
  }

  const startSeconds = readNonNegativeNumber(target.start_seconds, "target.start_seconds");
  const endSeconds = readNonNegativeNumber(target.end_seconds, "target.end_seconds");

  if (endSeconds <= startSeconds) {
    throw new Error("target.end_seconds must be greater than target.start_seconds.");
  }

  return `atrim=start=${formatNumber(startSeconds)}:end=${formatNumber(endSeconds)},asetpts=N/SR/TB,`;
}

function parseLastMetricValue(stderr: string, pattern: RegExp, label: string): number {
  const match = Array.from(stderr.matchAll(pattern)).at(-1)?.[1];
  if (match === undefined) {
    throw new Error(`Could not parse ${label} from ffmpeg output.`);
  }

  return match === "-inf" ? Number.NEGATIVE_INFINITY : Number(match);
}

function parseLoudnormMetrics(stderr: string): LoudnessMetrics | undefined {
  const jsonMatch = stderr.match(/\{[\s\S]*?"input_i"\s*:\s*"[^"]+"[\s\S]*?\}/u);
  if (jsonMatch === null) {
    return undefined;
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    input_i?: string;
    input_tp?: string;
  };
  const integratedLufs = Number(parsed.input_i);
  const truePeakDbtp = Number(parsed.input_tp);

  if (!Number.isFinite(integratedLufs) || !Number.isFinite(truePeakDbtp)) {
    return undefined;
  }

  return {
    integratedLufs,
    truePeakDbtp,
  };
}

function readNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite number greater than or equal to 0.`);
  }

  return roundToSixDecimals(value);
}

function roundToSixDecimals(value: number): number {
  return Number(value.toFixed(6));
}

function formatNumber(value: number): string {
  return roundToSixDecimals(value).toString();
}
