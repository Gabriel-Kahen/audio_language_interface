import type { AnalysisMeasurements, MetricDelta, SemanticDelta } from "./types.js";

/**
 * Derives a small evidence-based semantic vocabulary from measured before/after deltas.
 * Missing thresholds simply produce no label rather than a weaker guess.
 */
export function deriveSemanticDeltas(
  baseline: AnalysisMeasurements,
  candidate: AnalysisMeasurements,
  metricDeltas: MetricDelta[],
): SemanticDelta[] {
  const semanticDeltas: SemanticDelta[] = [];

  pushIfPresent(semanticDeltas, describeBrightnessShift(baseline, candidate));
  pushIfPresent(semanticDeltas, describeHarshnessShift(baseline, candidate));
  pushIfPresent(semanticDeltas, describeDynamicsShift(metricDeltas));
  pushIfPresent(semanticDeltas, describeStereoShift(metricDeltas));
  pushIfPresent(semanticDeltas, describeNoiseShift(metricDeltas));

  return semanticDeltas;
}

function describeBrightnessShift(
  baseline: AnalysisMeasurements,
  candidate: AnalysisMeasurements,
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
  baseline: AnalysisMeasurements,
  candidate: AnalysisMeasurements,
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

function describeDynamicsShift(metricDeltas: MetricDelta[]): SemanticDelta | undefined {
  const crestFactorDelta = getDelta(metricDeltas, "dynamics.crest_factor_db");
  const transientDensityDelta = getDelta(metricDeltas, "dynamics.transient_density_per_second");

  if (crestFactorDelta === undefined || transientDensityDelta === undefined) {
    return undefined;
  }

  if (crestFactorDelta <= -0.75 && transientDensityDelta <= -0.1) {
    return {
      label: "less_punchy",
      confidence: confidenceFromMagnitude(
        Math.max(Math.abs(crestFactorDelta) / 3, Math.abs(transientDensityDelta)),
      ),
      evidence: "crest factor and transient density both decreased",
    };
  }

  if (crestFactorDelta >= 0.75 && transientDensityDelta >= 0.1) {
    return {
      label: "more_punchy",
      confidence: confidenceFromMagnitude(
        Math.max(Math.abs(crestFactorDelta) / 3, Math.abs(transientDensityDelta)),
      ),
      evidence: "crest factor and transient density both increased",
    };
  }

  return undefined;
}

function describeStereoShift(metricDeltas: MetricDelta[]): SemanticDelta | undefined {
  const widthDelta = getDelta(metricDeltas, "stereo.width");

  if (widthDelta === undefined) {
    return undefined;
  }

  if (widthDelta <= -0.08) {
    return {
      label: "narrower",
      confidence: confidenceFromMagnitude(Math.abs(widthDelta) / 0.4),
      evidence: "stereo width decreased",
    };
  }

  if (widthDelta >= 0.08) {
    return {
      label: "wider",
      confidence: confidenceFromMagnitude(Math.abs(widthDelta) / 0.4),
      evidence: "stereo width increased",
    };
  }

  return undefined;
}

function describeNoiseShift(metricDeltas: MetricDelta[]): SemanticDelta | undefined {
  const noiseFloorDelta = getDelta(metricDeltas, "artifacts.noise_floor_dbfs");

  if (noiseFloorDelta === undefined) {
    return undefined;
  }

  if (noiseFloorDelta <= -3) {
    return {
      label: "cleaner",
      confidence: confidenceFromMagnitude(Math.abs(noiseFloorDelta) / 12),
      evidence: "noise floor decreased",
    };
  }

  if (noiseFloorDelta >= 3) {
    return {
      label: "noisier",
      confidence: confidenceFromMagnitude(Math.abs(noiseFloorDelta) / 12),
      evidence: "noise floor increased",
    };
  }

  return undefined;
}

function getDelta(metricDeltas: MetricDelta[], metric: string): number | undefined {
  return metricDeltas.find((item) => item.metric === metric)?.delta;
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
