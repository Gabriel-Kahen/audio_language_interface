import { computeAnalysisMetricDeltas, computeRenderMetricDeltas } from "./deltas.js";
import { evaluateGoalAlignment } from "./goal-alignment.js";
import {
  assertAnalysisMatchesRender,
  assertComparableAsset,
  assertEditPlanMatchesBaseline,
} from "./provenance.js";
import { detectAnalysisRegressions, detectRenderRegressions } from "./regressions.js";
import { buildComparisonReport } from "./report-builder.js";
import { deriveSemanticDeltas } from "./semantic-deltas.js";
import { evaluateStructuredVerification } from "./structured-verification.js";
import type {
  CompareRendersOptions,
  ComparisonReport,
  GoalAlignment,
  SemanticDelta,
  VerificationTargetResult,
} from "./types.js";
import { assertValidComparisonReport } from "./utils/schema.js";

/**
 * Compares two render artifacts. With paired analysis reports it reuses analysis-style metrics;
 * without them it falls back to explicit render metadata and loudness-summary deltas only.
 */
export function compareRenders(options: CompareRendersOptions): ComparisonReport {
  assertDistinctRefs(options.baselineRender.render_id, options.candidateRender.render_id, "render");
  assertComparableAsset(
    options.baselineRender.asset_id,
    options.candidateRender.asset_id,
    "render",
  );

  const hasBaselineAnalysis = options.baselineAnalysis !== undefined;
  const hasCandidateAnalysis = options.candidateAnalysis !== undefined;

  if (hasBaselineAnalysis !== hasCandidateAnalysis) {
    throw new Error(
      "compareRenders requires both baselineAnalysis and candidateAnalysis when analysis-backed comparison is requested.",
    );
  }

  if (options.editPlan !== undefined) {
    assertEditPlanMatchesBaseline(options.editPlan, options.baselineRender, "RenderArtifact");
  }

  if (options.baselineAnalysis !== undefined && options.candidateAnalysis !== undefined) {
    assertAnalysisMatchesRender(options.baselineAnalysis, options.baselineRender, "baseline");
    assertAnalysisMatchesRender(options.candidateAnalysis, options.candidateRender, "candidate");
  }

  const renderMetricDeltas = computeRenderMetricDeltas(
    options.baselineRender,
    options.candidateRender,
  );
  const renderRegressions = detectRenderRegressions(
    options.baselineRender,
    options.candidateRender,
    renderMetricDeltas,
  );

  let metricDeltas = renderMetricDeltas;
  let semanticDeltas: SemanticDelta[] = [];
  let goalAlignment: GoalAlignment[] | undefined;
  let verificationResults: VerificationTargetResult[] | undefined;

  if (options.baselineAnalysis !== undefined && options.candidateAnalysis !== undefined) {
    metricDeltas = computeAnalysisMetricDeltas(
      options.baselineAnalysis.measurements,
      options.candidateAnalysis.measurements,
    );
    semanticDeltas = deriveSemanticDeltas(
      options.baselineAnalysis.measurements,
      options.candidateAnalysis.measurements,
      metricDeltas,
    );
  }

  const analysisRegressions =
    options.baselineAnalysis !== undefined && options.candidateAnalysis !== undefined
      ? detectAnalysisRegressions(
          options.baselineAnalysis.measurements,
          options.candidateAnalysis.measurements,
          metricDeltas,
          options.editPlan === undefined ? {} : { editPlan: options.editPlan },
        )
      : [];
  const combinedRegressions = [...analysisRegressions, ...renderRegressions];

  if (options.baselineAnalysis !== undefined && options.candidateAnalysis !== undefined) {
    const structuredVerification =
      options.editPlan?.verification_targets === undefined
        ? undefined
        : evaluateStructuredVerification(
            options.editPlan.verification_targets,
            options.baselineAnalysis.measurements,
            options.candidateAnalysis.measurements,
            metricDeltas,
            semanticDeltas,
            combinedRegressions,
          );
    goalAlignment =
      structuredVerification?.goalAlignment ??
      (options.editPlan === undefined
        ? undefined
        : evaluateGoalAlignment(
            options.editPlan.goals,
            options.baselineAnalysis.measurements,
            options.candidateAnalysis.measurements,
            metricDeltas,
          ));
    verificationResults = structuredVerification?.verificationResults;
  }

  const report = buildComparisonReport({
    baselineRefType: "render",
    baselineRefId: options.baselineRender.render_id,
    candidateRefType: "render",
    candidateRefId: options.candidateRender.render_id,
    generatedAt: normalizeTimestamp(options.generatedAt),
    metricSource:
      options.baselineAnalysis !== undefined && options.candidateAnalysis !== undefined
        ? "analysis_reports"
        : "render_artifacts",
    metricDeltas,
    semanticDeltas,
    regressions: combinedRegressions,
    ...(goalAlignment === undefined ? {} : { goalAlignment }),
    ...(verificationResults === undefined ? {} : { verificationResults }),
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
