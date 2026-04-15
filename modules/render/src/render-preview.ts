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
import type { PreviewRenderOptions, RenderResult } from "./types.js";

const PREVIEW_FORMAT = {
  format: "mp3",
  codec: "libmp3lame",
  extension: "mp3",
} as const;

/**
 * Renders a fast preview artifact using fixed MP3 defaults.
 *
 * The emitted artifact path is workspace-relative and output metadata is probed
 * from the rendered file after ffmpeg succeeds.
 */
export async function renderPreview(options: PreviewRenderOptions): Promise<RenderResult> {
  assertValidAudioVersion(options.version);

  const inputPath = resolveSourceAudioPath(
    options.workspaceRoot,
    options.version.audio.storage_ref,
  );
  await assertFileExists(inputPath);

  const renderPath = resolveRenderOutputPath({
    workspaceRoot: options.workspaceRoot,
    outputDir: options.outputDir,
    outputFileName: options.outputFileName,
    renderId: options.renderId,
    extension: PREVIEW_FORMAT.extension,
    kind: "preview",
  });

  const expectedSampleRateHz = options.sampleRateHz ?? options.version.audio.sample_rate_hz;
  const expectedChannels = options.channels ?? options.version.audio.channels;
  const command = buildFfmpegRenderCommand({
    inputPath,
    outputPath: renderPath.absolutePath,
    sampleRateHz: expectedSampleRateHz,
    channels: expectedChannels,
    ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
    format: {
      ...PREVIEW_FORMAT,
      bitrate: options.bitrate ?? "128k",
    },
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
      `Rendered preview file was not found after ffmpeg completed: ${renderPath.absolutePath}`,
    );
  }

  const validationWarnings = validateRenderedOutput({
    outputPath: renderPath.relativePath,
    expectedFormat: PREVIEW_FORMAT.format,
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
      kind: "preview",
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
