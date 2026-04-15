import type {
  AnalysisReport,
  AudioVersion,
  ComparisonReport,
  EditPlan,
} from "@audio-language-interface/compare";

import { ToolInputError } from "../errors.js";
import type { ToolDefinition } from "../types.js";
import {
  assertToolResultComparisonReport,
  expectAnalysisReport,
  expectAudioVersion,
  expectEditPlan,
  expectOptionalString,
  expectRecord,
} from "../validation.js";

interface CompareVersionsArguments {
  baselineVersion: AudioVersion;
  candidateVersion: AudioVersion;
  baselineAnalysis: AnalysisReport;
  candidateAnalysis: AnalysisReport;
  editPlan?: EditPlan;
  comparisonId?: string;
  generatedAt?: string;
}

function validateAnalysisProvenance(
  fieldName: string,
  version: AudioVersion,
  analysis: AnalysisReport,
): void {
  if (version.asset_id !== analysis.asset_id) {
    throw new ToolInputError(
      "invalid_arguments",
      `${fieldName}.asset_id must match its paired AudioVersion asset_id.`,
      { field: fieldName },
    );
  }

  if (version.version_id !== analysis.version_id) {
    throw new ToolInputError(
      "invalid_arguments",
      `${fieldName}.version_id must match its paired AudioVersion version_id.`,
      { field: fieldName },
    );
  }
}

function validateEditPlanProvenance(
  editPlan: EditPlan,
  baselineVersion: AudioVersion,
  candidateVersion: AudioVersion,
): void {
  if (
    editPlan.asset_id !== baselineVersion.asset_id ||
    editPlan.asset_id !== candidateVersion.asset_id
  ) {
    throw new ToolInputError(
      "invalid_arguments",
      "arguments.edit_plan.asset_id must match both compared AudioVersion asset_id values.",
      { field: "arguments.edit_plan.asset_id" },
    );
  }

  if (editPlan.version_id !== baselineVersion.version_id) {
    throw new ToolInputError(
      "invalid_arguments",
      "arguments.edit_plan.version_id must match arguments.baseline_version.version_id.",
      { field: "arguments.edit_plan.version_id" },
    );
  }
}

function validateArguments(value: unknown): CompareVersionsArguments {
  const record = expectRecord(value, "arguments");
  const editPlan =
    record.edit_plan === undefined
      ? undefined
      : expectEditPlan(record.edit_plan, "arguments.edit_plan");
  const comparisonId = expectOptionalString(record.comparison_id, "arguments.comparison_id");
  const generatedAt = expectOptionalString(record.generated_at, "arguments.generated_at");

  const baselineVersion = expectAudioVersion(record.baseline_version, "arguments.baseline_version");
  const candidateVersion = expectAudioVersion(
    record.candidate_version,
    "arguments.candidate_version",
  );
  const baselineAnalysis = expectAnalysisReport(
    record.baseline_analysis,
    "arguments.baseline_analysis",
  );
  const candidateAnalysis = expectAnalysisReport(
    record.candidate_analysis,
    "arguments.candidate_analysis",
  );

  validateAnalysisProvenance("arguments.baseline_analysis", baselineVersion, baselineAnalysis);
  validateAnalysisProvenance("arguments.candidate_analysis", candidateVersion, candidateAnalysis);

  if (editPlan !== undefined) {
    validateEditPlanProvenance(editPlan, baselineVersion, candidateVersion);
  }

  return {
    baselineVersion,
    candidateVersion,
    baselineAnalysis,
    candidateAnalysis,
    ...(editPlan === undefined ? {} : { editPlan }),
    ...(comparisonId === undefined ? {} : { comparisonId }),
    ...(generatedAt === undefined ? {} : { generatedAt }),
  };
}

export const compareVersionsTool: ToolDefinition<
  CompareVersionsArguments,
  Record<string, unknown>
> = {
  descriptor: {
    name: "compare_versions",
    description: "Compare baseline and candidate versions using paired analyses.",
    backing_module: "compare",
    required_arguments: [
      "baseline_version",
      "candidate_version",
      "baseline_analysis",
      "candidate_analysis",
    ],
    optional_arguments: ["edit_plan", "comparison_id", "generated_at"],
  },
  validateArguments,
  async execute(args, context) {
    const comparisonReport: ComparisonReport = assertToolResultComparisonReport(
      context.runtime.compareVersions({
        baselineVersion: args.baselineVersion,
        candidateVersion: args.candidateVersion,
        baselineAnalysis: args.baselineAnalysis,
        candidateAnalysis: args.candidateAnalysis,
        ...(args.editPlan === undefined ? {} : { editPlan: args.editPlan }),
        ...(args.comparisonId === undefined ? {} : { comparisonId: args.comparisonId }),
        ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
      }),
      "result.comparison_report",
    );

    return {
      result: {
        comparison_report: comparisonReport as unknown as Record<string, unknown>,
      },
    };
  },
};
