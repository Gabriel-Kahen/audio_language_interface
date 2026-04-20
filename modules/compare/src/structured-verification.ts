import { combineGoalStatuses } from "./goal-alignment.js";
import type {
  AnalysisMeasurements,
  GoalAlignment,
  GoalStatus,
  MetricDelta,
  RegressionWarning,
  SemanticDelta,
  VerificationTarget,
  VerificationTargetResult,
} from "./types.js";

export interface StructuredVerificationEvaluation {
  verificationResults: VerificationTargetResult[];
  goalAlignment: GoalAlignment[];
}

export function evaluateStructuredVerification(
  verificationTargets: Array<string | VerificationTarget>,
  baseline: AnalysisMeasurements,
  candidate: AnalysisMeasurements,
  metricDeltas: MetricDelta[],
  semanticDeltas: SemanticDelta[],
  regressions: RegressionWarning[],
): StructuredVerificationEvaluation | undefined {
  const structuredTargets = verificationTargets.filter(isStructuredVerificationTarget);

  if (structuredTargets.length === 0) {
    return undefined;
  }

  const verificationResults = structuredTargets.map((target) =>
    evaluateVerificationTarget(
      target,
      baseline,
      candidate,
      metricDeltas,
      semanticDeltas,
      regressions,
    ),
  );

  return {
    verificationResults,
    goalAlignment: deriveGoalAlignment(verificationResults),
  };
}

function evaluateVerificationTarget(
  target: VerificationTarget,
  _baseline: AnalysisMeasurements,
  candidate: AnalysisMeasurements,
  metricDeltas: MetricDelta[],
  semanticDeltas: SemanticDelta[],
  regressions: RegressionWarning[],
): VerificationTargetResult {
  switch (target.kind) {
    case "analysis_metric":
      return evaluateAnalysisMetricTarget(target, candidate, metricDeltas);
    case "semantic_delta":
      return evaluateSemanticTarget(target, semanticDeltas);
    case "regression_guard":
      return evaluateRegressionGuard(target, regressions);
  }
}

function evaluateAnalysisMetricTarget(
  target: VerificationTarget,
  candidate: AnalysisMeasurements,
  metricDeltas: MetricDelta[],
): VerificationTargetResult {
  if (target.metric === undefined) {
    return {
      ...target,
      status: "unknown",
      evidence: "Structured verification target is missing its metric path.",
    };
  }

  if (target.comparison === "increase_by" || target.comparison === "decrease_by") {
    const observedDelta = metricDeltas.find((delta) => delta.metric === target.metric)?.delta;
    const status = classifyDirectionalMetric(
      target.comparison,
      observedDelta,
      target.threshold,
      target.tolerance,
    );

    return {
      ...target,
      status,
      ...(observedDelta === undefined ? {} : { observed_delta: observedDelta }),
      evidence:
        observedDelta === undefined
          ? `Metric delta ${target.metric} was unavailable for structured verification.`
          : `Observed ${target.metric} delta was ${observedDelta.toFixed(3)}.`,
    };
  }

  const observedValue = readMeasurement(candidate, target.metric);
  const missingMetricHumCleared =
    target.metric === "artifacts.hum_level_dbfs" &&
    target.comparison === "at_most" &&
    observedValue === undefined &&
    candidate.artifacts.hum_detected === false;
  const missingMetricClickCleared =
    (target.metric === "artifacts.click_count" ||
      target.metric === "artifacts.click_rate_per_second") &&
    target.comparison === "at_most" &&
    observedValue === undefined &&
    candidate.artifacts.click_detected === false;

  if (missingMetricHumCleared) {
    return {
      ...target,
      status: "met",
      evidence:
        "Candidate hum detector cleared and no direct hum level remained available, so the hum target is treated as satisfied.",
    };
  }

  if (missingMetricClickCleared) {
    return {
      ...target,
      status: "met",
      evidence:
        "Candidate click detector cleared and no direct click activity remained available, so the click target is treated as satisfied.",
    };
  }

  const status = classifyAbsoluteMetric(
    target.comparison,
    observedValue,
    target.threshold,
    target.tolerance,
  );

  return {
    ...target,
    status,
    ...(observedValue === undefined ? {} : { observed_value: observedValue }),
    evidence:
      observedValue === undefined
        ? `Metric ${target.metric} was unavailable on candidate analysis measurements.`
        : `Observed ${target.metric} value was ${observedValue.toFixed(3)}.`,
  };
}

function evaluateSemanticTarget(
  target: VerificationTarget,
  semanticDeltas: SemanticDelta[],
): VerificationTargetResult {
  if (target.semantic_label === undefined) {
    return {
      ...target,
      status: "unknown",
      evidence: "Structured verification target is missing its semantic label.",
    };
  }

  const match = semanticDeltas.find((delta) => delta.label === target.semantic_label);

  if (target.comparison === "present") {
    return {
      ...target,
      status: match === undefined ? "not_met" : match.confidence >= 0.65 ? "met" : "mostly_met",
      ...(match === undefined
        ? {}
        : { observed_confidence: match.confidence, evidence: match.evidence }),
      ...(match === undefined
        ? { evidence: `Semantic delta ${target.semantic_label} was absent.` }
        : {}),
    };
  }

  if (target.comparison === "absent") {
    return {
      ...target,
      status: match === undefined ? "met" : match.confidence >= 0.65 ? "not_met" : "mostly_met",
      ...(match === undefined
        ? { evidence: `Semantic delta ${target.semantic_label} was absent.` }
        : {}),
      ...(match === undefined
        ? {}
        : { observed_confidence: match.confidence, evidence: match.evidence }),
    };
  }

  return {
    ...target,
    status: "unknown",
    evidence: `Unsupported semantic comparison ${target.comparison}.`,
  };
}

function evaluateRegressionGuard(
  target: VerificationTarget,
  regressions: RegressionWarning[],
): VerificationTargetResult {
  if (target.regression_kind === undefined) {
    return {
      ...target,
      status: "unknown",
      evidence: "Structured verification target is missing its regression kind.",
    };
  }

  const match = regressions.find((regression) => regression.kind === target.regression_kind);

  if (target.comparison === "absent") {
    return {
      ...target,
      status: match === undefined ? "met" : match.severity >= 0.4 ? "not_met" : "mostly_met",
      ...(match === undefined
        ? { evidence: `Regression ${target.regression_kind} was absent.` }
        : {}),
      ...(match === undefined
        ? {}
        : { observed_severity: match.severity, evidence: match.description }),
    };
  }

  if (target.comparison === "present") {
    return {
      ...target,
      status: match === undefined ? "not_met" : match.severity >= 0.4 ? "met" : "mostly_met",
      ...(match === undefined
        ? { evidence: `Regression ${target.regression_kind} was absent.` }
        : {}),
      ...(match === undefined
        ? {}
        : { observed_severity: match.severity, evidence: match.description }),
    };
  }

  return {
    ...target,
    status: "unknown",
    evidence: `Unsupported regression comparison ${target.comparison}.`,
  };
}

function classifyDirectionalMetric(
  comparison: VerificationTarget["comparison"],
  observedDelta: number | undefined,
  threshold: number | undefined,
  tolerance: number | undefined,
): GoalStatus {
  if (observedDelta === undefined || threshold === undefined) {
    return "unknown";
  }

  const softThreshold = calculateSoftThreshold(threshold, tolerance);

  if (comparison === "increase_by") {
    if (observedDelta >= threshold) {
      return "met";
    }

    if (observedDelta >= softThreshold) {
      return "mostly_met";
    }

    return "not_met";
  }

  if (comparison === "decrease_by") {
    if (observedDelta <= -threshold) {
      return "met";
    }

    if (observedDelta <= -softThreshold) {
      return "mostly_met";
    }

    return "not_met";
  }

  return "unknown";
}

function classifyAbsoluteMetric(
  comparison: VerificationTarget["comparison"],
  observedValue: number | undefined,
  threshold: number | undefined,
  tolerance: number | undefined,
): GoalStatus {
  if (observedValue === undefined || threshold === undefined) {
    return "unknown";
  }

  if (comparison === "at_most") {
    if (observedValue <= threshold) {
      return "met";
    }

    if (tolerance !== undefined && observedValue <= threshold + tolerance) {
      return "mostly_met";
    }

    return "not_met";
  }

  if (comparison === "at_least") {
    if (observedValue >= threshold) {
      return "met";
    }

    if (tolerance !== undefined && observedValue >= threshold - tolerance) {
      return "mostly_met";
    }

    return "not_met";
  }

  if (comparison === "within") {
    if (tolerance === undefined) {
      return "unknown";
    }

    const distance = Math.abs(observedValue - threshold);
    if (distance <= tolerance) {
      return "met";
    }

    if (distance <= tolerance * 2) {
      return "mostly_met";
    }

    return "not_met";
  }

  return "unknown";
}

function calculateSoftThreshold(threshold: number, tolerance: number | undefined): number {
  if (tolerance !== undefined) {
    return Math.max(0, threshold - tolerance);
  }

  return threshold * 0.6;
}

function deriveGoalAlignment(results: VerificationTargetResult[]): GoalAlignment[] {
  const grouped = new Map<string, GoalStatus[]>();

  for (const result of results) {
    const statuses = grouped.get(result.goal) ?? [];
    statuses.push(result.status);
    grouped.set(result.goal, statuses);
  }

  return [...grouped.entries()].map(([goal, statuses]) => ({
    goal,
    status: combineGoalStatuses(statuses),
  }));
}

function readMeasurement(
  measurements: AnalysisMeasurements,
  metricPath: string,
): number | undefined {
  const value = metricPath.split(".").reduce<unknown>((current, segment) => {
    if (current === undefined || current === null || typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, measurements);

  return typeof value === "number" ? value : undefined;
}

function isStructuredVerificationTarget(
  target: string | VerificationTarget,
): target is VerificationTarget {
  return typeof target === "object" && target !== null;
}
