import { describe, expect, it } from "vitest";

import {
  type AnalysisReport,
  type AudioVersion,
  compareRenders,
  compareVersions,
  isValidComparisonReport,
  type RenderArtifact,
} from "../src/index.js";

describe("compare audio invariants", () => {
  it("detects analysis regressions when a candidate introduces clipping and headroom loss", () => {
    const report = compareVersions({
      baselineVersion: createVersion("ver_compare_base"),
      candidateVersion: createVersion("ver_compare_candidate"),
      baselineAnalysis: createAnalysisReport({
        reportId: "analysis_compare_base",
        versionId: "ver_compare_base",
        truePeakDbtp: -3,
        samplePeakDbfs: -3.2,
        headroomDb: 3.2,
        clippingDetected: false,
        clippedSampleCount: 0,
      }),
      candidateAnalysis: createAnalysisReport({
        reportId: "analysis_compare_candidate",
        versionId: "ver_compare_candidate",
        truePeakDbtp: 0.2,
        samplePeakDbfs: 0,
        headroomDb: 0,
        clippingDetected: true,
        clippedSampleCount: 128,
      }),
      generatedAt: "2026-04-28T12:00:00Z",
    });

    expect(isValidComparisonReport(report)).toBe(true);
    expect(report.metric_deltas).toContainEqual({
      metric: "artifacts.clipped_sample_count",
      direction: "increased",
      delta: 128,
    });
    expect(report.regressions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "introduced_clipping" }),
        expect.objectContaining({ kind: "peak_control_regression" }),
      ]),
    );
  });

  it("flags render regressions for duration, channel, and sample-rate changes", () => {
    const report = compareRenders({
      baselineRender: createRenderArtifact({
        renderId: "render_compare_base",
        versionId: "ver_compare_base",
        sampleRateHz: 44100,
        channels: 2,
        durationSeconds: 1,
      }),
      candidateRender: createRenderArtifact({
        renderId: "render_compare_candidate",
        versionId: "ver_compare_candidate",
        sampleRateHz: 48000,
        channels: 1,
        durationSeconds: 1.08,
      }),
      generatedAt: "2026-04-28T12:00:00Z",
    });

    expect(isValidComparisonReport(report)).toBe(true);
    expect(report.regressions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "render_duration_mismatch" }),
        expect.objectContaining({ kind: "render_channel_change" }),
        expect.objectContaining({ kind: "render_sample_rate_change" }),
      ]),
    );
  });
});

function createVersion(versionId: `ver_${string}`): AudioVersion {
  return {
    schema_version: "1.0.0",
    version_id: versionId,
    asset_id: "asset_01HYCOMPAREINVARIANT001",
    lineage: { created_at: "2026-04-28T11:59:00Z", created_by: "compare-test" },
    audio: {
      storage_ref: `storage/audio/${versionId}.wav`,
      sample_rate_hz: 44100,
      channels: 2,
      duration_seconds: 1,
      frame_count: 44100,
      channel_layout: "stereo",
    },
  };
}

function createAnalysisReport(options: {
  reportId: string;
  versionId: string;
  truePeakDbtp: number;
  samplePeakDbfs: number;
  headroomDb: number;
  clippingDetected: boolean;
  clippedSampleCount: number;
}): AnalysisReport {
  return {
    schema_version: "1.0.0",
    report_id: options.reportId,
    asset_id: "asset_01HYCOMPAREINVARIANT001",
    version_id: options.versionId,
    generated_at: "2026-04-28T12:00:00Z",
    analyzer: { name: "default-analysis", version: "0.1.0" },
    summary: { plain_text: "fixture summary" },
    measurements: {
      levels: {
        integrated_lufs: -16,
        true_peak_dbtp: options.truePeakDbtp,
        rms_dbfs: -18,
        sample_peak_dbfs: options.samplePeakDbfs,
        headroom_db: options.headroomDb,
      },
      dynamics: {
        crest_factor_db: 10,
        transient_density_per_second: 1,
        rms_short_term_dbfs: -17,
        dynamic_range_db: 8,
      },
      spectral_balance: {
        low_band_db: -18,
        mid_band_db: -14,
        high_band_db: -12,
        spectral_centroid_hz: 2200,
      },
      stereo: {
        width: 0.5,
        correlation: 0.5,
        balance_db: 0,
      },
      artifacts: {
        clipping_detected: options.clippingDetected,
        noise_floor_dbfs: -72,
        clipped_sample_count: options.clippedSampleCount,
        clipped_frame_count: options.clippedSampleCount,
        clipped_frame_ratio: options.clippedSampleCount === 0 ? 0 : 0.002,
        clipping_severity: options.clippedSampleCount === 0 ? 0 : 0.7,
        hum_detected: false,
        hum_harmonic_count: 0,
        click_detected: false,
        click_count: 0,
        click_rate_per_second: 0,
      },
    },
  };
}

function createRenderArtifact(options: {
  renderId: string;
  versionId: string;
  sampleRateHz: number;
  channels: number;
  durationSeconds: number;
}): RenderArtifact {
  return {
    schema_version: "1.0.0",
    render_id: options.renderId,
    asset_id: "asset_01HYCOMPAREINVARIANT001",
    version_id: options.versionId,
    kind: "final",
    created_at: "2026-04-28T12:00:00Z",
    output: {
      path: `renders/${options.renderId}.wav`,
      format: "wav",
      codec: "pcm_s16le",
      sample_rate_hz: options.sampleRateHz,
      channels: options.channels,
      duration_seconds: options.durationSeconds,
      file_size_bytes: 1024,
    },
  };
}
