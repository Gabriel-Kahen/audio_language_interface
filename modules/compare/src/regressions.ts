import type {
  AnalysisMeasurements,
  MetricDelta,
  RegressionWarning,
  RenderArtifact,
} from "./types.js";

/** Detects analysis-side regressions from a narrow set of explicit rules. */
export function detectAnalysisRegressions(
  baseline: AnalysisMeasurements,
  candidate: AnalysisMeasurements,
  metricDeltas: MetricDelta[],
): RegressionWarning[] {
  const regressions: RegressionWarning[] = [];

  if (!baseline.artifacts.clipping_detected && candidate.artifacts.clipping_detected) {
    regressions.push({
      kind: "introduced_clipping",
      severity: 1,
      description: "Candidate analysis reports clipping where the baseline did not.",
    });
  }

  const loudnessShift = getAbsoluteDelta(metricDeltas, "levels.integrated_lufs");
  if (loudnessShift !== undefined && loudnessShift >= 3) {
    regressions.push({
      kind: "excessive_loudness_shift",
      severity: roundSeverity(loudnessShift / 6),
      description: `Integrated loudness shifted by ${loudnessShift.toFixed(1)} LUFS.`,
    });
  }

  const truePeakDelta = getDelta(metricDeltas, "levels.true_peak_dbtp");
  if (truePeakDelta !== undefined && truePeakDelta > 0.5 && candidate.levels.true_peak_dbtp > -1) {
    regressions.push({
      kind: "reduced_true_peak_headroom",
      severity: roundSeverity((candidate.levels.true_peak_dbtp + 1.5) / 1.5),
      description: "Candidate true peak moved close to 0 dBTP and reduced headroom.",
    });
  }

  const widthDelta = getDelta(metricDeltas, "stereo.width");
  const correlationDelta = getDelta(metricDeltas, "stereo.correlation");
  if (widthDelta !== undefined && widthDelta <= -0.2) {
    regressions.push({
      kind: "stereo_collapse",
      severity: roundSeverity(Math.abs(widthDelta) / 0.5),
      description: "Stereo width decreased materially versus the baseline.",
    });
  }

  if (
    widthDelta !== undefined &&
    correlationDelta !== undefined &&
    widthDelta >= 0.1 &&
    (candidate.stereo.correlation < 0.1 || correlationDelta <= -0.25)
  ) {
    regressions.push({
      kind: "stereo_instability",
      severity: roundSeverity(
        Math.max(
          Math.abs(widthDelta) / 0.35,
          Math.abs(correlationDelta) / 0.7,
          Math.max(0.1 - candidate.stereo.correlation, 0) / 0.15,
        ),
      ),
      description:
        "Stereo width increased while channel correlation fell toward phase-risk territory.",
    });
  }

  const crestFactorDelta = getDelta(metricDeltas, "dynamics.crest_factor_db");
  const transientDensityDelta = getDelta(metricDeltas, "dynamics.transient_density_per_second");
  const dynamicRangeDelta = getDelta(metricDeltas, "dynamics.dynamic_range_db");
  const headroomDelta = getDelta(metricDeltas, "levels.headroom_db");
  if (
    crestFactorDelta !== undefined &&
    transientDensityDelta !== undefined &&
    crestFactorDelta <= -1 &&
    transientDensityDelta <= -0.15
  ) {
    regressions.push({
      kind: "lost_punch",
      severity: roundSeverity(
        Math.max(Math.abs(crestFactorDelta) / 3, Math.abs(transientDensityDelta) / 0.4),
      ),
      description: "Candidate lost measurable transient punch versus the baseline.",
    });
  }

  if (
    crestFactorDelta !== undefined &&
    dynamicRangeDelta !== undefined &&
    crestFactorDelta <= -1 &&
    dynamicRangeDelta <= -1.5
  ) {
    regressions.push({
      kind: "over_compression",
      severity: roundSeverity(
        Math.max(Math.abs(crestFactorDelta) / 3, Math.abs(dynamicRangeDelta) / 4),
      ),
      description:
        "Candidate reduced crest factor and short-term dynamic range enough to suggest over-compression.",
    });
  }

  if (
    truePeakDelta !== undefined &&
    (truePeakDelta >= 0.75 || (headroomDelta !== undefined && headroomDelta <= -0.75))
  ) {
    regressions.push({
      kind: "peak_control_regression",
      severity: roundSeverity(
        Math.max(truePeakDelta / 2, Math.abs(Math.min(headroomDelta ?? 0, 0)) / 2),
      ),
      description:
        "Candidate peak control worsened versus the baseline, with higher measured peaks or lower sample headroom.",
    });
  }

  const noiseFloorDelta = getDelta(metricDeltas, "artifacts.noise_floor_dbfs");
  const highBandDelta = getDelta(metricDeltas, "spectral_balance.high_band_db");
  const centroidDelta = getDelta(metricDeltas, "spectral_balance.spectral_centroid_hz");
  if (
    noiseFloorDelta !== undefined &&
    noiseFloorDelta <= -4 &&
    ((highBandDelta !== undefined &&
      centroidDelta !== undefined &&
      highBandDelta <= -2 &&
      centroidDelta <= -200) ||
      (crestFactorDelta !== undefined &&
        transientDensityDelta !== undefined &&
        crestFactorDelta <= -1.25 &&
        transientDensityDelta <= -0.15))
  ) {
    regressions.push({
      kind: "denoise_artifacts",
      severity: roundSeverity(
        Math.max(
          Math.abs(noiseFloorDelta) / 12,
          Math.abs(highBandDelta ?? 0) / 5,
          Math.abs(crestFactorDelta ?? 0) / 3,
        ),
      ),
      description:
        "Noise-floor reduction coincided with measurable top-end or transient loss, suggesting denoise artifacts.",
    });
  }

  return regressions;
}

export function detectRenderRegressions(
  baseline: RenderArtifact,
  candidate: RenderArtifact,
  metricDeltas: MetricDelta[],
): RegressionWarning[] {
  const regressions: RegressionWarning[] = [];

  const durationDelta = getAbsoluteDelta(metricDeltas, "output.duration_seconds");
  if (durationDelta !== undefined && durationDelta >= 0.05) {
    regressions.push({
      kind: "render_duration_mismatch",
      severity: roundSeverity(durationDelta / 1),
      description: `Rendered duration changed by ${durationDelta.toFixed(3)} seconds.`,
    });
  }

  if (baseline.output.channels !== candidate.output.channels) {
    regressions.push({
      kind: "render_channel_change",
      severity: 0.7,
      description: "Rendered channel count changed between baseline and candidate.",
    });
  }

  if (baseline.output.sample_rate_hz !== candidate.output.sample_rate_hz) {
    regressions.push({
      kind: "render_sample_rate_change",
      severity: 0.5,
      description: "Rendered sample rate changed between baseline and candidate.",
    });
  }

  return regressions;
}

function getDelta(metricDeltas: MetricDelta[], metric: string): number | undefined {
  return metricDeltas.find((item) => item.metric === metric)?.delta;
}

function getAbsoluteDelta(metricDeltas: MetricDelta[], metric: string): number | undefined {
  const delta = getDelta(metricDeltas, metric);
  return delta === undefined ? undefined : Math.abs(delta);
}

function roundSeverity(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return Math.round(clamped * 1000) / 1000;
}
