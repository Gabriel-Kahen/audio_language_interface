import { execa } from "execa";

import type {
  FfmpegExecutionResult,
  LoudnessProbeCommand,
  LoudnessProbeExecutor,
  PreviewLoudnessMetrics,
} from "./types.js";

export interface MeasureRenderLoudnessOptions {
  ffmpegPath?: string | undefined;
  executor?: LoudnessProbeExecutor | undefined;
}

interface LoudnormPayload {
  input_i?: string;
  input_tp?: string;
}

/** Measures integrated loudness and true peak for preview matching. */
export async function measureRenderLoudness(
  inputPath: string,
  options: MeasureRenderLoudnessOptions = {},
): Promise<PreviewLoudnessMetrics> {
  const command: LoudnessProbeCommand = {
    executable: options.ffmpegPath ?? "ffmpeg",
    args: [
      "-hide_banner",
      "-nostats",
      "-i",
      inputPath,
      "-af",
      "loudnorm=I=-24:TP=-2:LRA=7:print_format=json",
      "-f",
      "null",
      "-",
    ],
    inputPath,
  };
  const run = options.executor ?? defaultLoudnessProbeExecutor;
  const result = await run(command);

  if (result.exitCode !== 0) {
    throw new Error(
      `FFmpeg loudness probe failed with exit code ${result.exitCode}: ${result.stderr || result.stdout}`,
    );
  }

  const metrics = parseLoudnormMetrics(result.stderr);
  if (metrics === undefined) {
    throw new Error(`FFmpeg loudness probe did not produce loudnorm metrics for ${inputPath}.`);
  }

  return metrics;
}

function parseLoudnormMetrics(stderr: string): PreviewLoudnessMetrics | undefined {
  const jsonMatch = stderr.match(/\{[\s\S]*?"input_i"\s*:\s*"[^"]+"[\s\S]*?\}/u);
  if (jsonMatch === null) {
    return undefined;
  }

  const parsed = JSON.parse(jsonMatch[0]) as LoudnormPayload;
  const integratedLufs = Number(parsed.input_i);
  const truePeakDbtp = Number(parsed.input_tp);

  if (!Number.isFinite(integratedLufs) || !Number.isFinite(truePeakDbtp)) {
    return undefined;
  }

  return {
    integrated_lufs: integratedLufs,
    true_peak_dbtp: truePeakDbtp,
  };
}

const defaultLoudnessProbeExecutor: LoudnessProbeExecutor = async (
  command,
): Promise<FfmpegExecutionResult> => {
  const result = await execa(command.executable, command.args, {
    reject: false,
  });

  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};
