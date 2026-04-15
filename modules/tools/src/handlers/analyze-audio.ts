import type { AnalyzeAudioOptions, AudioVersion } from "@audio-language-interface/analysis";

import { ToolInputError } from "../errors.js";
import type { ToolDefinition, ToolRequest } from "../types.js";
import {
  assertToolResultAnalysisReport,
  expectAudioVersion,
  expectOptionalBoolean,
  expectOptionalString,
  expectRecord,
} from "../validation.js";

interface AnalyzeAudioArguments {
  audioVersion: AudioVersion;
  generatedAt?: string;
  includeAnnotations: boolean;
  includeSegments: boolean;
  includeSourceCharacter: boolean;
}

function validateVersionConsistency(request: ToolRequest, audioVersion: AudioVersion): void {
  if (request.asset_id !== undefined && request.asset_id !== audioVersion.asset_id) {
    throw new ToolInputError(
      "invalid_arguments",
      "Request asset_id does not match arguments.audio_version.asset_id.",
    );
  }

  if (request.version_id !== undefined && request.version_id !== audioVersion.version_id) {
    throw new ToolInputError(
      "invalid_arguments",
      "Request version_id does not match arguments.audio_version.version_id.",
    );
  }
}

function validateArguments(value: unknown, request: ToolRequest): AnalyzeAudioArguments {
  const record = expectRecord(value, "arguments");
  const audioVersion = expectAudioVersion(record.audio_version, "arguments.audio_version");
  const generatedAt = expectOptionalString(record.generated_at, "arguments.generated_at");

  validateVersionConsistency(request, audioVersion);

  return {
    audioVersion,
    ...(generatedAt === undefined ? {} : { generatedAt }),
    includeAnnotations:
      expectOptionalBoolean(record.include_annotations, "arguments.include_annotations") ?? true,
    includeSegments:
      expectOptionalBoolean(record.include_segments, "arguments.include_segments") ?? true,
    includeSourceCharacter:
      expectOptionalBoolean(
        record.include_source_character,
        "arguments.include_source_character",
      ) ?? true,
  };
}

function shapeReport(
  report: Record<string, unknown>,
  args: AnalyzeAudioArguments,
): Record<string, unknown> {
  const shaped = { ...report };

  if (!args.includeAnnotations) {
    delete shaped.annotations;
  }
  if (!args.includeSegments) {
    delete shaped.segments;
  }
  if (!args.includeSourceCharacter) {
    delete shaped.source_character;
  }

  return shaped;
}

export const analyzeAudioTool: ToolDefinition<AnalyzeAudioArguments, Record<string, unknown>> = {
  descriptor: {
    name: "analyze_audio",
    description: "Run deterministic baseline analysis for one audio version.",
    backing_module: "analysis",
    required_arguments: ["audio_version"],
    optional_arguments: [
      "generated_at",
      "include_annotations",
      "include_segments",
      "include_source_character",
    ],
  },
  validateArguments,
  async execute(args, context) {
    const options: AnalyzeAudioOptions = {
      workspaceRoot: context.workspaceRoot,
      ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
    };
    const report = assertToolResultAnalysisReport(
      await context.runtime.analyzeAudioVersion(args.audioVersion, options),
      "result.report",
    );

    return {
      result: {
        report: shapeReport(report as unknown as Record<string, unknown>, args),
      },
    };
  },
};
