import { mkdir } from "node:fs/promises";
import path from "node:path";

import { execa } from "execa";

import type {
  FfmpegCommand,
  FfmpegExecutionResult,
  FfmpegExecutor,
  RenderFormatConfig,
} from "./types.js";

export interface BuildFfmpegRenderCommandOptions {
  ffmpegPath?: string | undefined;
  inputPath: string;
  outputPath: string;
  sampleRateHz: number;
  channels: number;
  format: RenderFormatConfig;
  audioFilterChain?: string | undefined;
}

export class RenderExecutionError extends Error {
  readonly command: FfmpegCommand;
  readonly result: FfmpegExecutionResult;

  constructor(command: FfmpegCommand, result: FfmpegExecutionResult) {
    super(
      `ffmpeg render failed with exit code ${result.exitCode}: ${result.stderr || result.stdout}`,
    );
    this.name = "RenderExecutionError";
    this.command = command;
    this.result = result;
  }
}

/** Builds an explicit ffmpeg invocation for a single audio render. */
export function buildFfmpegRenderCommand(options: BuildFfmpegRenderCommandOptions): FfmpegCommand {
  const args = ["-y", "-i", options.inputPath, "-vn"];

  if (options.audioFilterChain !== undefined) {
    args.push("-af", options.audioFilterChain);
  }

  args.push(
    "-ac",
    String(options.channels),
    "-ar",
    String(options.sampleRateHz),
    "-c:a",
    options.format.codec,
  );

  if (options.format.bitrate !== undefined) {
    args.push("-b:a", options.format.bitrate);
  }

  args.push(options.outputPath);

  return {
    executable: options.ffmpegPath ?? "ffmpeg",
    args,
    outputPath: options.outputPath,
  };
}

/** Executes a prepared ffmpeg command through an injected or default executor. */
export async function executeFfmpegCommand(
  command: FfmpegCommand,
  executor?: FfmpegExecutor,
): Promise<FfmpegExecutionResult> {
  await mkdir(path.dirname(command.outputPath), { recursive: true });
  const run = executor ?? defaultFfmpegExecutor;
  const result = await run(command);

  if (result.exitCode !== 0) {
    throw new RenderExecutionError(command, result);
  }

  return result;
}

/** Returns only stderr lines that look like actual warnings. */
export function extractFfmpegWarnings(stderr: string): string[] {
  return stderr
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && /\bwarning\b/iu.test(line));
}

const defaultFfmpegExecutor: FfmpegExecutor = async (command): Promise<FfmpegExecutionResult> => {
  const result = await execa(command.executable, command.args, {
    reject: false,
  });

  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};
