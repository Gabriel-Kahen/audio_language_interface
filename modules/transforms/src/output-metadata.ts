import { execa } from "execa";

import type { AudioVersion } from "./types.js";

interface FfprobeCommand {
  executable: string;
  args: string[];
  outputPath: string;
}

interface FfprobeExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface FfprobeStream {
  codec_type?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
}

interface FfprobeFormat {
  duration?: string;
}

interface FfprobePayload {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

export class TransformMetadataProbeError extends Error {
  readonly command: FfprobeCommand;
  readonly result: FfprobeExecutionResult;

  constructor(command: FfprobeCommand, result: FfprobeExecutionResult) {
    super(
      `ffprobe metadata probe failed with exit code ${result.exitCode}: ${result.stderr || result.stdout}`,
    );
    this.name = "TransformMetadataProbeError";
    this.command = command;
    this.result = result;
  }
}

/**
 * Probes a rendered audio file so transform metadata can describe the actual
 * output when filter behavior is data-dependent.
 */
export async function probeOutputAudioMetadata(options: {
  outputPath: string;
  ffprobePath?: string;
  fallbackAudio: AudioVersion["audio"];
}): Promise<AudioVersion["audio"]> {
  const command: FfprobeCommand = {
    executable: options.ffprobePath ?? "ffprobe",
    args: [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type,sample_rate,channels,channel_layout",
      "-of",
      "json",
      options.outputPath,
    ],
    outputPath: options.outputPath,
  };
  const result = await defaultFfprobeExecutor(command);

  if (result.exitCode !== 0) {
    throw new TransformMetadataProbeError(command, result);
  }

  const payload = parseFfprobePayload(result.stdout);
  const audioStream = payload.streams?.find((stream) => stream.codec_type === "audio");
  const sampleRateHz = parsePositiveNumber(audioStream?.sample_rate);
  const channels = audioStream?.channels;
  const durationSeconds = parseNonNegativeNumber(payload.format?.duration) ?? 0;

  if (sampleRateHz === undefined || channels === undefined || durationSeconds === undefined) {
    throw new Error(`ffprobe returned incomplete output metadata for ${options.outputPath}`);
  }

  const roundedDurationSeconds = Number(durationSeconds.toFixed(6));

  return {
    ...options.fallbackAudio,
    sample_rate_hz: sampleRateHz,
    channels,
    duration_seconds: roundedDurationSeconds,
    frame_count: Math.round(roundedDurationSeconds * sampleRateHz),
    ...(audioStream?.channel_layout === undefined
      ? {}
      : { channel_layout: audioStream.channel_layout }),
  };
}

const defaultFfprobeExecutor = async (command: FfprobeCommand): Promise<FfprobeExecutionResult> => {
  const result = await execa(command.executable, command.args, {
    reject: false,
  });

  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

function parseFfprobePayload(stdout: string): FfprobePayload {
  const parsed = JSON.parse(stdout) as unknown;

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("ffprobe did not return a JSON object");
  }

  return parsed as FfprobePayload;
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseNonNegativeNumber(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
