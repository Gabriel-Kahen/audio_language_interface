import { computeAnalysisMetricDeltas } from "./deltas.js";
import { evaluateGoalAlignment } from "./goal-alignment.js";
import { detectAnalysisRegressions } from "./regressions.js";
import { buildComparisonReport } from "./report-builder.js";
import { deriveSemanticDeltas } from "./semantic-deltas.js";
import type { CompareVersionsOptions, ComparisonReport } from "./types.js";
import { assertValidComparisonReport } from "./utils/schema.js";

/** Compares two versions using paired analysis reports and emits a ComparisonReport. */
export function compareVersions(options: CompareVersionsOptions): ComparisonReport {
  assertDistinctRefs(
    options.baselineVersion.version_id,
    options.candidateVersion.version_id,
    "version",
  );

  const metricDeltas = computeAnalysisMetricDeltas(
    options.baselineAnalysis.measurements,
    options.candidateAnalysis.measurements,
  );
  const semanticDeltas = deriveSemanticDeltas(
    options.baselineAnalysis.measurements,
    options.candidateAnalysis.measurements,
    metricDeltas,
  );
  const regressions = detectAnalysisRegressions(
    options.baselineAnalysis.measurements,
    options.candidateAnalysis.measurements,
    metricDeltas,
  );
  const goalAlignment =
    options.editPlan === undefined
      ? undefined
      : evaluateGoalAlignment(
          options.editPlan.goals,
          options.baselineAnalysis.measurements,
          options.candidateAnalysis.measurements,
          metricDeltas,
        );

  const report = buildComparisonReport({
    baselineRefType: "version",
    baselineRefId: options.baselineVersion.version_id,
    candidateRefType: "version",
    candidateRefId: options.candidateVersion.version_id,
    generatedAt: normalizeTimestamp(options.generatedAt),
    metricDeltas,
    semanticDeltas,
    regressions,
    ...(goalAlignment === undefined ? {} : { goalAlignment }),
    ...(options.comparisonId === undefined ? {} : { comparisonId: options.comparisonId }),
  });

  assertValidComparisonReport(report);
  return report;
}

function assertDistinctRefs(baselineId: string, candidateId: string, refType: string): void {
  if (baselineId === candidateId) {
    throw new Error(`Baseline and candidate ${refType} references must differ.`);
  }
}

function normalizeTimestamp(value: string | Date | undefined): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value ?? new Date().toISOString();
}
