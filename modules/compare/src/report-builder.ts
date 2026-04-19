import { createHash } from "node:crypto";

import {
  CONTRACT_SCHEMA_VERSION,
  type ComparisonEvaluationBasis,
  type ComparisonMetricSource,
  type ComparisonRefType,
  type ComparisonReport,
  type GoalAlignment,
  type MetricDelta,
  type RegressionWarning,
  type SemanticDelta,
  type VerificationTargetResult,
} from "./types.js";

export interface BuildComparisonReportOptions {
  baselineRefType: ComparisonRefType;
  baselineRefId: string;
  candidateRefType: ComparisonRefType;
  candidateRefId: string;
  generatedAt: string;
  metricSource: ComparisonMetricSource;
  metricDeltas: MetricDelta[];
  semanticDeltas: SemanticDelta[];
  regressions: RegressionWarning[];
  goalAlignment?: GoalAlignment[];
  verificationResults?: VerificationTargetResult[];
  comparisonId?: string;
}

/** Builds a contract-shaped ComparisonReport and synthesizes a compact summary sentence. */
export function buildComparisonReport(options: BuildComparisonReportOptions): ComparisonReport {
  const report: ComparisonReport = {
    schema_version: CONTRACT_SCHEMA_VERSION,
    comparison_id:
      options.comparisonId ??
      createComparisonId(
        options.baselineRefType,
        options.baselineRefId,
        options.candidateRefType,
        options.candidateRefId,
      ),
    baseline: {
      ref_type: options.baselineRefType,
      ref_id: options.baselineRefId,
    },
    candidate: {
      ref_type: options.candidateRefType,
      ref_id: options.candidateRefId,
    },
    generated_at: options.generatedAt,
    evaluation_basis: createEvaluationBasis(options),
    metric_deltas: options.metricDeltas,
    ...(options.semanticDeltas.length === 0 ? {} : { semantic_deltas: options.semanticDeltas }),
    ...(options.regressions.length === 0 ? {} : { regressions: options.regressions }),
    ...(options.verificationResults === undefined || options.verificationResults.length === 0
      ? {}
      : { verification_results: options.verificationResults }),
    ...(options.goalAlignment === undefined || options.goalAlignment.length === 0
      ? {}
      : { goal_alignment: options.goalAlignment }),
    summary: {
      plain_text: buildSummary(
        options.semanticDeltas,
        options.regressions,
        options.goalAlignment,
        options.verificationResults,
      ),
    },
  };

  return report;
}

function createComparisonId(
  baselineRefType: ComparisonRefType,
  baselineRefId: string,
  candidateRefType: ComparisonRefType,
  candidateRefId: string,
): string {
  const digest = createHash("sha256")
    .update(baselineRefType)
    .update("|")
    .update(baselineRefId)
    .update("|")
    .update(candidateRefType)
    .update("|")
    .update(candidateRefId)
    .digest("hex")
    .slice(0, 24)
    .toUpperCase();

  return `compare_${digest}`;
}

function buildSummary(
  semanticDeltas: SemanticDelta[],
  regressions: RegressionWarning[],
  goalAlignment: GoalAlignment[] | undefined,
  verificationResults: VerificationTargetResult[] | undefined,
): string {
  const clauses: string[] = [];

  if (semanticDeltas.length > 0) {
    clauses.push(
      `Measured changes suggest ${semanticDeltas
        .slice(0, 2)
        .map((item) => item.label.replace(/_/g, " "))
        .join(" and ")}.`,
    );
  } else {
    clauses.push("Measured changes were computed without a strong qualitative shift.");
  }

  if (verificationResults !== undefined && verificationResults.length > 0) {
    const metCount = verificationResults.filter(
      (item) => item.status === "met" || item.status === "mostly_met",
    ).length;
    clauses.push(
      `${metCount} of ${verificationResults.length} structured verification checks were satisfied or mostly satisfied.`,
    );
  } else if (goalAlignment !== undefined && goalAlignment.length > 0) {
    const metCount = goalAlignment.filter(
      (item) => item.status === "met" || item.status === "mostly_met",
    ).length;
    clauses.push(
      `${metCount} of ${goalAlignment.length} requested goals were satisfied or mostly satisfied.`,
    );
  }

  if (regressions.length > 0) {
    clauses.push(
      `Regression warnings: ${regressions.map((item) => item.kind.replace(/_/g, " ")).join(", ")}.`,
    );
  } else {
    clauses.push("No regression warnings were detected.");
  }

  return clauses.join(" ");
}

function createEvaluationBasis(
  options: Pick<
    BuildComparisonReportOptions,
    "metricSource" | "goalAlignment" | "verificationResults"
  >,
): ComparisonEvaluationBasis {
  if (options.verificationResults !== undefined && options.verificationResults.length > 0) {
    return {
      metric_source: options.metricSource,
      goal_evaluation_source: "structured_verification",
      authoritative_signal: "verification_results",
    };
  }

  if (options.goalAlignment !== undefined && options.goalAlignment.length > 0) {
    return {
      metric_source: options.metricSource,
      goal_evaluation_source: "heuristic_goal_alignment",
      authoritative_signal: "goal_alignment",
    };
  }

  return {
    metric_source: options.metricSource,
    goal_evaluation_source: "none",
    authoritative_signal: "metric_deltas",
  };
}
