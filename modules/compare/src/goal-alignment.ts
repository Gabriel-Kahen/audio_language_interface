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

  if (matchesAny(normalizedGoal, ["harsh", "upper-mid", "upper mid", "aggressive", "smoother"])) {
    return classifyHarshnessReduction(metricDeltas);
  }

  if (
    matchesAny(normalizedGoal, ["bright", "brightness", "darker", "darken", "top end", "top-end"])
  ) {
    return classifyBrightnessReduction(metricDeltas);
  }

  if (matchesAny(normalizedGoal, ["punch", "transient", "attack", "impact", "snap"])) {
    return classifyPunchPreservation(metricDeltas);
  }

  if (matchesAny(normalizedGoal, ["wide", "wider"])) {
    return classifySingleMetric(getDelta(metricDeltas, "stereo.width"), 0.08, 0.03);
  }

  if (
    matchesCleanupPhrase(normalizedGoal) ||
    matchesAny(normalizedGoal, ["noise", "noisy", "cleaner", "cleanup", "denoise", "hiss", "hum"])
  ) {
    return classifyCleanupGoal(baseline, candidate, metricDeltas);
  }

  if (matchesAny(normalizedGoal, ["clean", "better", "improve"])) {
    return "unknown";
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

function classifyBrightnessReduction(metricDeltas: MetricDelta[]): GoalStatus {
  const centroidDelta = getDelta(metricDeltas, "spectral_balance.spectral_centroid_hz");
  const highBandDelta = getDelta(metricDeltas, "spectral_balance.high_band_db");

  if (centroidDelta === undefined || highBandDelta === undefined) {
    return "unknown";
  }

  if (centroidDelta <= -120 && highBandDelta <= -0.75) {
    return "met";
  }

  if (centroidDelta <= -40 && highBandDelta <= -0.25) {
    return "mostly_met";
  }

  return "not_met";
}

function classifyHarshnessReduction(metricDeltas: MetricDelta[]): GoalStatus {
  const centroidDelta = getDelta(metricDeltas, "spectral_balance.spectral_centroid_hz");
  const highBandDelta = getDelta(metricDeltas, "spectral_balance.high_band_db");

  if (centroidDelta === undefined || highBandDelta === undefined) {
    return "unknown";
  }

  if (highBandDelta <= -1 && centroidDelta <= -80) {
    return "met";
  }

  if (highBandDelta <= -0.4 && centroidDelta <= -30) {
    return "mostly_met";
  }

  return "not_met";
}

function classifyPunchPreservation(metricDeltas: MetricDelta[]): GoalStatus {
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

function classifyCleanupGoal(
  baseline: AnalysisMeasurements,
  candidate: AnalysisMeasurements,
  metricDeltas: MetricDelta[],
): GoalStatus {
  const noiseFloorDelta = getDelta(metricDeltas, "artifacts.noise_floor_dbfs");

  if (noiseFloorDelta !== undefined) {
    if (noiseFloorDelta <= -3) {
      return "met";
    }

    if (noiseFloorDelta <= -1) {
      return "mostly_met";
    }
  }

  if (baseline.artifacts.clipping_detected && !candidate.artifacts.clipping_detected) {
    return "mostly_met";
  }

  return "not_met";
}

function getDelta(metricDeltas: MetricDelta[], metric: string): number | undefined {
  return metricDeltas.find((item) => item.metric === metric)?.delta;
}

function matchesAny(value: string, fragments: string[]): boolean {
  return fragments.some((fragment) => value.includes(fragment));
}

function matchesCleanupPhrase(value: string): boolean {
  return value.includes("clean up") || /clean(?:\s+\w+){0,3}\s+up/.test(value);
}
