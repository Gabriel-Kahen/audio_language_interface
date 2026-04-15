import { mkdir, stat } from "node:fs/promises";
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

/** Raised when ffmpeg exits successfully but no output file was materialized. */
export class TransformOutputValidationError extends Error {
  constructor(outputPath: string) {
    super(`ffmpeg transform completed without materializing an output file: ${outputPath}`);
    this.name = "TransformOutputValidationError";
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

  await assertMaterializedOutput(command.outputPath);

  return result;
}

/** Returns deterministic, line-oriented warnings extracted from ffmpeg stderr. */
export function extractTransformWarnings(stderr: string): string[] {
  return Array.from(
    new Set(
      stderr
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .filter((line) => !isRoutineFfmpegLogLine(line)),
    ),
  );
}

const defaultFfmpegExecutor: FfmpegExecutor = async (command): Promise<FfmpegExecutionResult> => {
  const result = await execa(command.executable, command.args, { reject: false });

  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

async function assertMaterializedOutput(outputPath: string): Promise<void> {
  const fileStats = await stat(outputPath).catch((error: unknown) => {
    const code = getErrorCode(error);

    if (code === "ENOENT") {
      return undefined;
    }

    throw error;
  });

  if (fileStats === undefined || !fileStats.isFile() || fileStats.size <= 0) {
    throw new TransformOutputValidationError(outputPath);
  }
}

function isRoutineFfmpegLogLine(line: string): boolean {
  return (
    line.startsWith("ffmpeg version") ||
    line.startsWith("built with") ||
    line.startsWith("configuration:") ||
    line.startsWith("libav") ||
    line.startsWith("libpost") ||
    line.startsWith("libsw") ||
    line.startsWith("Input #") ||
    line.startsWith("Output #") ||
    line.startsWith("Metadata:") ||
    line.startsWith("Duration:") ||
    line.startsWith("Stream mapping:") ||
    line.startsWith("Press [q]") ||
    line.startsWith("video:") ||
    line.startsWith("ISFT") ||
    line.startsWith("encoder") ||
    line.startsWith("[aist#") ||
    line.startsWith("[out#") ||
    /^size=\s*/u.test(line) ||
    /^Stream #/u.test(line)
  );
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : undefined;
}
