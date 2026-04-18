import type { AnalysisMeasurements, GoalAlignment, GoalStatus, MetricDelta } from "./types.js";

/**
 * Scores free-form goal strings with conservative keyword matching against
 * measured deltas. Unsupported wording returns `unknown` instead of guessing.
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

  if (matchesAirGoal(normalizedGoal)) {
    checks.push(classifyAirGoal(metricDeltas));
  }

  if (matchesWarmthGoal(normalizedGoal)) {
    checks.push(classifyWarmthGoal(metricDeltas));
  }

  if (matchesMuddinessGoal(normalizedGoal)) {
    checks.push(classifyMuddinessGoal(metricDeltas));
  }

  if (matchesSibilanceGoal(normalizedGoal)) {
    checks.push(classifySibilanceReduction(metricDeltas));
  }

  if (matchesHumGoal(normalizedGoal)) {
    checks.push(classifyHumReduction(metricDeltas));
  }

  if (matchesClickGoal(normalizedGoal)) {
    checks.push(classifyClickReduction(baseline, candidate, metricDeltas));
  }

  if (matchesAny(normalizedGoal, ["punch", "transient", "attack", "impact", "snap"])) {
    checks.push(classifyPunchPreservation(metricDeltas));
  }

  if (matchesStereoWidthGoal(normalizedGoal)) {
    checks.push(classifyStereoWidthGoal(normalizedGoal, baseline, candidate, metricDeltas));
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

function classifyAirGoal(metricDeltas: MetricDelta[]): GoalStatus {
  const highBandDelta = getDelta(metricDeltas, "spectral_balance.high_band_db");
  const brightnessTiltDelta = getDelta(metricDeltas, "spectral_balance.brightness_tilt_db");
  const harshnessRatioDelta = getDelta(metricDeltas, "spectral_balance.harshness_ratio_db");
  const centroidDelta = getDelta(metricDeltas, "spectral_balance.spectral_centroid_hz");

  if (highBandDelta === undefined) {
    return "unknown";
  }

  const tonalLift =
    (brightnessTiltDelta !== undefined && brightnessTiltDelta >= 0.5) ||
    (centroidDelta !== undefined && centroidDelta >= 80);
  const harshnessSafe = harshnessRatioDelta === undefined || harshnessRatioDelta <= 0.45;

  if (highBandDelta >= 0.75 && tonalLift && harshnessSafe) {
    return "met";
  }

  if (
    highBandDelta >= 0.3 &&
    tonalLift &&
    harshnessRatioDelta !== undefined &&
    harshnessRatioDelta <= 0.7
  ) {
    return "mostly_met";
  }

  return "not_met";
}

function classifyWarmthGoal(metricDeltas: MetricDelta[]): GoalStatus {
  const lowBandDelta = getDelta(metricDeltas, "spectral_balance.low_band_db");
  const brightnessTiltDelta = getDelta(metricDeltas, "spectral_balance.brightness_tilt_db");
  const highBandDelta = getDelta(metricDeltas, "spectral_balance.high_band_db");

  if (lowBandDelta === undefined) {
    return "unknown";
  }

  if (
    lowBandDelta >= 0.75 &&
    meetsOptionalUpperBound(brightnessTiltDelta, -0.4) &&
    meetsOptionalUpperBound(highBandDelta, 0.75)
  ) {
    return "met";
  }

  if (
    lowBandDelta >= 0.3 &&
    meetsOptionalUpperBound(brightnessTiltDelta, 0.1) &&
    meetsOptionalUpperBound(highBandDelta, 1)
  ) {
    return "mostly_met";
  }

  return "not_met";
}

function classifyMuddinessGoal(metricDeltas: MetricDelta[]): GoalStatus {
  const midBandDelta = getDelta(metricDeltas, "spectral_balance.mid_band_db");
  const brightnessTiltDelta = getDelta(metricDeltas, "spectral_balance.brightness_tilt_db");
  const highBandDelta = getDelta(metricDeltas, "spectral_balance.high_band_db");

  if (midBandDelta === undefined) {
    return "unknown";
  }

  if (
    midBandDelta <= -0.75 &&
    meetsOptionalLowerBound(brightnessTiltDelta, 0.25) &&
    meetsOptionalLowerBound(highBandDelta, -2.5)
  ) {
    return "met";
  }

  if (
    midBandDelta <= -0.3 &&
    meetsOptionalLowerBound(brightnessTiltDelta, 0) &&
    meetsOptionalLowerBound(highBandDelta, -3)
  ) {
    return "mostly_met";
  }

  return "not_met";
}

function classifySibilanceReduction(metricDeltas: MetricDelta[]): GoalStatus {
  const presenceDelta = getDelta(metricDeltas, "spectral_balance.presence_band_db");
  const harshnessRatioDelta = getDelta(metricDeltas, "spectral_balance.harshness_ratio_db");
  const highBandDelta = getDelta(metricDeltas, "spectral_balance.high_band_db");

  if (presenceDelta === undefined || harshnessRatioDelta === undefined) {
    return "unknown";
  }

  if (
    presenceDelta <= -0.75 &&
    harshnessRatioDelta <= -0.5 &&
    meetsOptionalLowerBound(highBandDelta, -3)
  ) {
    return "met";
  }

  if (
    presenceDelta <= -0.3 &&
    harshnessRatioDelta <= -0.2 &&
    meetsOptionalLowerBound(highBandDelta, -4)
  ) {
    return "mostly_met";
  }

  return "not_met";
}

function classifyHumReduction(metricDeltas: MetricDelta[]): GoalStatus {
  const lowBandDelta = getDelta(metricDeltas, "spectral_balance.low_band_db");
  const noiseFloorDelta = getDelta(metricDeltas, "artifacts.noise_floor_dbfs");
  const midBandDelta = getDelta(metricDeltas, "spectral_balance.mid_band_db");

  if (lowBandDelta === undefined) {
    return "unknown";
  }

  if (
    lowBandDelta <= -4 &&
    meetsOptionalUpperBound(noiseFloorDelta, 0.5) &&
    meetsOptionalLowerBound(midBandDelta, -1.25)
  ) {
    return "mostly_met";
  }

  if (
    lowBandDelta <= -2 &&
    meetsOptionalUpperBound(noiseFloorDelta, 1) &&
    meetsOptionalLowerBound(midBandDelta, -1.5)
  ) {
    return "mostly_met";
  }

  return "not_met";
}

function classifyClickReduction(
  baseline: AnalysisMeasurements,
  candidate: AnalysisMeasurements,
  metricDeltas: MetricDelta[],
): GoalStatus {
  const clippedSampleCountDelta = getDelta(metricDeltas, "artifacts.clipped_sample_count");
  const crestFactorDelta = getDelta(metricDeltas, "dynamics.crest_factor_db");
  const transientDensityDelta = getDelta(metricDeltas, "dynamics.transient_density_per_second");
  const baselineClippedSampleCount = baseline.artifacts.clipped_sample_count;

  if (baselineClippedSampleCount === undefined || clippedSampleCountDelta === undefined) {
    return "unknown";
  }

  const removedMostSpikes =
    !candidate.artifacts.clipping_detected &&
    baselineClippedSampleCount > 0 &&
    candidate.artifacts.clipped_sample_count !== undefined &&
    candidate.artifacts.clipped_sample_count <= baselineClippedSampleCount * 0.2;
  const removedSomeSpikes =
    !candidate.artifacts.clipping_detected &&
    baselineClippedSampleCount > 0 &&
    clippedSampleCountDelta <= -Math.max(4, baselineClippedSampleCount * 0.5);
  const punchMostlyIntact =
    meetsOptionalLowerBound(crestFactorDelta, -1.5) &&
    meetsOptionalLowerBound(transientDensityDelta, -0.2);

  if (removedMostSpikes && punchMostlyIntact) {
    return "mostly_met";
  }

  if (removedSomeSpikes && punchMostlyIntact) {
    return "mostly_met";
  }

  return baselineClippedSampleCount > 0 ? "not_met" : "unknown";
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
  const truePeakDelta = getDelta(metricDeltas, "levels.true_peak_dbtp");
  const headroomDelta = getDelta(metricDeltas, "levels.headroom_db");

  if (loudnessDelta === undefined) {
    return "unknown";
  }

  if (matchesLoudnessStabilityGoal(goal)) {
    if (
      Math.abs(loudnessDelta) <= 1 &&
      meetsOptionalLowerBound(headroomDelta, -0.5) &&
      meetsOptionalUpperBound(truePeakDelta, 0.35)
    ) {
      return "met";
    }

    if (
      Math.abs(loudnessDelta) <= 2 &&
      meetsOptionalLowerBound(headroomDelta, -1) &&
      meetsOptionalUpperBound(truePeakDelta, 0.75)
    ) {
      return "mostly_met";
    }

    return "not_met";
  }

  if (
    matchesAny(goal, [
      "quieter",
      "less loud",
      "turn down",
      "lower level",
      "lower the level",
      "reduce level",
      "reduce loudness",
    ])
  ) {
    return classifySingleMetric(loudnessDelta, -1, -0.3);
  }

  if (
    matchesAny(goal, [
      "louder",
      "more level",
      "turn up",
      "raise level",
      "increase level",
      "increase loudness",
      "normalize",
      "normalise",
      "target loudness",
    ])
  ) {
    if (
      loudnessDelta >= 1 &&
      meetsOptionalLowerBound(headroomDelta, -0.5) &&
      meetsOptionalUpperBound(truePeakDelta, 0.5)
    ) {
      return "met";
    }

    if (
      loudnessDelta >= 0.3 &&
      meetsOptionalLowerBound(headroomDelta, -1) &&
      meetsOptionalUpperBound(truePeakDelta, 0.9)
    ) {
      return "mostly_met";
    }

    return "not_met";
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
  const highBandDelta = getDelta(metricDeltas, "spectral_balance.high_band_db");
  const centroidDelta = getDelta(metricDeltas, "spectral_balance.spectral_centroid_hz");
  const crestFactorDelta = getDelta(metricDeltas, "dynamics.crest_factor_db");
  const transientDensityDelta = getDelta(metricDeltas, "dynamics.transient_density_per_second");

  if (
    hasDenoiseArtifactRisk(highBandDelta, centroidDelta, crestFactorDelta, transientDensityDelta)
  ) {
    return "not_met";
  }

  if (noiseFloorDelta !== undefined) {
    if (noiseFloorDelta <= -3) {
      return "met";
    }

    if (noiseFloorDelta <= -1.5) {
      return "mostly_met";
    }
  }

  if (baseline.artifacts.clipping_detected && !candidate.artifacts.clipping_detected) {
    return "mostly_met";
  }

  return "not_met";
}

function classifyStereoWidthGoal(
  goal: string,
  baseline: AnalysisMeasurements,
  candidate: AnalysisMeasurements,
  metricDeltas: MetricDelta[],
): GoalStatus {
  const widthDelta = getDelta(metricDeltas, "stereo.width");
  const correlationDelta = getDelta(metricDeltas, "stereo.correlation");

  if (widthDelta === undefined) {
    return "unknown";
  }

  const subtleGoal = matchesAny(goal, ["slight", "slightly", "small", "subtle", "a bit", "little"]);
  const phaseSafeGoal = matchesAny(goal, [
    "phasey",
    "phase",
    "mono compatible",
    "mono-compatible",
    "mono compatibility",
  ]);
  const wantsNarrower = matchesAny(goal, ["narrow", "narrower", "reduce width", "less wide"]);
  const widthRisk = hasStereoWidthRisk(baseline, candidate, widthDelta, correlationDelta);

  if (wantsNarrower) {
    if (widthDelta <= -0.08) {
      return "met";
    }

    if (widthDelta <= -0.03) {
      return "mostly_met";
    }

    return "not_met";
  }

  if (phaseSafeGoal && widthRisk) {
    return "not_met";
  }

  if (subtleGoal) {
    if (widthDelta >= 0.05 && widthDelta <= 0.18 && !widthRisk) {
      return "met";
    }

    if (
      widthDelta >= 0.03 &&
      widthDelta <= 0.25 &&
      isMostlyStableWidth(candidate, correlationDelta)
    ) {
      return "mostly_met";
    }

    return "not_met";
  }

  if (widthDelta >= 0.08 && !widthRisk) {
    return "met";
  }

  if (widthDelta >= 0.04 && isMostlyStableWidth(candidate, correlationDelta)) {
    return "mostly_met";
  }

  return "not_met";
}

function getDelta(metricDeltas: MetricDelta[], metric: string): number | undefined {
  return metricDeltas.find((item) => item.metric === metric)?.delta;
}

function hasStereoWidthRisk(
  baseline: AnalysisMeasurements,
  candidate: AnalysisMeasurements,
  widthDelta: number,
  correlationDelta: number | undefined,
): boolean {
  return (
    widthDelta >= 0.1 &&
    (candidate.stereo.correlation < 0.1 ||
      (correlationDelta !== undefined && correlationDelta <= -0.25) ||
      Math.abs(candidate.stereo.balance_db ?? baseline.stereo.balance_db ?? 0) >= 4.5)
  );
}

function isMostlyStableWidth(
  candidate: AnalysisMeasurements,
  correlationDelta: number | undefined,
): boolean {
  return (
    candidate.stereo.correlation >= 0.1 &&
    (correlationDelta === undefined || correlationDelta >= -0.18)
  );
}

function hasDenoiseArtifactRisk(
  highBandDelta: number | undefined,
  centroidDelta: number | undefined,
  crestFactorDelta: number | undefined,
  transientDensityDelta: number | undefined,
): boolean {
  const lostTopEnd =
    highBandDelta !== undefined &&
    centroidDelta !== undefined &&
    highBandDelta <= -2 &&
    centroidDelta <= -200;
  const lostPunch =
    crestFactorDelta !== undefined &&
    transientDensityDelta !== undefined &&
    crestFactorDelta <= -1.25 &&
    transientDensityDelta <= -0.15;

  return lostTopEnd || lostPunch;
}

function matchesLoudnessGoal(value: string): boolean {
  return matchesAny(value, ["loud", "loudness", "quieter", "volume", "level", "lufs", "normaliz"]);
}

function matchesLoudnessStabilityGoal(value: string): boolean {
  return matchesAny(value, [
    "keep the level",
    "keep level",
    "level under control",
    "keep loudness",
    "stable loudness",
    "loudness stable",
    "keep the loudness",
    "consistent loudness",
    "consistent level",
    "loudness stability",
  ]);
}

function matchesStereoWidthGoal(value: string): boolean {
  return matchesAny(value, [
    "wide",
    "wider",
    "widen",
    "width",
    "stereo image",
    "stereo spread",
    "narrow",
    "narrower",
    "mono compatible",
    "mono-compatible",
  ]);
}

function matchesPeakControlPhrase(value: string): boolean {
  return (
    value.includes("control peaks") ||
    value.includes("control peak excursions") ||
    value.includes("peak control") ||
    value.includes("peak excursions") ||
    value.includes("under control") ||
    value.includes("more controlled") ||
    value.includes("tighter") ||
    /(?:control|tame|reduce)\s+\w*\s*peaks/.test(value)
  );
}

function matchesSibilanceGoal(value: string): boolean {
  return matchesAny(value, [
    "sibil",
    "de-ess",
    "de ess",
    "deesser",
    "de-esser",
    "esses",
    "s sounds",
    "s-sounds",
  ]);
}

function matchesHumGoal(value: string): boolean {
  return matchesAny(value, ["hum", "dehum", "de-hum", "electrical buzz", "mains"]);
}

function matchesClickGoal(value: string): boolean {
  return matchesAny(value, ["click", "clicks", "declick", "de-click", "pops", "impulsive"]);
}

function matchesWarmthGoal(value: string): boolean {
  return matchesAny(value, ["warm", "warmth", "warmer", "fuller"]);
}

function matchesAirGoal(value: string): boolean {
  return matchesAny(value, ["air", "airy", "top-end air", "upper-band air"]);
}

function matchesMuddinessGoal(value: string): boolean {
  return matchesAny(value, ["mud", "muddy", "muddiness", "boxy"]);
}

function meetsOptionalLowerBound(value: number | undefined, threshold: number): boolean {
  return value === undefined || value >= threshold;
}

function meetsOptionalUpperBound(value: number | undefined, threshold: number): boolean {
  return value === undefined || value <= threshold;
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
