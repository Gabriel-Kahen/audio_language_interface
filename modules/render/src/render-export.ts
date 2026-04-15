import { access } from "node:fs/promises";

import { assertValidAudioVersion } from "@audio-language-interface/core";

import {
  buildFfmpegRenderCommand,
  executeFfmpegCommand,
  extractFfmpegWarnings,
} from "./ffmpeg-adapter.js";
import {
  assembleRenderArtifact,
  probeOutputMetadata,
  RenderOutputValidationError,
  readOutputFileSize,
  validateRenderedOutput,
} from "./output-metadata.js";
import { resolveRenderOutputPath, resolveSourceAudioPath } from "./path-policy.js";
import type { FinalRenderOptions, RenderFormatConfig, RenderResult } from "./types.js";

const FINAL_FORMATS: Record<NonNullable<FinalRenderOptions["format"]>, RenderFormatConfig> = {
  wav: {
    format: "wav",
    codec: "pcm_s16le",
    extension: "wav",
  },
  flac: {
    format: "flac",
    codec: "flac",
    extension: "flac",
  },
};

/**
 * Renders a final export artifact using the current supported final formats.
 *
 * The emitted artifact path is workspace-relative and output metadata is probed
 * from the rendered file after ffmpeg succeeds.
 */
export async function renderExport(options: FinalRenderOptions): Promise<RenderResult> {
  assertValidAudioVersion(options.version);

  const inputPath = resolveSourceAudioPath(
    options.workspaceRoot,
    options.version.audio.storage_ref,
  );
  await assertFileExists(inputPath);

  const format = FINAL_FORMATS[options.format ?? "wav"];
  const expectedSampleRateHz = options.sampleRateHz ?? options.version.audio.sample_rate_hz;
  const expectedChannels = options.channels ?? options.version.audio.channels;
  const renderPath = resolveRenderOutputPath({
    workspaceRoot: options.workspaceRoot,
    outputDir: options.outputDir,
    outputFileName: options.outputFileName,
    renderId: options.renderId,
    extension: format.extension,
    kind: "final",
  });

  const command = buildFfmpegRenderCommand({
    inputPath,
    outputPath: renderPath.absolutePath,
    sampleRateHz: expectedSampleRateHz,
    channels: expectedChannels,
    ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
    format,
  });

  const execution = await executeFfmpegCommand(command, options.executor);
  const warnings = extractFfmpegWarnings(execution.stderr);
  const metadata = await probeOutputMetadata({
    outputPath: renderPath.absolutePath,
    ffprobePath: options.ffprobePath,
    executor: options.probeExecutor,
  });
  const fileSizeBytes = await readOutputFileSize(renderPath.absolutePath);

  if (fileSizeBytes === undefined) {
    throw new RenderOutputValidationError(
      `Rendered export file was not found after ffmpeg completed: ${renderPath.absolutePath}`,
    );
  }

  const validationWarnings = validateRenderedOutput({
    outputPath: renderPath.relativePath,
    expectedFormat: format.format,
    expectedSampleRateHz,
    expectedChannels,
    expectedDurationSeconds: options.version.audio.duration_seconds,
    metadata,
    fileSizeBytes,
  });

  return {
    command,
    artifact: assembleRenderArtifact({
      renderId: renderPath.renderId,
      createdAt: options.createdAt ?? new Date(),
      kind: "final",
      version: options.version,
      outputPath: renderPath.relativePath,
      metadata: {
        ...metadata,
        ...(fileSizeBytes === undefined ? {} : { fileSizeBytes }),
      },
      loudnessSummary: options.loudnessSummary,
      ...(warnings.length + validationWarnings.length === 0
        ? {}
        : { warnings: [...warnings, ...validationWarnings] }),
    }),
  };
}

async function assertFileExists(filePath: string): Promise<void> {
  await access(filePath);
}
