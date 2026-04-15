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
  const checks: GoalStatus[] = [];

  if (isAmbiguousBroadGoal(normalizedGoal)) {
    return "unknown";
  }

  if (matchesAny(normalizedGoal, ["harsh", "upper-mid", "upper mid", "aggressive", "smoother"])) {
    checks.push(classifyHarshnessReduction(metricDeltas));
  }

  if (
    matchesAny(normalizedGoal, ["bright", "brightness", "darker", "darken", "top end", "top-end"])
  ) {
    checks.push(classifyBrightnessReduction(metricDeltas));
  }

  if (matchesAny(normalizedGoal, ["punch", "transient", "attack", "impact", "snap"])) {
    checks.push(classifyPunchPreservation(metricDeltas));
  }

  if (matchesAny(normalizedGoal, ["wide", "wider"])) {
    checks.push(classifySingleMetric(getDelta(metricDeltas, "stereo.width"), 0.08, 0.03));
  }

  if (
    matchesCleanupPhrase(normalizedGoal) ||
    matchesAny(normalizedGoal, ["noise", "noisy", "cleaner", "cleanup", "denoise", "hiss", "hum"])
  ) {
    checks.push(classifyCleanupGoal(baseline, candidate, metricDeltas));
  }

  if (matchesAny(normalizedGoal, ["clip", "clipping"])) {
    checks.push(classifyClippingAvoidance(baseline, candidate));
  }

  if (matchesPeakControlPhrase(normalizedGoal)) {
    checks.push(classifyPeakControl(metricDeltas));
  }

  if (matchesLoudnessGoal(normalizedGoal)) {
    checks.push(classifyLoudnessGoal(normalizedGoal, metricDeltas));
  }

  if (checks.length === 0) {
    return "unknown";
  }

  return combineGoalStatuses(checks);
}

function combineGoalStatuses(statuses: GoalStatus[]): GoalStatus {
  if (statuses.some((status) => status === "not_met")) {
    return "not_met";
  }

  if (statuses.some((status) => status === "mostly_met")) {
    return "mostly_met";
  }

  if (statuses.some((status) => status === "met")) {
    return "met";
  }

  return "unknown";
}

function classifyClippingAvoidance(
  baseline: AnalysisMeasurements,
  candidate: AnalysisMeasurements,
): GoalStatus {
  if (!baseline.artifacts.clipping_detected && !candidate.artifacts.clipping_detected) {
    return "met";
  }

  return candidate.artifacts.clipping_detected ? "not_met" : "met";
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
  const dynamicRangeDelta = getDelta(metricDeltas, "dynamics.dynamic_range_db");

  if (crestFactorDelta === undefined || transientDensityDelta === undefined) {
    return "unknown";
  }

  if (
    crestFactorDelta >= -0.3 &&
    transientDensityDelta >= -0.05 &&
    meetsOptionalLowerBound(dynamicRangeDelta, -0.5)
  ) {
    return "met";
  }

  if (
    crestFactorDelta >= -0.75 &&
    transientDensityDelta >= -0.15 &&
    meetsOptionalLowerBound(dynamicRangeDelta, -1.25)
  ) {
    return "mostly_met";
  }

  return "not_met";
}

function classifyPeakControl(metricDeltas: MetricDelta[]): GoalStatus {
  const truePeakDelta = getDelta(metricDeltas, "levels.true_peak_dbtp");
  const headroomDelta = getDelta(metricDeltas, "levels.headroom_db");
  const crestFactorDelta = getDelta(metricDeltas, "dynamics.crest_factor_db");
  const dynamicRangeDelta = getDelta(metricDeltas, "dynamics.dynamic_range_db");

  if (truePeakDelta === undefined && headroomDelta === undefined) {
    return "unknown";
  }

  const peakImproved = (truePeakDelta ?? 0) <= -0.3 || (headroomDelta ?? 0) >= 0.3;
  const peakStable = (truePeakDelta ?? 0) <= 0.1 && (headroomDelta ?? 0) >= -0.2;
  const preservedPunch =
    meetsOptionalLowerBound(crestFactorDelta, -1.25) &&
    meetsOptionalLowerBound(dynamicRangeDelta, -2);
  const mostlyPreservedPunch =
    meetsOptionalLowerBound(crestFactorDelta, -1.75) &&
    meetsOptionalLowerBound(dynamicRangeDelta, -3);

  if (peakImproved && preservedPunch) {
    return "met";
  }

  if (peakStable && mostlyPreservedPunch) {
    return "mostly_met";
  }

  return "not_met";
}

function classifyLoudnessGoal(goal: string, metricDeltas: MetricDelta[]): GoalStatus {
  const loudnessDelta = getDelta(metricDeltas, "levels.integrated_lufs");

  if (loudnessDelta === undefined) {
    return "unknown";
  }

  if (
    matchesAny(goal, [
      "quieter",
      "less loud",
      "turn down",
      "lower level",
      "lower the level",
      "reduce level",
    ])
  ) {
    return classifySingleMetric(loudnessDelta, -1, -0.3);
  }

  if (matchesAny(goal, ["louder", "more level", "turn up", "raise level", "increase level"])) {
    return classifySingleMetric(loudnessDelta, 1, 0.3);
  }

  return Math.abs(loudnessDelta) <= 1
    ? "met"
    : Math.abs(loudnessDelta) <= 2
      ? "mostly_met"
      : "not_met";
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

function matchesLoudnessGoal(value: string): boolean {
  return matchesAny(value, ["loud", "quieter", "volume", "level"]);
}

function matchesPeakControlPhrase(value: string): boolean {
  return (
    value.includes("control peaks") ||
    value.includes("peak control") ||
    value.includes("under control") ||
    value.includes("more controlled") ||
    value.includes("tighter") ||
    /(?:control|tame|reduce)\s+\w*\s*peaks/.test(value)
  );
}

function meetsOptionalLowerBound(value: number | undefined, threshold: number): boolean {
  return value === undefined || value >= threshold;
}

function isAmbiguousBroadGoal(value: string): boolean {
  return (
    value.includes("make it better") ||
    value.includes("make this better") ||
    value === "clean it" ||
    value === "improve it"
  );
}

function matchesAny(value: string, fragments: string[]): boolean {
  return fragments.some((fragment) => value.includes(fragment));
}

function matchesCleanupPhrase(value: string): boolean {
  return value.includes("clean up") || /clean(?:\s+\w+){0,3}\s+up/.test(value);
}
