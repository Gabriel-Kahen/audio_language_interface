import path from "node:path";

import { execa } from "execa";

import { ExternalToolError } from "./errors.js";
import type { AudioFileMetadata } from "./read-metadata.js";

/** Output format that the module can normalize into today. */
export interface NormalizationTarget {
  containerFormat: "wav";
  codec: "pcm_s16le" | "pcm_s24le" | "pcm_f32le";
  sampleRateHz: number;
  channels: number;
}

/** Decision record describing whether a source file needs transcoding. */
export interface NormalizationPlan {
  requiresTranscode: boolean;
  reasons: string[];
  output: {
    containerFormat: string;
    codec: string;
    sampleRateHz: number;
    channels: number;
    bitDepth?: number;
    channelLayout?: string;
  };
}

/** Default normalized audio target for downstream processing. */
export const DEFAULT_NORMALIZATION_TARGET: NormalizationTarget = {
  containerFormat: "wav",
  codec: "pcm_s16le",
  sampleRateHz: 48000,
  channels: 2,
};

function codecToBitDepth(codec: NormalizationTarget["codec"]): number | undefined {
  if (codec === "pcm_s16le") {
    return 16;
  }
  if (codec === "pcm_s24le") {
    return 24;
  }
  if (codec === "pcm_f32le") {
    return 32;
  }

  return undefined;
}

/**
 * Compares inspected metadata to a target output format and reports whether
 * transcoding is required.
 */
export function createNormalizationPlan(
  metadata: AudioFileMetadata,
  target: NormalizationTarget,
): NormalizationPlan {
  const reasons: string[] = [];

  if (metadata.containerFormat !== target.containerFormat) {
    reasons.push(`container ${metadata.containerFormat} -> ${target.containerFormat}`);
  }
  if (metadata.codec !== target.codec) {
    reasons.push(`codec ${metadata.codec} -> ${target.codec}`);
  }
  if (metadata.sampleRateHz !== target.sampleRateHz) {
    reasons.push(`sample_rate ${metadata.sampleRateHz} -> ${target.sampleRateHz}`);
  }
  if (metadata.channels !== target.channels) {
    reasons.push(`channels ${metadata.channels} -> ${target.channels}`);
  }

  const output: NormalizationPlan["output"] = {
    containerFormat: target.containerFormat,
    codec: target.codec,
    sampleRateHz: target.sampleRateHz,
    channels: target.channels,
  };

  const bitDepth = codecToBitDepth(target.codec);
  if (bitDepth !== undefined) {
    output.bitDepth = bitDepth;
  }

  if (target.channels === 1) {
    output.channelLayout = "mono";
  } else if (target.channels === 2) {
    output.channelLayout = "stereo";
  }

  return {
    requiresTranscode: reasons.length > 0,
    reasons,
    output,
  };
}

/** Builds the explicit `ffmpeg` command used for normalization. */
export function buildNormalizeAudioCommand(
  inputPath: string,
  outputPath: string,
  target: NormalizationTarget,
): { command: string; args: string[] } {
  if (path.extname(outputPath).toLowerCase() !== `.${target.containerFormat}`) {
    throw new ExternalToolError(
      "ffmpeg",
      `Output extension must match target container format: ${target.containerFormat}`,
    );
  }

  return {
    command: "ffmpeg",
    args: [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-sn",
      "-dn",
      "-map_metadata",
      "-1",
      "-ar",
      String(target.sampleRateHz),
      "-ac",
      String(target.channels),
      "-c:a",
      target.codec,
      outputPath,
    ],
  };
}

/** Executes `ffmpeg` to materialize a normalized audio file. */
export async function normalizeAudioFile(
  inputPath: string,
  outputPath: string,
  target: NormalizationTarget,
): Promise<void> {
  const { command, args } = buildNormalizeAudioCommand(inputPath, outputPath, target);

  try {
    await execa(command, args);
  } catch (cause) {
    throw new ExternalToolError("ffmpeg", `ffmpeg failed to normalize ${inputPath}`, { cause });
  }
}
