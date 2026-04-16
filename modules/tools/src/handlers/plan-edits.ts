import type {
  AnalysisReport,
  AudioVersion,
  SemanticProfile,
} from "@audio-language-interface/planning";

import { createProvenanceMismatchError } from "../errors.js";
import type { ToolDefinition, ToolRequest } from "../types.js";
import {
  assertToolResultEditPlan,
  expectAnalysisReport,
  expectAudioVersion,
  expectOptionalString,
  expectOptionalStringArray,
  expectRecord,
  expectSemanticProfile,
  expectString,
} from "../validation.js";

interface PlanEditsArguments {
  audioVersion: AudioVersion;
  analysisReport: AnalysisReport;
  semanticProfile: SemanticProfile;
  userRequest: string;
  generatedAt?: string;
  constraints?: string[];
}

function validateVersionConsistency(request: ToolRequest, audioVersion: AudioVersion): void {
  if (request.asset_id !== undefined && request.asset_id !== audioVersion.asset_id) {
    throw createProvenanceMismatchError(
      "request.asset_id",
      "Request asset_id does not match arguments.audio_version.asset_id.",
      {
        request_asset_id: request.asset_id,
        argument_asset_id: audioVersion.asset_id,
      },
    );
  }

  if (request.version_id !== undefined && request.version_id !== audioVersion.version_id) {
    throw createProvenanceMismatchError(
      "request.version_id",
      "Request version_id does not match arguments.audio_version.version_id.",
      {
        request_version_id: request.version_id,
        argument_version_id: audioVersion.version_id,
      },
    );
  }
}

function validateArguments(value: unknown, request: ToolRequest): PlanEditsArguments {
  const record = expectRecord(value, "arguments");
  const audioVersion = expectAudioVersion(record.audio_version, "arguments.audio_version");
  const analysisReport = expectAnalysisReport(record.analysis_report, "arguments.analysis_report");
  const semanticProfile = expectSemanticProfile(
    record.semantic_profile,
    "arguments.semantic_profile",
  );
  const userRequest = expectString(record.user_request, "arguments.user_request");
  const generatedAt = expectOptionalString(record.generated_at, "arguments.generated_at");
  const constraints = expectOptionalStringArray(record.constraints, "arguments.constraints");

  validateVersionConsistency(request, audioVersion);

  return {
    audioVersion,
    analysisReport,
    semanticProfile,
    userRequest,
    ...(generatedAt === undefined ? {} : { generatedAt }),
    ...(constraints === undefined ? {} : { constraints }),
  };
}

export const planEditsTool: ToolDefinition<PlanEditsArguments, Record<string, unknown>> = {
  descriptor: {
    name: "plan_edits",
    description: "Build a deterministic edit plan from audio analysis and semantic evidence.",
    backing_module: "planning",
    required_arguments: ["audio_version", "analysis_report", "semantic_profile", "user_request"],
    optional_arguments: ["generated_at", "constraints"],
    error_codes: [
      "invalid_arguments",
      "provenance_mismatch",
      "invalid_result_contract",
      "handler_failed",
    ],
  },
  validateArguments,
  async execute(args, context) {
    const editPlan = assertToolResultEditPlan(
      await context.runtime.planEdits({
        userRequest: args.userRequest,
        audioVersion: args.audioVersion,
        analysisReport: args.analysisReport,
        semanticProfile: args.semanticProfile,
        ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
        ...(args.constraints === undefined ? {} : { constraints: args.constraints }),
      }),
      "result.edit_plan",
    );

    return {
      result: {
        edit_plan: editPlan as unknown as Record<string, unknown>,
      },
    };
  },
};
