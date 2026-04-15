import { mkdir } from "node:fs/promises";
import path from "node:path";

import { execa } from "execa";

import type { FfmpegCommand, FfmpegExecutionResult, FfmpegExecutor } from "./types.js";

/**
 * Raised when FFmpeg returns a non-zero exit code for a transform command.
 */
export class TransformExecutionError extends Error {
  readonly command: FfmpegCommand;
  readonly result: FfmpegExecutionResult;

  constructor(command: FfmpegCommand, result: FfmpegExecutionResult) {
    super(
      `ffmpeg transform failed with exit code ${result.exitCode}: ${result.stderr || result.stdout}`,
    );
    this.name = "TransformExecutionError";
    this.command = command;
    this.result = result;
  }
}

/**
 * Builds the exact FFmpeg command payload used by the transforms module.
 */
export function buildFfmpegTransformCommand(options: {
  ffmpegPath?: string;
  inputPath: string;
  outputPath: string;
  sampleRateHz: number;
  channels: number;
  filterChain: string;
}): FfmpegCommand {
  return {
    executable: options.ffmpegPath ?? "ffmpeg",
    args: [
      "-y",
      "-i",
      options.inputPath,
      "-vn",
      "-sn",
      "-dn",
      "-map_metadata",
      "-1",
      "-af",
      options.filterChain,
      "-ar",
      String(options.sampleRateHz),
      "-ac",
      String(options.channels),
      "-c:a",
      "pcm_s16le",
      options.outputPath,
    ],
    outputPath: options.outputPath,
  };
}

/**
 * Ensures the output directory exists, executes FFmpeg, and throws when the
 * process exits unsuccessfully.
 */
export async function executeFfmpegCommand(
  command: FfmpegCommand,
  executor?: FfmpegExecutor,
): Promise<FfmpegExecutionResult> {
  await mkdir(path.dirname(command.outputPath), { recursive: true });
  const run = executor ?? defaultFfmpegExecutor;
  const result = await run(command);

  if (result.exitCode !== 0) {
    throw new TransformExecutionError(command, result);
  }

  return result;
}

const defaultFfmpegExecutor: FfmpegExecutor = async (command): Promise<FfmpegExecutionResult> => {
  const result = await execa(command.executable, command.args, { reject: false });

  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};
