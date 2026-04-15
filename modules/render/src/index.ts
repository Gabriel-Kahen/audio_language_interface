export { createRenderId } from "@audio-language-interface/core";
export {
  buildFfmpegRenderCommand,
  executeFfmpegCommand,
  extractFfmpegWarnings,
  RenderExecutionError,
} from "./ffmpeg-adapter.js";
export {
  assembleRenderArtifact,
  probeOutputMetadata,
  RenderMetadataProbeError,
  readOutputFileSize,
} from "./output-metadata.js";
export { resolveRenderOutputPath, resolveSourceAudioPath } from "./path-policy.js";
export { renderExport } from "./render-export.js";
export { renderPreview } from "./render-preview.js";
export type {
  AudioVersion,
  BaseRenderOptions,
  FfmpegCommand,
  FfmpegExecutionResult,
  FfmpegExecutor,
  FfprobeCommand,
  FfprobeExecutionResult,
  FfprobeExecutor,
  FinalRenderOptions,
  PreviewRenderOptions,
  RenderArtifact,
  RenderFormatConfig,
  RenderKind,
  RenderMetadataShape,
  RenderResult,
  ResolvedRenderPath,
} from "./types.js";
export { CONTRACT_SCHEMA_VERSION } from "./types.js";
