import type { AudioVersion } from "@audio-language-interface/core";

export type { AudioVersion } from "@audio-language-interface/core";

export const CONTRACT_SCHEMA_VERSION = "1.0.0" as const;

export type RenderKind = "preview" | "final";

/** Contract-aligned render artifact produced by the render module. */
export interface RenderArtifact {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  render_id: string;
  asset_id: string;
  version_id: string;
  kind: RenderKind;
  created_at: string;
  output: {
    path: string;
    format: string;
    codec: string;
    sample_rate_hz: number;
    channels: number;
    duration_seconds: number;
    file_size_bytes?: number;
  };
  loudness_summary?: Record<string, number>;
  warnings?: string[];
}

/** Shaped output metadata attached to a render artifact. */
export interface RenderMetadataShape {
  format: string;
  codec: string;
  sampleRateHz: number;
  channels: number;
  durationSeconds: number;
  fileSizeBytes?: number | undefined;
}

export interface ResolvedRenderPath {
  renderId: string;
  absolutePath: string;
  relativePath: string;
  fileName: string;
}

export interface RenderFormatConfig {
  format: string;
  codec: string;
  extension: string;
  bitrate?: string;
}

export interface FfmpegCommand {
  executable: string;
  args: string[];
  outputPath: string;
}

export interface FfmpegExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type FfmpegExecutor = (command: FfmpegCommand) => Promise<FfmpegExecutionResult>;

export interface FfprobeCommand {
  executable: string;
  args: string[];
  inputPath: string;
}

export interface FfprobeExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type FfprobeExecutor = (command: FfprobeCommand) => Promise<FfprobeExecutionResult>;

export interface BaseRenderOptions {
  workspaceRoot: string;
  version: AudioVersion;
  outputDir?: string | undefined;
  outputFileName?: string | undefined;
  renderId?: string | undefined;
  createdAt?: Date | undefined;
  ffmpegPath?: string | undefined;
  ffprobePath?: string | undefined;
  executor?: FfmpegExecutor | undefined;
  probeExecutor?: FfprobeExecutor | undefined;
  sampleRateHz?: number | undefined;
  channels?: number | undefined;
  loudnessSummary?: Record<string, number> | undefined;
}

export interface PreviewRenderOptions extends BaseRenderOptions {
  bitrate?: string;
}

export interface FinalRenderOptions extends BaseRenderOptions {
  format?: "wav" | "flac";
}

export interface RenderResult {
  artifact: RenderArtifact;
  command: FfmpegCommand;
}
