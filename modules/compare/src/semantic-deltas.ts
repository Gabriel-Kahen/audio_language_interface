import type { CompareMeasurementContext } from "./deltas.js";
import type { MetricDelta, SemanticDelta } from "./types.js";

/**
 * Derives a small evidence-based semantic vocabulary from measured before/after deltas.
 * Missing thresholds simply produce no label rather than a weaker guess.
 */
export function deriveSemanticDeltas(
  baseline: CompareMeasurementContext,
  candidate: CompareMeasurementContext,
  metricDeltas: MetricDelta[],
): SemanticDelta[] {
  const semanticDeltas: SemanticDelta[] = [];

  pushIfPresent(semanticDeltas, describeBrightnessShift(baseline, candidate));
  pushIfPresent(semanticDeltas, describeHarshnessShift(baseline, candidate));
  pushIfPresent(semanticDeltas, describeSibilanceShift(baseline, candidate, metricDeltas));
  pushIfPresent(semanticDeltas, describeAirShift(metricDeltas));
  pushIfPresent(semanticDeltas, describeWarmthShift(metricDeltas));
  pushIfPresent(semanticDeltas, describeMuddinessShift(metricDeltas));
  pushIfPresent(semanticDeltas, describeDynamicsShift(metricDeltas));
  pushIfPresent(semanticDeltas, describeStereoShift(metricDeltas));
  pushIfPresent(semanticDeltas, describeCenteringShift(baseline, candidate, metricDeltas));
  pushIfPresent(semanticDeltas, describeNoiseShift(baseline, candidate, metricDeltas));
  pushIfPresent(semanticDeltas, describeDurationShift(metricDeltas));
  pushIfPresent(semanticDeltas, describePitchShift(metricDeltas));

  return semanticDeltas;
}

function describeBrightnessShift(
  baseline: CompareMeasurementContext,
  candidate: CompareMeasurementContext,
): SemanticDelta | undefined {
  const centroidDelta =
    candidate.spectral_balance.spectral_centroid_hz -
    baseline.spectral_balance.spectral_centroid_hz;
  const highBandDelta =
    candidate.spectral_balance.high_band_db - baseline.spectral_balance.high_band_db;

  if (centroidDelta <= -120 && highBandDelta <= -0.75) {
    return {
      label: "darker",
      confidence: confidenceFromMagnitude(
        Math.max(Math.abs(centroidDelta) / 600, Math.abs(highBandDelta) / 4),
      ),
      evidence: "spectral centroid and high-band energy both decreased",
    };
  }

  if (centroidDelta >= 120 && highBandDelta >= 0.75) {
    return {
      label: "brighter",
      confidence: confidenceFromMagnitude(
        Math.max(Math.abs(centroidDelta) / 600, Math.abs(highBandDelta) / 4),
      ),
      evidence: "spectral centroid and high-band energy both increased",
    };
  }

  return undefined;
}

function describeHarshnessShift(
  baseline: CompareMeasurementContext,
  candidate: CompareMeasurementContext,
): SemanticDelta | undefined {
  const highBandDelta =
    candidate.spectral_balance.high_band_db - baseline.spectral_balance.high_band_db;
  const centroidDelta =
    candidate.spectral_balance.spectral_centroid_hz -
    baseline.spectral_balance.spectral_centroid_hz;

  if (highBandDelta <= -1 && centroidDelta <= -80) {
    return {
      label: "less_harsh",
      confidence: confidenceFromMagnitude(
        Math.max(Math.abs(highBandDelta) / 5, Math.abs(centroidDelta) / 500),
      ),
      evidence: "upper-band energy and spectral centroid both decreased",
    };
  }

  if (highBandDelta >= 1 && centroidDelta >= 80) {
    return {
      label: "more_harsh",
      confidence: confidenceFromMagnitude(
        Math.max(Math.abs(highBandDelta) / 5, Math.abs(centroidDelta) / 500),
      ),
      evidence: "upper-band energy and spectral centroid both increased",
    };
  }

  return undefined;
}

function describeSibilanceShift(
  baseline: CompareMeasurementContext,
  candidate: CompareMeasurementContext,
  metricDeltas: MetricDelta[],
): SemanticDelta | undefined {
  const hasExplicitSibilanceEvidence =
    baseline.evidence?.explicit_sibilance_annotation === true ||
    candidate.evidence?.explicit_sibilance_annotation === true;
  const presenceDelta = getDelta(metricDeltas, "spectral_balance.presence_band_db");
  const harshnessRatioDelta = getDelta(metricDeltas, "spectral_balance.harshness_ratio_db");
  const highBandDelta = getDelta(metricDeltas, "spectral_balance.high_band_db");

  if (
    !hasExplicitSibilanceEvidence ||
    presenceDelta === undefined ||
    harshnessRatioDelta === undefined
  ) {
    return undefined;
  }

  if (
    presenceDelta <= -0.75 &&
    harshnessRatioDelta <= -0.5 &&
    meetsOptionalLowerBound(highBandDelta, -3)
  ) {
    return {
      label: "less_sibilant",
      confidence: confidenceFromMagnitude(
        Math.max(Math.abs(presenceDelta) / 3, Math.abs(harshnessRatioDelta) / 2),
      ),
      evidence:
        "presence-band energy and harshness ratio both decreased without severe top-end loss",
    };
  }

  if (presenceDelta >= 0.75 && harshnessRatioDelta >= 0.5) {
    return {
      label: "more_sibilant",
      confidence: confidenceFromMagnitude(
        Math.max(Math.abs(presenceDelta) / 3, Math.abs(harshnessRatioDelta) / 2),
      ),
      evidence: "presence-band energy and harshness ratio both increased",
    };
  }

  return undefined;
}

function describeAirShift(metricDeltas: MetricDelta[]): SemanticDelta | undefined {
  const highBandDelta = getDelta(metricDeltas, "spectral_balance.high_band_db");
  const brightnessTiltDelta = getDelta(metricDeltas, "spectral_balance.brightness_tilt_db");
  const harshnessRatioDelta = getDelta(metricDeltas, "spectral_balance.harshness_ratio_db");
  const centroidDelta = getDelta(metricDeltas, "spectral_balance.spectral_centroid_hz");

  if (highBandDelta === undefined) {
    return undefined;
  }

  const tiltImproved = brightnessTiltDelta !== undefined ? brightnessTiltDelta >= 0.75 : false;
  const tiltReduced = brightnessTiltDelta !== undefined ? brightnessTiltDelta <= -0.75 : false;
  const centroidLifted = centroidDelta !== undefined ? centroidDelta >= 80 : false;
  const centroidLowered = centroidDelta !== undefined ? centroidDelta <= -80 : false;
  const harshnessStable = harshnessRatioDelta === undefined || harshnessRatioDelta <= 0.45;

  if (highBandDelta >= 0.75 && (tiltImproved || centroidLifted) && harshnessStable) {
    return {
      label: "more_air",
      confidence: confidenceFromMagnitude(
        Math.max(
          Math.abs(highBandDelta) / 4,
          Math.abs(brightnessTiltDelta ?? 0) / 4,
          Math.abs(centroidDelta ?? 0) / 500,
        ),
      ),
      evidence: "high-band energy rose with a brighter tilt without a matching harshness increase",
    };
  }

  if (highBandDelta <= -1.25 && (tiltReduced || centroidLowered)) {
    return {
      label: "less_air",
      confidence: confidenceFromMagnitude(
        Math.max(
          Math.abs(highBandDelta) / 4,
          Math.abs(brightnessTiltDelta ?? 0) / 4,
          Math.abs(centroidDelta ?? 0) / 500,
        ),
      ),
      evidence: "high-band energy and overall brightness tilt both decreased",
    };
  }

  return undefined;
}

function describeWarmthShift(metricDeltas: MetricDelta[]): SemanticDelta | undefined {
  const lowBandDelta = getDelta(metricDeltas, "spectral_balance.low_band_db");
  const brightnessTiltDelta = getDelta(metricDeltas, "spectral_balance.brightness_tilt_db");
  const highBandDelta = getDelta(metricDeltas, "spectral_balance.high_band_db");

  if (lowBandDelta === undefined) {
    return undefined;
  }

  if (
    lowBandDelta >= 0.75 &&
    (brightnessTiltDelta === undefined || brightnessTiltDelta <= -0.5) &&
    (highBandDelta === undefined || highBandDelta <= 0.5)
  ) {
    return {
      label: "warmer",
      confidence: confidenceFromMagnitude(
        Math.max(Math.abs(lowBandDelta) / 4, Math.abs(brightnessTiltDelta ?? 0) / 4),
      ),
      evidence: "low-band weight increased while overall tonal tilt moved warmer",
    };
  }

  if (lowBandDelta <= -0.75 && (brightnessTiltDelta === undefined || brightnessTiltDelta >= 0.5)) {
    return {
      label: "less_warm",
      confidence: confidenceFromMagnitude(
        Math.max(Math.abs(lowBandDelta) / 4, Math.abs(brightnessTiltDelta ?? 0) / 4),
      ),
      evidence: "low-band weight decreased while overall tonal tilt moved brighter",
    };
  }

  return undefined;
}

function describeMuddinessShift(metricDeltas: MetricDelta[]): SemanticDelta | undefined {
  const midBandDelta = getDelta(metricDeltas, "spectral_balance.mid_band_db");
  const brightnessTiltDelta = getDelta(metricDeltas, "spectral_balance.brightness_tilt_db");
  const highBandDelta = getDelta(metricDeltas, "spectral_balance.high_band_db");

  if (midBandDelta === undefined) {
    return undefined;
  }

  if (
    midBandDelta <= -0.75 &&
    (brightnessTiltDelta === undefined || brightnessTiltDelta >= 0.25) &&
    meetsOptionalLowerBound(highBandDelta, -2.5)
  ) {
    return {
      label: "less_muddy",
      confidence: confidenceFromMagnitude(
        Math.max(Math.abs(midBandDelta) / 3, Math.abs(brightnessTiltDelta ?? 0) / 3),
      ),
      evidence: "mid-band energy decreased without a matching collapse in upper-band detail",
    };
  }

  if (midBandDelta >= 0.75 && (brightnessTiltDelta === undefined || brightnessTiltDelta <= -0.25)) {
    return {
      label: "more_muddy",
      confidence: confidenceFromMagnitude(
        Math.max(Math.abs(midBandDelta) / 3, Math.abs(brightnessTiltDelta ?? 0) / 3),
      ),
      evidence: "mid-band energy increased while the overall tilt moved duller",
    };
  }

  return undefined;
}

function describeDynamicsShift(metricDeltas: MetricDelta[]): SemanticDelta | undefined {
  const crestFactorDelta = getDelta(metricDeltas, "dynamics.crest_factor_db");
  const transientDensityDelta = getDelta(metricDeltas, "dynamics.transient_density_per_second");
  const dynamicRangeDelta = getDelta(metricDeltas, "dynamics.dynamic_range_db");

  if (crestFactorDelta === undefined || transientDensityDelta === undefined) {
    return undefined;
  }

  if (
    crestFactorDelta <= -0.75 &&
    (transientDensityDelta <= -0.1 || (dynamicRangeDelta !== undefined && dynamicRangeDelta <= -1))
  ) {
    return {
      label: "less_punchy",
      confidence: confidenceFromMagnitude(
        Math.max(
          Math.abs(crestFactorDelta) / 3,
          Math.abs(transientDensityDelta),
          Math.abs(dynamicRangeDelta ?? 0) / 4,
        ),
      ),
      evidence: buildDynamicsEvidence("decreased", dynamicRangeDelta),
    };
  }

  if (
    crestFactorDelta >= 0.75 &&
    (transientDensityDelta >= 0.1 || (dynamicRangeDelta !== undefined && dynamicRangeDelta >= 1))
  ) {
    return {
      label: "more_punchy",
      confidence: confidenceFromMagnitude(
        Math.max(
          Math.abs(crestFactorDelta) / 3,
          Math.abs(transientDensityDelta),
          Math.abs(dynamicRangeDelta ?? 0) / 4,
        ),
      ),
      evidence: buildDynamicsEvidence("increased", dynamicRangeDelta),
    };
  }

  return undefined;
}

function buildDynamicsEvidence(
  direction: "increased" | "decreased",
  dynamicRangeDelta: number | undefined,
): string {
  if (dynamicRangeDelta !== undefined) {
    return `crest factor ${direction} and either transient density or dynamic range ${direction}`;
  }

  return `crest factor and transient density both ${direction}`;
}

function describeStereoShift(metricDeltas: MetricDelta[]): SemanticDelta | undefined {
  const widthDelta = getDelta(metricDeltas, "stereo.width");
  const correlationDelta = getDelta(metricDeltas, "stereo.correlation");

  if (widthDelta === undefined) {
    return undefined;
  }

  if (widthDelta <= -0.02) {
    return {
      label: "narrower",
      confidence: confidenceFromMagnitude(Math.abs(widthDelta) / 0.4),
      evidence: "stereo width decreased",
    };
  }

  if (widthDelta >= 0.02 && !hasPhaseRisk(correlationDelta)) {
    return {
      label: "wider",
      confidence: confidenceFromMagnitude(
        Math.max(Math.abs(widthDelta) / 0.4, Math.max((correlationDelta ?? 0) + 0.2, 0) / 0.3),
      ),
      evidence: "stereo width increased without a matching collapse in correlation",
    };
  }

  return undefined;
}

function describeCenteringShift(
  baseline: CompareMeasurementContext,
  candidate: CompareMeasurementContext,
  metricDeltas: MetricDelta[],
): SemanticDelta | undefined {
  const absoluteBalanceDelta = getDelta(metricDeltas, "derived.absolute_stereo_balance_db");

  if (absoluteBalanceDelta === undefined) {
    return undefined;
  }

  const baselineAbs = Math.abs(baseline.stereo.balance_db ?? 0);
  const candidateAbs = Math.abs(candidate.stereo.balance_db ?? 0);

  if (absoluteBalanceDelta <= -0.8 && candidateAbs <= Math.max(1.25, baselineAbs - 0.8)) {
    return {
      label: "more_centered",
      confidence: confidenceFromMagnitude(Math.abs(absoluteBalanceDelta) / 3.5),
      evidence: "absolute stereo balance offset moved closer to center",
    };
  }

  if (absoluteBalanceDelta >= 0.8) {
    return {
      label: "less_centered",
      confidence: confidenceFromMagnitude(Math.abs(absoluteBalanceDelta) / 3.5),
      evidence: "absolute stereo balance offset moved farther away from center",
    };
  }

  return undefined;
}

function describeNoiseShift(
  baseline: CompareMeasurementContext,
  candidate: CompareMeasurementContext,
  metricDeltas: MetricDelta[],
): SemanticDelta | undefined {
  const noiseFloorDelta = getDelta(metricDeltas, "artifacts.noise_floor_dbfs");
  const highBandDelta = getDelta(metricDeltas, "spectral_balance.high_band_db");
  const centroidDelta = getDelta(metricDeltas, "spectral_balance.spectral_centroid_hz");
  const crestFactorDelta = getDelta(metricDeltas, "dynamics.crest_factor_db");

  if (noiseFloorDelta === undefined) {
    return undefined;
  }

  if (
    noiseFloorDelta <= -3 &&
    !hasSevereDenoiseCollateralLoss(
      baseline,
      candidate,
      highBandDelta,
      centroidDelta,
      crestFactorDelta,
    )
  ) {
    return {
      label: "cleaner",
      confidence: confidenceFromMagnitude(Math.abs(noiseFloorDelta) / 12),
      evidence:
        "estimated noise floor decreased without a matching collapse in high-band or punch metrics",
    };
  }

  if (noiseFloorDelta >= 3) {
    return {
      label: "noisier",
      confidence: confidenceFromMagnitude(Math.abs(noiseFloorDelta) / 12),
      evidence: "estimated noise floor increased",
    };
  }

  return undefined;
}

function hasPhaseRisk(correlationDelta: number | undefined): boolean {
  return correlationDelta !== undefined && correlationDelta <= -0.2;
}

function hasSevereDenoiseCollateralLoss(
  baseline: CompareMeasurementContext,
  candidate: CompareMeasurementContext,
  highBandDelta: number | undefined,
  centroidDelta: number | undefined,
  crestFactorDelta: number | undefined,
): boolean {
  const highBandLoss = highBandDelta !== undefined && highBandDelta <= -2;
  const centroidLoss = centroidDelta !== undefined && centroidDelta <= -200;
  const punchLoss = crestFactorDelta !== undefined && crestFactorDelta <= -1.25;

  return (
    (highBandLoss && centroidLoss) ||
    (punchLoss && candidate.spectral_balance.high_band_db < baseline.spectral_balance.high_band_db)
  );
}

function getDelta(metricDeltas: MetricDelta[], metric: string): number | undefined {
  return metricDeltas.find((item) => item.metric === metric)?.delta;
}

function describeDurationShift(metricDeltas: MetricDelta[]): SemanticDelta | undefined {
  const durationDelta = getDelta(metricDeltas, "derived.duration_seconds");
  if (durationDelta === undefined) {
    return undefined;
  }

  if (durationDelta <= -0.08) {
    return {
      label: "shorter",
      confidence: confidenceFromMagnitude(Math.abs(durationDelta) / 0.6),
      evidence: "derived version duration decreased",
    };
  }

  if (durationDelta >= 0.08) {
    return {
      label: "longer",
      confidence: confidenceFromMagnitude(Math.abs(durationDelta) / 0.6),
      evidence: "derived version duration increased",
    };
  }

  return undefined;
}

function describePitchShift(metricDeltas: MetricDelta[]): SemanticDelta | undefined {
  const pitchDelta = getDelta(metricDeltas, "derived.pitch_center_hz");
  if (pitchDelta === undefined) {
    return undefined;
  }

  if (pitchDelta <= -12) {
    return {
      label: "lower_pitch",
      confidence: confidenceFromMagnitude(Math.abs(pitchDelta) / 120),
      evidence: "derived pitch center moved downward",
    };
  }

  if (pitchDelta >= 12) {
    return {
      label: "higher_pitch",
      confidence: confidenceFromMagnitude(Math.abs(pitchDelta) / 120),
      evidence: "derived pitch center moved upward",
    };
  }

  return undefined;
}

function meetsOptionalLowerBound(value: number | undefined, threshold: number): boolean {
  return value === undefined || value >= threshold;
}

function confidenceFromMagnitude(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return Math.round(clamped * 1000) / 1000;
}

function pushIfPresent<T>(items: T[], value: T | undefined): void {
  if (value !== undefined) {
    items.push(value);
  }
}
