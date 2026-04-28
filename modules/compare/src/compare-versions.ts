import { estimatePitchCenter } from "@audio-language-interface/analysis";

import { computeAnalysisMetricDeltas, createMeasurementContext } from "./deltas.js";
import { evaluateGoalAlignment } from "./goal-alignment.js";
import {
  assertAnalysisMatchesVersion,
  assertComparableAsset,
  assertEditPlanMatchesBaseline,
} from "./provenance.js";
import { detectAnalysisRegressions } from "./regressions.js";
import { buildComparisonReport } from "./report-builder.js";
import { deriveSemanticDeltas } from "./semantic-deltas.js";
import { evaluateStructuredVerification } from "./structured-verification.js";
import type { CompareVersionsOptions, ComparisonReport } from "./types.js";
import { assertValidComparisonReport } from "./utils/schema.js";

/** Compares two versions using paired analysis reports and emits a ComparisonReport. */
export function compareVersions(options: CompareVersionsOptions): ComparisonReport {
  assertDistinctRefs(
    options.baselineVersion.version_id,
    options.candidateVersion.version_id,
    "version",
  );
  assertComparableAsset(
    options.baselineVersion.asset_id,
    options.candidateVersion.asset_id,
    "version",
  );
  assertAnalysisMatchesVersion(options.baselineAnalysis, options.baselineVersion, "baseline");
  assertAnalysisMatchesVersion(options.candidateAnalysis, options.candidateVersion, "candidate");

  if (options.editPlan !== undefined) {
    assertEditPlanMatchesBaseline(options.editPlan, options.baselineVersion, "AudioVersion");
  }

  const shouldEstimatePitch = shouldEstimatePitchMetrics(options);
  const baselinePitchCenterHz =
    shouldEstimatePitch && options.workspaceRoot !== undefined
      ? resolvePitchCenterHz(options.baselineVersion, options.workspaceRoot)
      : undefined;
  const candidatePitchCenterHz =
    shouldEstimatePitch && options.workspaceRoot !== undefined
      ? resolvePitchCenterHz(options.candidateVersion, options.workspaceRoot)
      : undefined;
  const baselineMeasurements = createMeasurementContext({
    version: options.baselineVersion,
    analysis: options.baselineAnalysis,
    ...(baselinePitchCenterHz === undefined ? {} : { pitchCenterHz: baselinePitchCenterHz }),
  });
  const candidateMeasurements = createMeasurementContext({
    version: options.candidateVersion,
    analysis: options.candidateAnalysis,
    ...(candidatePitchCenterHz === undefined ? {} : { pitchCenterHz: candidatePitchCenterHz }),
  });

  const metricDeltas = computeAnalysisMetricDeltas(baselineMeasurements, candidateMeasurements);
  const semanticDeltas = deriveSemanticDeltas(
    baselineMeasurements,
    candidateMeasurements,
    metricDeltas,
  );
  const regressions = detectAnalysisRegressions(
    baselineMeasurements,
    candidateMeasurements,
    metricDeltas,
    options.editPlan === undefined ? {} : { editPlan: options.editPlan },
  );
  const structuredVerification =
    options.editPlan?.verification_targets === undefined
      ? undefined
      : evaluateStructuredVerification(
          options.editPlan.verification_targets,
          baselineMeasurements,
          candidateMeasurements,
          metricDeltas,
          semanticDeltas,
          regressions,
        );
  const goalAlignment =
    structuredVerification?.goalAlignment ??
    (options.editPlan === undefined
      ? undefined
      : evaluateGoalAlignment(
          options.editPlan.goals,
          baselineMeasurements,
          candidateMeasurements,
          metricDeltas,
        ));

  const report = buildComparisonReport({
    baselineRefType: "version",
    baselineRefId: options.baselineVersion.version_id,
    candidateRefType: "version",
    candidateRefId: options.candidateVersion.version_id,
    generatedAt: normalizeTimestamp(options.generatedAt),
    metricSource: "analysis_reports",
    metricDeltas,
    semanticDeltas,
    regressions,
    ...(goalAlignment === undefined ? {} : { goalAlignment }),
    ...(structuredVerification === undefined
      ? {}
      : { verificationResults: structuredVerification.verificationResults }),
    ...(options.comparisonId === undefined ? {} : { comparisonId: options.comparisonId }),
  });

  assertValidComparisonReport(report);
  return report;
}

function shouldEstimatePitchMetrics(options: CompareVersionsOptions): boolean {
  const verificationTargets = options.editPlan?.verification_targets ?? [];

  if (
    verificationTargets.some(
      (target) =>
        typeof target === "object" &&
        target !== null &&
        target.metric === "derived.pitch_center_hz",
    )
  ) {
    return true;
  }

  return (
    options.editPlan?.goals.some((goal) => {
      const normalized = goal.toLowerCase();
      return normalized.includes("pitch") || normalized.includes("semitone");
    }) === true
  );
}

function resolvePitchCenterHz(
  version: CompareVersionsOptions["baselineVersion"],
  workspaceRoot: string,
) {
  const estimate = estimatePitchCenter(version, { workspaceRoot });
  return estimate.frequency_hz;
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
