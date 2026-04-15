import type { AnalysisMeasurements, MetricDelta, RenderArtifact } from "./types.js";

const UNCHANGED_EPSILON = 1e-6;

/** Computes ordered numeric deltas from the measurement fields compare currently understands. */
export function computeAnalysisMetricDeltas(
  baseline: AnalysisMeasurements,
  candidate: AnalysisMeasurements,
): MetricDelta[] {
  const deltas: MetricDelta[] = [];

  pushNumericDelta(
    deltas,
    "levels.integrated_lufs",
    baseline.levels.integrated_lufs,
    candidate.levels.integrated_lufs,
  );
  pushNumericDelta(
    deltas,
    "levels.true_peak_dbtp",
    baseline.levels.true_peak_dbtp,
    candidate.levels.true_peak_dbtp,
  );
  pushNumericDelta(
    deltas,
    "dynamics.crest_factor_db",
    baseline.dynamics.crest_factor_db,
    candidate.dynamics.crest_factor_db,
  );
  pushNumericDelta(
    deltas,
    "dynamics.transient_density_per_second",
    baseline.dynamics.transient_density_per_second,
    candidate.dynamics.transient_density_per_second,
  );
  pushNumericDelta(
    deltas,
    "spectral_balance.low_band_db",
    baseline.spectral_balance.low_band_db,
    candidate.spectral_balance.low_band_db,
  );
  pushNumericDelta(
    deltas,
    "spectral_balance.mid_band_db",
    baseline.spectral_balance.mid_band_db,
    candidate.spectral_balance.mid_band_db,
  );
  pushNumericDelta(
    deltas,
    "spectral_balance.high_band_db",
    baseline.spectral_balance.high_band_db,
    candidate.spectral_balance.high_band_db,
  );
  pushNumericDelta(
    deltas,
    "spectral_balance.spectral_centroid_hz",
    baseline.spectral_balance.spectral_centroid_hz,
    candidate.spectral_balance.spectral_centroid_hz,
  );
  pushNumericDelta(deltas, "stereo.width", baseline.stereo.width, candidate.stereo.width);
  pushNumericDelta(
    deltas,
    "stereo.correlation",
    baseline.stereo.correlation,
    candidate.stereo.correlation,
  );
  pushOptionalNumericDelta(
    deltas,
    "stereo.balance_db",
    baseline.stereo.balance_db,
    candidate.stereo.balance_db,
  );
  pushNumericDelta(
    deltas,
    "artifacts.noise_floor_dbfs",
    baseline.artifacts.noise_floor_dbfs,
    candidate.artifacts.noise_floor_dbfs,
  );
  pushOptionalNumericDelta(
    deltas,
    "artifacts.clipped_sample_count",
    baseline.artifacts.clipped_sample_count,
    candidate.artifacts.clipped_sample_count,
  );

  return deltas;
}

export function computeRenderMetricDeltas(
  baseline: RenderArtifact,
  candidate: RenderArtifact,
): MetricDelta[] {
  const deltas: MetricDelta[] = [];

  pushNumericDelta(
    deltas,
    "output.sample_rate_hz",
    baseline.output.sample_rate_hz,
    candidate.output.sample_rate_hz,
  );
  pushNumericDelta(deltas, "output.channels", baseline.output.channels, candidate.output.channels);
  pushNumericDelta(
    deltas,
    "output.duration_seconds",
    baseline.output.duration_seconds,
    candidate.output.duration_seconds,
  );
  pushOptionalNumericDelta(
    deltas,
    "output.file_size_bytes",
    baseline.output.file_size_bytes,
    candidate.output.file_size_bytes,
  );
  pushOptionalNumericDelta(
    deltas,
    "loudness_summary.integrated_lufs",
    baseline.loudness_summary?.integrated_lufs,
    candidate.loudness_summary?.integrated_lufs,
  );
  pushOptionalNumericDelta(
    deltas,
    "loudness_summary.true_peak_dbtp",
    baseline.loudness_summary?.true_peak_dbtp,
    candidate.loudness_summary?.true_peak_dbtp,
  );

  return deltas;
}

function pushOptionalNumericDelta(
  deltas: MetricDelta[],
  metric: string,
  baseline: number | undefined,
  candidate: number | undefined,
): void {
  if (baseline === undefined || candidate === undefined) {
    return;
  }

  pushNumericDelta(deltas, metric, baseline, candidate);
}

function pushNumericDelta(
  deltas: MetricDelta[],
  metric: string,
  baseline: number,
  candidate: number,
): void {
  const delta = roundDelta(candidate - baseline);
  const direction =
    Math.abs(delta) <= UNCHANGED_EPSILON ? "unchanged" : delta > 0 ? "increased" : "decreased";

  deltas.push({
    metric,
    direction,
    delta,
  });
}

function roundDelta(value: number): number {
  return Math.round(value * 1000) / 1000;
}
