import { stat } from "node:fs/promises";

import { execa } from "execa";

import {
  type AudioVersion,
  CONTRACT_SCHEMA_VERSION,
  type FfprobeCommand,
  type FfprobeExecutionResult,
  type FfprobeExecutor,
  type RenderArtifact,
  type RenderKind,
  type RenderMetadataShape,
} from "./types.js";

export interface AssembleRenderArtifactOptions {
  renderId: string;
  createdAt: Date;
  kind: RenderKind;
  version: AudioVersion;
  outputPath: string;
  metadata: RenderMetadataShape;
  loudnessSummary?: Record<string, number> | undefined;
  warnings?: string[] | undefined;
}

interface FfprobeStream {
  codec_name?: string;
  codec_type?: string;
  sample_rate?: string;
  channels?: number;
}

interface FfprobeFormat {
  format_name?: string;
  duration?: string;
}

interface FfprobePayload {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

export interface ProbeOutputMetadataOptions {
  outputPath: string;
  ffprobePath?: string | undefined;
  executor?: FfprobeExecutor | undefined;
}

export class RenderMetadataProbeError extends Error {
  readonly command: FfprobeCommand;
  readonly result: FfprobeExecutionResult;

  constructor(command: FfprobeCommand, result: FfprobeExecutionResult) {
    super(
      `ffprobe metadata probe failed with exit code ${result.exitCode}: ${result.stderr || result.stdout}`,
    );
    this.name = "RenderMetadataProbeError";
    this.command = command;
    this.result = result;
  }
}

/** Reads the rendered file size when the output has been materialized. */
export async function readOutputFileSize(absolutePath: string): Promise<number | undefined> {
  try {
    const fileStats = await stat(absolutePath);
    return fileStats.size;
  } catch (error) {
    const code = getErrorCode(error);

    if (code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

/** Probes the rendered file so artifact metadata describes the actual output. */
export async function probeOutputMetadata(
  options: ProbeOutputMetadataOptions,
): Promise<RenderMetadataShape> {
  const command: FfprobeCommand = {
    executable: options.ffprobePath ?? "ffprobe",
    args: [
      "-v",
      "error",
      "-show_entries",
      "format=format_name,duration:stream=codec_name,codec_type,sample_rate,channels",
      "-of",
      "json",
      options.outputPath,
    ],
    inputPath: options.outputPath,
  };

  const executor = options.executor ?? defaultFfprobeExecutor;
  const result = await executor(command);

  if (result.exitCode !== 0) {
    throw new RenderMetadataProbeError(command, result);
  }

  const payload = parseFfprobePayload(result.stdout);
  const audioStream = payload.streams?.find((stream) => stream.codec_type === "audio");
  const formatName = firstToken(payload.format?.format_name);
  const codec = audioStream?.codec_name;
  const sampleRateHz = parsePositiveNumber(audioStream?.sample_rate);
  const channels = audioStream?.channels;
  const durationSeconds = parseNonNegativeNumber(payload.format?.duration);

  if (
    formatName === undefined ||
    codec === undefined ||
    sampleRateHz === undefined ||
    channels === undefined ||
    durationSeconds === undefined
  ) {
    throw new Error(`ffprobe returned incomplete output metadata for ${options.outputPath}`);
  }

  return {
    format: formatName,
    codec,
    sampleRateHz,
    channels,
    durationSeconds,
  };
}

/** Assembles a contract-aligned render artifact from explicit metadata. */
export function assembleRenderArtifact(options: AssembleRenderArtifactOptions): RenderArtifact {
  const artifact: RenderArtifact = {
    schema_version: CONTRACT_SCHEMA_VERSION,
    render_id: options.renderId,
    asset_id: options.version.asset_id,
    version_id: options.version.version_id,
    kind: options.kind,
    created_at: options.createdAt.toISOString(),
    output: {
      path: options.outputPath,
      format: options.metadata.format,
      codec: options.metadata.codec,
      sample_rate_hz: options.metadata.sampleRateHz,
      channels: options.metadata.channels,
      duration_seconds: options.metadata.durationSeconds,
      ...(options.metadata.fileSizeBytes === undefined
        ? {}
        : { file_size_bytes: options.metadata.fileSizeBytes }),
    },
    ...(options.loudnessSummary === undefined ? {} : { loudness_summary: options.loudnessSummary }),
    ...(options.warnings === undefined ? {} : { warnings: options.warnings }),
  };

  return artifact;
}

const defaultFfprobeExecutor: FfprobeExecutor = async (
  command,
): Promise<FfprobeExecutionResult> => {
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

function firstToken(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const [token] = value.split(",");
  return token;
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseNonNegativeNumber(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : undefined;
}
