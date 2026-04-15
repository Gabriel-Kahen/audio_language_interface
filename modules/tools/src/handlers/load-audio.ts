import type { NormalizationTarget } from "@audio-language-interface/io";

import type { ToolDefinition } from "../types.js";
import {
  assertToolResultAudioAsset,
  assertToolResultAudioVersion,
  expectOptionalString,
  expectOptionalStringArray,
  expectPositiveInteger,
  expectRecord,
  expectString,
} from "../validation.js";

interface LoadAudioArguments {
  inputPath: string;
  outputDirectory?: string;
  normalizationTarget?: NormalizationTarget;
  tags?: string[];
  notes?: string;
}

function toMetadataShape(metadata: {
  containerFormat: string;
  codec: string;
  sampleRateHz: number;
  channels: number;
  durationSeconds: number;
  frameCount: number;
  bitDepth?: number;
  channelLayout?: string;
}): Record<string, unknown> {
  return {
    container_format: metadata.containerFormat,
    codec: metadata.codec,
    sample_rate_hz: metadata.sampleRateHz,
    channels: metadata.channels,
    duration_seconds: metadata.durationSeconds,
    frame_count: metadata.frameCount,
    ...(metadata.bitDepth === undefined ? {} : { bit_depth: metadata.bitDepth }),
    ...(metadata.channelLayout === undefined ? {} : { channel_layout: metadata.channelLayout }),
  };
}

function parseNormalizationTarget(value: unknown): NormalizationTarget | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = expectRecord(value, "arguments.normalization_target");

  return {
    containerFormat: expectString(
      record.container_format,
      "arguments.normalization_target.container_format",
    ),
    codec: expectString(record.codec, "arguments.normalization_target.codec"),
    sampleRateHz: expectPositiveInteger(
      record.sample_rate_hz,
      "arguments.normalization_target.sample_rate_hz",
    ),
    channels: expectPositiveInteger(record.channels, "arguments.normalization_target.channels"),
  } as unknown as NormalizationTarget;
}

function validateArguments(value: unknown): LoadAudioArguments {
  const record = expectRecord(value, "arguments");
  const outputDirectory = expectOptionalString(
    record.output_directory,
    "arguments.output_directory",
  );
  const normalizationTarget = parseNormalizationTarget(record.normalization_target);
  const tags = expectOptionalStringArray(record.tags, "arguments.tags");
  const notes = expectOptionalString(record.notes, "arguments.notes");

  return {
    inputPath: expectString(record.input_path, "arguments.input_path"),
    ...(outputDirectory === undefined ? {} : { outputDirectory }),
    ...(normalizationTarget === undefined ? {} : { normalizationTarget }),
    ...(tags === undefined ? {} : { tags }),
    ...(notes === undefined ? {} : { notes }),
  };
}

export const loadAudioTool: ToolDefinition<LoadAudioArguments, Record<string, unknown>> = {
  descriptor: {
    name: "load_audio",
    description: "Import a local audio file into workspace storage.",
    backing_module: "io",
    required_arguments: ["input_path"],
    optional_arguments: ["output_directory", "normalization_target", "tags", "notes"],
  },
  validateArguments,
  async execute(args, context) {
    const imported = await context.runtime.importAudioFromFile(args.inputPath, {
      workspaceRoot: context.workspaceRoot,
      ...(args.outputDirectory === undefined ? {} : { outputDirectory: args.outputDirectory }),
      ...(args.normalizationTarget === undefined
        ? {}
        : { normalizationTarget: args.normalizationTarget }),
      ...(args.tags === undefined ? {} : { tags: args.tags }),
      ...(args.notes === undefined ? {} : { notes: args.notes }),
    });
    const asset = assertToolResultAudioAsset(imported.asset, "result.asset");
    const version = assertToolResultAudioVersion(imported.version, "result.version");

    return {
      result: {
        asset: asset as unknown as Record<string, unknown>,
        version: version as unknown as Record<string, unknown>,
        source_metadata: toMetadataShape(imported.sourceMetadata),
        materialized_metadata: toMetadataShape(imported.materializedMetadata),
        output_path: imported.outputPath,
        normalized: imported.normalized,
      },
    };
  },
};
