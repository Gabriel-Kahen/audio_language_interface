import type { AnalysisMeasurements, GoalAlignment, GoalStatus, MetricDelta } from "./types.js";

/**
 * Scores free-form goal strings with simple keyword matching against measured deltas.
 * This is intentionally heuristic and should not be treated as a general natural-language evaluator.
 */
export function evaluateGoalAlignment(
  goals: string[],
  baseline: AnalysisMeasurements,
  candidate: AnalysisMeasurements,
  metricDeltas: MetricDelta[],
): GoalAlignment[] {
  return goals.map((goal) => ({
    goal,
    status: evaluateGoal(goal, baseline, candidate, metricDeltas),
  }));
}

function evaluateGoal(
  goal: string,
  baseline: AnalysisMeasurements,
  candidate: AnalysisMeasurements,
  metricDeltas: MetricDelta[],
): GoalStatus {
  const normalizedGoal = goal.toLowerCase();

  if (matchesAny(normalizedGoal, ["harsh", "upper-mid"])) {
    return classifySingleMetric(getDelta(metricDeltas, "spectral_balance.high_band_db"), -1, -0.4);
  }

  if (matchesAny(normalizedGoal, ["bright", "darker", "darken"])) {
    return classifySingleMetric(
      getDelta(metricDeltas, "spectral_balance.spectral_centroid_hz"),
      -120,
      -40,
    );
  }

  if (matchesAny(normalizedGoal, ["punch", "transient", "attack"])) {
    const crestFactorDelta = getDelta(metricDeltas, "dynamics.crest_factor_db");
    const transientDensityDelta = getDelta(metricDeltas, "dynamics.transient_density_per_second");

    if (crestFactorDelta === undefined || transientDensityDelta === undefined) {
      return "unknown";
    }

    if (crestFactorDelta >= -0.3 && transientDensityDelta >= -0.05) {
      return "met";
    }

    if (crestFactorDelta >= -0.75 && transientDensityDelta >= -0.15) {
      return "mostly_met";
    }

    return "not_met";
  }

  if (matchesAny(normalizedGoal, ["wide", "wider"])) {
    return classifySingleMetric(getDelta(metricDeltas, "stereo.width"), 0.08, 0.03);
  }

  if (matchesAny(normalizedGoal, ["noise", "clean", "denoise"])) {
    return classifySingleMetric(getDelta(metricDeltas, "artifacts.noise_floor_dbfs"), -3, -1);
  }

  if (matchesAny(normalizedGoal, ["clip", "clipping"])) {
    if (!baseline.artifacts.clipping_detected && !candidate.artifacts.clipping_detected) {
      return "met";
    }

    return candidate.artifacts.clipping_detected ? "not_met" : "met";
  }

  if (matchesAny(normalizedGoal, ["loud", "quieter", "volume"])) {
    const delta = getDelta(metricDeltas, "levels.integrated_lufs");
    if (delta === undefined) {
      return "unknown";
    }

    return Math.abs(delta) <= 1 ? "met" : Math.abs(delta) <= 2 ? "mostly_met" : "not_met";
  }

  return "unknown";
}

function classifySingleMetric(
  delta: number | undefined,
  metThreshold: number,
  mostlyMetThreshold: number,
): GoalStatus {
  if (delta === undefined) {
    return "unknown";
  }

  if (metThreshold >= mostlyMetThreshold) {
    if (delta >= metThreshold) {
      return "met";
    }

    if (delta >= mostlyMetThreshold) {
      return "mostly_met";
    }
  } else {
    if (delta <= metThreshold) {
      return "met";
    }

    if (delta <= mostlyMetThreshold) {
      return "mostly_met";
    }
  }

  return "not_met";
}

function getDelta(metricDeltas: MetricDelta[], metric: string): number | undefined {
  return metricDeltas.find((item) => item.metric === metric)?.delta;
}

function matchesAny(value: string, fragments: string[]): boolean {
  return fragments.some((fragment) => value.includes(fragment));
}
