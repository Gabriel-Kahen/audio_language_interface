import type {
  AnalysisMeasurements,
  AnalysisReport,
  AudioVersion,
  DerivedMeasurements,
  MetricDelta,
  RenderArtifact,
} from "./types.js";

const UNCHANGED_EPSILON = 1e-6;

export type CompareMeasurementContext = AnalysisMeasurements & {
  derived?: DerivedMeasurements;
};

/** Computes ordered numeric deltas from the measurement fields compare currently understands. */
export function computeAnalysisMetricDeltas(
  baseline: CompareMeasurementContext,
  candidate: CompareMeasurementContext,
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
  pushOptionalNumericDelta(
    deltas,
    "levels.rms_dbfs",
    baseline.levels.rms_dbfs,
    candidate.levels.rms_dbfs,
  );
  pushOptionalNumericDelta(
    deltas,
    "levels.sample_peak_dbfs",
    baseline.levels.sample_peak_dbfs,
    candidate.levels.sample_peak_dbfs,
  );
  pushOptionalNumericDelta(
    deltas,
    "levels.headroom_db",
    baseline.levels.headroom_db,
    candidate.levels.headroom_db,
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
  pushOptionalNumericDelta(
    deltas,
    "dynamics.rms_short_term_dbfs",
    baseline.dynamics.rms_short_term_dbfs,
    candidate.dynamics.rms_short_term_dbfs,
  );
  pushOptionalNumericDelta(
    deltas,
    "dynamics.dynamic_range_db",
    baseline.dynamics.dynamic_range_db,
    candidate.dynamics.dynamic_range_db,
  );
  pushOptionalNumericDelta(
    deltas,
    "dynamics.transient_crest_db",
    baseline.dynamics.transient_crest_db,
    candidate.dynamics.transient_crest_db,
  );
  pushOptionalNumericDelta(
    deltas,
    "dynamics.punch_window_ratio",
    baseline.dynamics.punch_window_ratio,
    candidate.dynamics.punch_window_ratio,
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
  pushOptionalNumericDelta(
    deltas,
    "spectral_balance.brightness_tilt_db",
    baseline.spectral_balance.brightness_tilt_db,
    candidate.spectral_balance.brightness_tilt_db,
  );
  pushOptionalNumericDelta(
    deltas,
    "spectral_balance.presence_band_db",
    baseline.spectral_balance.presence_band_db,
    candidate.spectral_balance.presence_band_db,
  );
  pushOptionalNumericDelta(
    deltas,
    "spectral_balance.harshness_ratio_db",
    baseline.spectral_balance.harshness_ratio_db,
    candidate.spectral_balance.harshness_ratio_db,
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
    "artifacts.hum_level_dbfs",
    baseline.artifacts.hum_level_dbfs,
    candidate.artifacts.hum_level_dbfs,
  );
  pushOptionalNumericDelta(
    deltas,
    "artifacts.clipped_sample_count",
    baseline.artifacts.clipped_sample_count,
    candidate.artifacts.clipped_sample_count,
  );
  pushOptionalNumericDelta(
    deltas,
    "artifacts.click_count",
    baseline.artifacts.click_count,
    candidate.artifacts.click_count,
  );
  pushOptionalNumericDelta(
    deltas,
    "artifacts.click_rate_per_second",
    baseline.artifacts.click_rate_per_second,
    candidate.artifacts.click_rate_per_second,
  );
  pushOptionalNumericDelta(
    deltas,
    "derived.duration_seconds",
    baseline.derived?.duration_seconds,
    candidate.derived?.duration_seconds,
  );
  pushOptionalNumericDelta(
    deltas,
    "derived.leading_silence_seconds",
    baseline.derived?.leading_silence_seconds,
    candidate.derived?.leading_silence_seconds,
  );
  pushOptionalNumericDelta(
    deltas,
    "derived.trailing_silence_seconds",
    baseline.derived?.trailing_silence_seconds,
    candidate.derived?.trailing_silence_seconds,
  );
  pushOptionalNumericDelta(
    deltas,
    "derived.pitch_center_hz",
    baseline.derived?.pitch_center_hz,
    candidate.derived?.pitch_center_hz,
  );
  pushOptionalNumericDelta(
    deltas,
    "derived.absolute_stereo_balance_db",
    baseline.derived?.absolute_stereo_balance_db,
    candidate.derived?.absolute_stereo_balance_db,
  );

  return deltas;
}

export function createMeasurementContext(input: {
  version: AudioVersion;
  analysis: AnalysisReport;
  pitchCenterHz?: number;
}): CompareMeasurementContext {
  const leadingSilenceSeconds = getLeadingSilenceSeconds(input.analysis.segments);
  const trailingSilenceSeconds = getTrailingSilenceSeconds(input.analysis.segments);

  return {
    ...input.analysis.measurements,
    derived: {
      duration_seconds: input.version.audio.duration_seconds,
      ...(leadingSilenceSeconds === undefined
        ? {}
        : { leading_silence_seconds: leadingSilenceSeconds }),
      ...(trailingSilenceSeconds === undefined
        ? {}
        : { trailing_silence_seconds: trailingSilenceSeconds }),
      ...(input.pitchCenterHz === undefined ? {} : { pitch_center_hz: input.pitchCenterHz }),
      absolute_stereo_balance_db: Math.abs(input.analysis.measurements.stereo.balance_db ?? 0),
    },
  };
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

function getLeadingSilenceSeconds(
  segments:
    | Array<{
        kind: string;
        start_seconds: number;
        end_seconds: number;
      }>
    | undefined,
): number | undefined {
  if (segments !== undefined && segments.length > 0) {
    const firstSegment = segments[0];
    if (firstSegment?.kind === "active" || firstSegment?.kind === "loop") {
      return 0;
    }
  }

  const segment = segments?.find((candidate) => candidate.kind === "silence");
  if (!segment || segment.start_seconds > 0.02) {
    return undefined;
  }

  return roundDelta(Math.max(0, segment.end_seconds - segment.start_seconds));
}

function getTrailingSilenceSeconds(
  segments:
    | Array<{
        kind: string;
        start_seconds: number;
        end_seconds: number;
      }>
    | undefined,
): number | undefined {
  const allSegments = segments ?? [];
  const trailingSegment = allSegments.at(-1);
  if (trailingSegment?.kind === "active" || trailingSegment?.kind === "loop") {
    return 0;
  }

  const segment = [...allSegments].reverse().find((candidate) => candidate.kind === "silence");
  if (!segment) {
    return undefined;
  }

  const activeSegment = [...allSegments]
    .reverse()
    .find((candidate) => candidate.kind === "active" || candidate.kind === "loop");
  if (!activeSegment || segment.start_seconds < activeSegment.end_seconds - 0.02) {
    return undefined;
  }

  return roundDelta(Math.max(0, segment.end_seconds - segment.start_seconds));
}
