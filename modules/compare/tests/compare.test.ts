import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";
import { describe, expect, it } from "vitest";

import commonSchema from "../../../contracts/schemas/json/common.schema.json" with { type: "json" };
import comparisonReportSchema from "../../../contracts/schemas/json/comparison-report.schema.json" with {
  type: "json",
};
import {
  type AnalysisReport,
  type AudioVersion,
  compareRenders,
  compareVersions,
  computeAnalysisMetricDeltas,
  type EditPlan,
  evaluateGoalAlignment,
  isValidComparisonReport,
  type RenderArtifact,
} from "../src/index.js";

describe("compareVersions", () => {
  it("builds a contract-aligned report from paired analysis reports", () => {
    const report = compareVersions({
      baselineVersion: createVersion("ver_baseline123"),
      candidateVersion: createVersion("ver_candidate123"),
      baselineAnalysis: createAnalysisReport({
        reportId: "analysis_base123",
        versionId: "ver_baseline123",
        integratedLufs: -14.8,
        truePeakDbtp: -1.1,
        samplePeakDbfs: -1.5,
        headroomDb: 1.5,
        crestFactorDb: 10.3,
        transientDensity: 2,
        dynamicRangeDb: 8.4,
        lowBandDb: -16.4,
        midBandDb: -11.2,
        highBandDb: -9.8,
        spectralCentroidHz: 2650,
        stereoWidth: 0.62,
        stereoCorrelation: 0.41,
        noiseFloorDbfs: -72,
        clippingDetected: false,
      }),
      candidateAnalysis: createAnalysisReport({
        reportId: "analysis_cand123",
        versionId: "ver_candidate123",
        integratedLufs: -15.1,
        truePeakDbtp: -1.2,
        samplePeakDbfs: -1.7,
        headroomDb: 1.7,
        crestFactorDb: 10.1,
        transientDensity: 1.97,
        dynamicRangeDb: 8.1,
        lowBandDb: -16.3,
        midBandDb: -11.5,
        highBandDb: -11.4,
        spectralCentroidHz: 2420,
        stereoWidth: 0.61,
        stereoCorrelation: 0.43,
        noiseFloorDbfs: -72.5,
        clippingDetected: false,
      }),
      editPlan: createEditPlan(),
      generatedAt: "2026-04-14T20:20:22Z",
    });

    expect(isValidComparisonReport(report)).toBe(true);
    expect(validateComparisonReport(report)).toBe(true);
    expect(report.metric_deltas).toContainEqual({
      metric: "spectral_balance.high_band_db",
      direction: "decreased",
      delta: -1.6,
    });
    expect(report.metric_deltas).toContainEqual({
      metric: "levels.headroom_db",
      direction: "increased",
      delta: 0.2,
    });
    expect(report.metric_deltas).toContainEqual({
      metric: "dynamics.dynamic_range_db",
      direction: "decreased",
      delta: -0.3,
    });
    expect(report.semantic_deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "less_harsh" }),
        expect.objectContaining({ label: "darker" }),
      ]),
    );
    expect(report.goal_alignment).toEqual([
      { goal: "reduce upper-mid harshness", status: "met" },
      { goal: "slightly reduce perceived brightness", status: "met" },
      { goal: "preserve transient impact", status: "met" },
    ]);
    expect(report.verification_results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_id: "target_reduce_harshness_high_band",
          status: "met",
          observed_delta: -1.6,
        }),
        expect.objectContaining({
          target_id: "target_preserve_punch_crest_factor",
          status: "met",
        }),
      ]),
    );
    expect(report.evaluation_basis).toEqual({
      metric_source: "analysis_reports",
      goal_evaluation_source: "structured_verification",
      authoritative_signal: "verification_results",
    });
    expect(report.summary.plain_text).toContain(
      "structured verification checks were satisfied or mostly satisfied.",
    );
    expect(report.regressions).toBeUndefined();
  });

  it("treats direct hum-level targets as met when the candidate clears hum detection", () => {
    const report = compareVersions({
      baselineVersion: createVersion("ver_hum_base"),
      candidateVersion: createVersion("ver_hum_cand"),
      baselineAnalysis: createAnalysisReport({
        reportId: "analysis_hum_base",
        versionId: "ver_hum_base",
        integratedLufs: -18,
        truePeakDbtp: -1.5,
        crestFactorDb: 10.1,
        transientDensity: 1.6,
        dynamicRangeDb: 8.1,
        lowBandDb: -12.4,
        midBandDb: -11.2,
        highBandDb: -10.4,
        spectralCentroidHz: 2380,
        stereoWidth: 0.51,
        stereoCorrelation: 0.47,
        noiseFloorDbfs: -68,
        clippingDetected: false,
        humDetected: true,
        humLevelDbfs: -22.4,
      }),
      candidateAnalysis: createAnalysisReport({
        reportId: "analysis_hum_cand",
        versionId: "ver_hum_cand",
        integratedLufs: -18,
        truePeakDbtp: -1.6,
        crestFactorDb: 10.1,
        transientDensity: 1.6,
        dynamicRangeDb: 8.1,
        lowBandDb: -15.6,
        midBandDb: -11.3,
        highBandDb: -10.2,
        spectralCentroidHz: 2400,
        stereoWidth: 0.51,
        stereoCorrelation: 0.47,
        noiseFloorDbfs: -68.5,
        clippingDetected: false,
        humDetected: false,
      }),
      editPlan: {
        ...createEditPlan(),
        version_id: "ver_hum_base",
        goals: ["reduce mains hum and harmonic buzz conservatively"],
        verification_targets: [
          {
            target_id: "target_reduce_hum_activity",
            goal: "reduce mains hum and harmonic buzz conservatively",
            label: "reduce direct hum level",
            kind: "analysis_metric",
            comparison: "at_most",
            metric: "artifacts.hum_level_dbfs",
            threshold: -28,
          },
        ],
      },
      generatedAt: "2026-04-19T20:20:22Z",
    });

    expect(report.verification_results).toEqual([
      expect.objectContaining({
        target_id: "target_reduce_hum_activity",
        status: "met",
      }),
    ]);
    expect(report.goal_alignment).toEqual([
      { goal: "reduce mains hum and harmonic buzz conservatively", status: "met" },
    ]);
  });

  it("treats direct click-activity targets as met when the candidate clears click detection", () => {
    const report = compareVersions({
      baselineVersion: createVersion("ver_click_base"),
      candidateVersion: createVersion("ver_click_cand"),
      baselineAnalysis: createAnalysisReport({
        reportId: "analysis_click_base",
        versionId: "ver_click_base",
        integratedLufs: -18,
        truePeakDbtp: -1.5,
        crestFactorDb: 10.1,
        transientDensity: 1.6,
        dynamicRangeDb: 8.1,
        lowBandDb: -12.4,
        midBandDb: -11.2,
        highBandDb: -10.4,
        spectralCentroidHz: 2380,
        stereoWidth: 0.51,
        stereoCorrelation: 0.47,
        noiseFloorDbfs: -68,
        clippingDetected: false,
        clickDetected: true,
        clickCount: 6,
      }),
      candidateAnalysis: createAnalysisReport({
        reportId: "analysis_click_cand",
        versionId: "ver_click_cand",
        integratedLufs: -18,
        truePeakDbtp: -1.6,
        crestFactorDb: 10.1,
        transientDensity: 1.6,
        dynamicRangeDb: 8.1,
        lowBandDb: -12.6,
        midBandDb: -11.3,
        highBandDb: -10.2,
        spectralCentroidHz: 2400,
        stereoWidth: 0.51,
        stereoCorrelation: 0.47,
        noiseFloorDbfs: -68.5,
        clippingDetected: false,
        clickDetected: false,
      }),
      editPlan: {
        ...createEditPlan(),
        version_id: "ver_click_base",
        goals: ["repair short clicks and pops conservatively"],
        verification_targets: [
          {
            target_id: "target_reduce_click_activity",
            goal: "repair short clicks and pops conservatively",
            label: "reduce direct click activity",
            kind: "analysis_metric",
            comparison: "at_most",
            metric: "artifacts.click_count",
            threshold: 0,
          },
        ],
      },
      generatedAt: "2026-04-20T02:20:22Z",
    });

    expect(report.verification_results).toEqual([
      expect.objectContaining({
        target_id: "target_reduce_click_activity",
        status: "met",
      }),
    ]);
    expect(report.goal_alignment).toEqual([
      { goal: "repair short clicks and pops conservatively", status: "met" },
    ]);
  });

  it("scores hum and click reduction goals from direct artifact evidence first", () => {
    const baseline = createAnalysisReport({
      reportId: "analysis_restore_direct_base",
      versionId: "ver_restore_direct_base",
      integratedLufs: -15.8,
      truePeakDbtp: -1.6,
      samplePeakDbfs: -1.9,
      headroomDb: 1.9,
      crestFactorDb: 10.1,
      transientDensity: 1.85,
      dynamicRangeDb: 8,
      lowBandDb: -13.5,
      midBandDb: -11.2,
      highBandDb: -10.4,
      spectralCentroidHz: 2380,
      brightnessTiltDb: 3.1,
      presenceBandDb: -9.5,
      harshnessRatioDb: 0.8,
      stereoWidth: 0.47,
      stereoCorrelation: 0.52,
      stereoBalanceDb: 0.1,
      noiseFloorDbfs: -61.5,
      clippedSampleCount: 120,
      clippingDetected: false,
      humDetected: true,
      humLevelDbfs: -20.5,
      clickDetected: true,
      clickCount: 12,
    }).measurements;
    const candidate = createAnalysisReport({
      reportId: "analysis_restore_direct_cand",
      versionId: "ver_restore_direct_cand",
      integratedLufs: -15.5,
      truePeakDbtp: -1.5,
      samplePeakDbfs: -1.8,
      headroomDb: 1.8,
      crestFactorDb: 9.9,
      transientDensity: 1.78,
      dynamicRangeDb: 7.8,
      lowBandDb: -16.2,
      midBandDb: -11.3,
      highBandDb: -10.5,
      spectralCentroidHz: 2370,
      brightnessTiltDb: 2.9,
      presenceBandDb: -9.6,
      harshnessRatioDb: 0.7,
      stereoWidth: 0.47,
      stereoCorrelation: 0.53,
      stereoBalanceDb: 0.1,
      noiseFloorDbfs: -63,
      clippedSampleCount: 12,
      clippingDetected: false,
      humDetected: false,
      clickDetected: false,
      clickCount: 0,
    }).measurements;

    const goalAlignment = evaluateGoalAlignment(
      ["reduce hum", "reduce clicks"],
      baseline,
      candidate,
      computeAnalysisMetricDeltas(baseline, candidate),
    );

    expect(goalAlignment).toEqual([
      { goal: "reduce hum", status: "met" },
      { goal: "reduce clicks", status: "met" },
    ]);
  });

  it("uses derived duration metrics for time-stretch verification", () => {
    const baselineVersion = createVersion("ver_timestretchbase", {
      storageRef: "fixtures/audio/phase-1/request-cycle-pitched-timing-source.wav",
      channels: 1,
      durationSeconds: 0.96,
      sampleRateHz: 22050,
      channelLayout: "mono",
    });
    const candidateVersion = createVersion("ver_timestretchcand", {
      storageRef: "fixtures/audio/phase-1/request-cycle-pitched-timing-source.wav",
      channels: 1,
      durationSeconds: 0.864,
      sampleRateHz: 22050,
      channelLayout: "mono",
    });

    const report = compareVersions({
      baselineVersion,
      candidateVersion,
      baselineAnalysis: createAnalysisReport({
        reportId: "analysis_time_stretch_base",
        versionId: baselineVersion.version_id,
        integratedLufs: -15.4,
        truePeakDbtp: -1.6,
        crestFactorDb: 10.2,
        transientDensity: 1.4,
        dynamicRangeDb: 7.9,
        lowBandDb: -13.2,
        midBandDb: -11.1,
        highBandDb: -10.5,
        spectralCentroidHz: 2080,
        brightnessTiltDb: 2.7,
        presenceBandDb: -8.7,
        harshnessRatioDb: 0.9,
        stereoWidth: 0,
        stereoCorrelation: 1,
        stereoBalanceDb: 0,
        noiseFloorDbfs: -70,
        clippingDetected: false,
      }),
      candidateAnalysis: createAnalysisReport({
        reportId: "analysis_time_stretch_cand",
        versionId: candidateVersion.version_id,
        integratedLufs: -15.3,
        truePeakDbtp: -1.6,
        crestFactorDb: 10.1,
        transientDensity: 1.55,
        dynamicRangeDb: 7.9,
        lowBandDb: -13.1,
        midBandDb: -11.1,
        highBandDb: -10.4,
        spectralCentroidHz: 2085,
        brightnessTiltDb: 2.8,
        presenceBandDb: -8.6,
        harshnessRatioDb: 0.9,
        stereoWidth: 0,
        stereoCorrelation: 1,
        stereoBalanceDb: 0,
        noiseFloorDbfs: -70,
        clippingDetected: false,
      }),
      editPlan: {
        ...createEditPlan(),
        version_id: baselineVersion.version_id,
        goals: ["shorten the clip duration while preserving pitch"],
        verification_targets: [
          {
            target_id: "target_time_stretch_duration",
            goal: "shorten the clip duration while preserving pitch",
            label: "shorten clip duration by the requested stretch ratio",
            kind: "analysis_metric",
            comparison: "within",
            metric: "derived.duration_seconds",
            threshold: 0.864,
            tolerance: 0.02,
          },
        ],
      },
      generatedAt: "2026-04-21T18:20:22Z",
    });

    expect(report.metric_deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: "derived.duration_seconds",
          direction: "decreased",
          delta: -0.096,
        }),
      ]),
    );
    expect(report.verification_results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_id: "target_time_stretch_duration",
          status: "met",
          observed_value: 0.864,
        }),
      ]),
    );
    expect(report.goal_alignment).toEqual([
      { goal: "shorten the clip duration while preserving pitch", status: "met" },
    ]);
  });

  it("uses derived silence-edge metrics for trim-silence verification", () => {
    const baselineVersion = createVersion("ver_trimsilencebase", {
      channels: 1,
      durationSeconds: 1.04,
      sampleRateHz: 22050,
      channelLayout: "mono",
    });
    const candidateVersion = createVersion("ver_trimsilencecand", {
      channels: 1,
      durationSeconds: 0.72,
      sampleRateHz: 22050,
      channelLayout: "mono",
    });

    const baselineAnalysis = {
      ...createAnalysisReport({
        reportId: "analysis_trim_silence_base",
        versionId: baselineVersion.version_id,
        integratedLufs: -17,
        truePeakDbtp: -1.8,
        crestFactorDb: 10.6,
        transientDensity: 1.1,
        dynamicRangeDb: 8.1,
        lowBandDb: -13.4,
        midBandDb: -11.5,
        highBandDb: -10.7,
        spectralCentroidHz: 2050,
        stereoWidth: 0,
        stereoCorrelation: 1,
        noiseFloorDbfs: -60,
        clippingDetected: false,
      }),
      segments: [
        { kind: "silence", start_seconds: 0, end_seconds: 0.14 },
        { kind: "active", start_seconds: 0.14, end_seconds: 0.86 },
        { kind: "silence", start_seconds: 0.86, end_seconds: 1.04 },
      ],
    } satisfies AnalysisReport;

    const candidateAnalysis = {
      ...createAnalysisReport({
        reportId: "analysis_trim_silence_cand",
        versionId: candidateVersion.version_id,
        integratedLufs: -16.9,
        truePeakDbtp: -1.8,
        crestFactorDb: 10.5,
        transientDensity: 1.55,
        dynamicRangeDb: 8.1,
        lowBandDb: -13.4,
        midBandDb: -11.5,
        highBandDb: -10.7,
        spectralCentroidHz: 2050,
        stereoWidth: 0,
        stereoCorrelation: 1,
        noiseFloorDbfs: -60.5,
        clippingDetected: false,
      }),
      segments: [{ kind: "active", start_seconds: 0, end_seconds: 0.72 }],
    } satisfies AnalysisReport;

    const report = compareVersions({
      baselineVersion,
      candidateVersion,
      baselineAnalysis,
      candidateAnalysis,
      editPlan: {
        ...createEditPlan(),
        version_id: baselineVersion.version_id,
        goals: ["trim leading and trailing boundary silence conservatively"],
        verification_targets: [
          {
            target_id: "target_trim_leading_silence",
            goal: "trim leading and trailing boundary silence conservatively",
            label: "reduce leading boundary silence to a small residual window",
            kind: "analysis_metric",
            comparison: "at_most",
            metric: "derived.leading_silence_seconds",
            threshold: 0.02,
            tolerance: 0.015,
          },
          {
            target_id: "target_trim_trailing_silence",
            goal: "trim leading and trailing boundary silence conservatively",
            label: "reduce trailing boundary silence to a small residual window",
            kind: "analysis_metric",
            comparison: "at_most",
            metric: "derived.trailing_silence_seconds",
            threshold: 0.02,
            tolerance: 0.015,
          },
          {
            target_id: "target_trim_silence_duration_reduction",
            goal: "trim leading and trailing boundary silence conservatively",
            label: "reduce overall duration when measurable boundary silence exists",
            kind: "analysis_metric",
            comparison: "decrease_by",
            metric: "derived.duration_seconds",
            threshold: 0.16,
          },
        ],
      },
      generatedAt: "2026-04-21T18:30:22Z",
    });

    expect(report.metric_deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: "derived.leading_silence_seconds",
          direction: "decreased",
          delta: -0.14,
        }),
        expect.objectContaining({
          metric: "derived.trailing_silence_seconds",
          direction: "decreased",
          delta: -0.18,
        }),
        expect.objectContaining({
          metric: "derived.duration_seconds",
          direction: "decreased",
          delta: -0.32,
        }),
      ]),
    );
    expect(report.verification_results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target_id: "target_trim_leading_silence", status: "met" }),
        expect.objectContaining({ target_id: "target_trim_trailing_silence", status: "met" }),
        expect.objectContaining({
          target_id: "target_trim_silence_duration_reduction",
          status: "met",
        }),
      ]),
    );
    expect(report.goal_alignment).toEqual([
      { goal: "trim leading and trailing boundary silence conservatively", status: "met" },
    ]);
  });

  it("detects clipping and loudness regressions", () => {
    const report = compareVersions({
      baselineVersion: createVersion("ver_clean123"),
      candidateVersion: createVersion("ver_loud123"),
      baselineAnalysis: createAnalysisReport({
        reportId: "analysis_clean123",
        versionId: "ver_clean123",
        integratedLufs: -18,
        truePeakDbtp: -4,
        samplePeakDbfs: -3.2,
        headroomDb: 3.2,
        crestFactorDb: 11,
        transientDensity: 1.5,
        dynamicRangeDb: 9.2,
        lowBandDb: -14,
        midBandDb: -12,
        highBandDb: -11,
        spectralCentroidHz: 2100,
        stereoWidth: 0.55,
        stereoCorrelation: 0.6,
        noiseFloorDbfs: -74,
        clippingDetected: false,
      }),
      candidateAnalysis: createAnalysisReport({
        reportId: "analysis_loud123",
        versionId: "ver_loud123",
        integratedLufs: -13.5,
        truePeakDbtp: -0.3,
        samplePeakDbfs: -0.2,
        headroomDb: 0.2,
        crestFactorDb: 8.8,
        transientDensity: 1.1,
        dynamicRangeDb: 5.8,
        lowBandDb: -13.8,
        midBandDb: -11.4,
        highBandDb: -10.2,
        spectralCentroidHz: 2300,
        stereoWidth: 0.3,
        stereoCorrelation: 0.8,
        noiseFloorDbfs: -68,
        clippingDetected: true,
      }),
      generatedAt: "2026-04-14T20:20:22Z",
    });

    expect(report.regressions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "introduced_clipping" }),
        expect.objectContaining({ kind: "excessive_loudness_shift" }),
        expect.objectContaining({ kind: "reduced_true_peak_headroom" }),
        expect.objectContaining({ kind: "stereo_collapse" }),
        expect.objectContaining({ kind: "lost_punch" }),
        expect.objectContaining({ kind: "over_compression" }),
        expect.objectContaining({ kind: "peak_control_regression" }),
      ]),
    );
  });

  it("flags width-instability and denoise-artifact regressions", () => {
    const report = compareVersions({
      baselineVersion: createVersion("ver_width_noise_base"),
      candidateVersion: createVersion("ver_width_noise_cand"),
      baselineAnalysis: createAnalysisReport({
        reportId: "analysis_width_noise_base",
        versionId: "ver_width_noise_base",
        integratedLufs: -16,
        truePeakDbtp: -1.6,
        samplePeakDbfs: -2,
        headroomDb: 2,
        crestFactorDb: 10.4,
        transientDensity: 1.9,
        dynamicRangeDb: 8.3,
        lowBandDb: -16.2,
        midBandDb: -11.4,
        highBandDb: -10.1,
        spectralCentroidHz: 2500,
        stereoWidth: 0.3,
        stereoCorrelation: 0.42,
        noiseFloorDbfs: -60,
        clippingDetected: false,
      }),
      candidateAnalysis: createAnalysisReport({
        reportId: "analysis_width_noise_cand",
        versionId: "ver_width_noise_cand",
        integratedLufs: -16.1,
        truePeakDbtp: -1.5,
        samplePeakDbfs: -1.9,
        headroomDb: 1.9,
        crestFactorDb: 8.9,
        transientDensity: 1.7,
        dynamicRangeDb: 7.9,
        lowBandDb: -16.4,
        midBandDb: -12,
        highBandDb: -12.5,
        spectralCentroidHz: 2240,
        stereoWidth: 0.45,
        stereoCorrelation: 0.03,
        noiseFloorDbfs: -66,
        clippingDetected: false,
      }),
      generatedAt: "2026-04-14T20:20:22Z",
    });

    expect(report.regressions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "stereo_instability" }),
        expect.objectContaining({ kind: "denoise_artifacts" }),
      ]),
    );
    expect(report.semantic_deltas).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "wider" })]),
    );
    expect(report.semantic_deltas).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "cleaner" })]),
    );
  });

  it("scores stereo-centering goals from absolute balance reduction and emits centering semantics", () => {
    const report = compareVersions({
      baselineVersion: createVersion("ver_center_base"),
      candidateVersion: createVersion("ver_center_cand"),
      baselineAnalysis: createAnalysisReport({
        reportId: "analysis_center_base",
        versionId: "ver_center_base",
        integratedLufs: -17,
        truePeakDbtp: -1.7,
        crestFactorDb: 9.7,
        transientDensity: 1.4,
        dynamicRangeDb: 7.8,
        lowBandDb: -15.4,
        midBandDb: -11.7,
        highBandDb: -10.6,
        spectralCentroidHz: 2260,
        stereoWidth: 0.29,
        stereoCorrelation: 0.73,
        stereoBalanceDb: 2.6,
        noiseFloorDbfs: -71,
        clippingDetected: false,
      }),
      candidateAnalysis: createAnalysisReport({
        reportId: "analysis_center_cand",
        versionId: "ver_center_cand",
        integratedLufs: -17.1,
        truePeakDbtp: -1.9,
        crestFactorDb: 9.7,
        transientDensity: 1.4,
        dynamicRangeDb: 7.8,
        lowBandDb: -15.4,
        midBandDb: -11.7,
        highBandDb: -10.6,
        spectralCentroidHz: 2260,
        stereoWidth: 0.25,
        stereoCorrelation: 0.79,
        stereoBalanceDb: 0.8,
        noiseFloorDbfs: -71.2,
        clippingDetected: false,
      }),
      editPlan: {
        ...createEditPlan(),
        version_id: "ver_center_base",
        goals: ["reduce left-right stereo imbalance conservatively"],
        verification_targets: [
          {
            target_id: "target_center_stereo_balance",
            goal: "reduce left-right stereo imbalance conservatively",
            label: "bring absolute stereo balance closer to center",
            kind: "analysis_metric",
            comparison: "at_most",
            metric: "derived.absolute_stereo_balance_db",
            threshold: 1,
            tolerance: 0.25,
          },
          {
            target_id: "target_center_no_balance_regression",
            goal: "reduce left-right stereo imbalance conservatively",
            label: "avoid worsening stereo imbalance while recentering",
            kind: "regression_guard",
            comparison: "absent",
            regression_kind: "stereo_balance_regression",
          },
        ],
      },
      generatedAt: "2026-04-21T19:20:22Z",
    });

    expect(report.metric_deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: "derived.absolute_stereo_balance_db",
          direction: "decreased",
          delta: -1.8,
        }),
      ]),
    );
    expect(report.semantic_deltas).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "more_centered" })]),
    );
    expect(report.verification_results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target_id: "target_center_stereo_balance", status: "met" }),
        expect.objectContaining({
          target_id: "target_center_no_balance_regression",
          status: "met",
        }),
      ]),
    );
    expect(report.goal_alignment).toEqual([
      { goal: "reduce left-right stereo imbalance conservatively", status: "met" },
    ]);
  });

  it("flags a stereo-balance regression when the image drifts farther off-center", () => {
    const report = compareVersions({
      baselineVersion: createVersion("ver_balance_reg_base"),
      candidateVersion: createVersion("ver_balance_reg_cand"),
      baselineAnalysis: createAnalysisReport({
        reportId: "analysis_balance_reg_base",
        versionId: "ver_balance_reg_base",
        integratedLufs: -17,
        truePeakDbtp: -1.7,
        crestFactorDb: 9.7,
        transientDensity: 1.4,
        dynamicRangeDb: 7.8,
        lowBandDb: -15.4,
        midBandDb: -11.7,
        highBandDb: -10.6,
        spectralCentroidHz: 2260,
        stereoWidth: 0.29,
        stereoCorrelation: 0.73,
        stereoBalanceDb: 1.1,
        noiseFloorDbfs: -71,
        clippingDetected: false,
      }),
      candidateAnalysis: createAnalysisReport({
        reportId: "analysis_balance_reg_cand",
        versionId: "ver_balance_reg_cand",
        integratedLufs: -17,
        truePeakDbtp: -1.8,
        crestFactorDb: 9.7,
        transientDensity: 1.4,
        dynamicRangeDb: 7.8,
        lowBandDb: -15.4,
        midBandDb: -11.7,
        highBandDb: -10.6,
        spectralCentroidHz: 2260,
        stereoWidth: 0.27,
        stereoCorrelation: 0.76,
        stereoBalanceDb: 2.8,
        noiseFloorDbfs: -71.1,
        clippingDetected: false,
      }),
      generatedAt: "2026-04-21T19:22:22Z",
    });

    expect(report.regressions).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "stereo_balance_regression" })]),
    );
    expect(report.semantic_deltas).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "less_centered" })]),
    );
  });

  it("uses estimated-noise-floor wording for noise semantic deltas", () => {
    const report = compareVersions({
      baselineVersion: createVersion("ver_noise_wording_base"),
      candidateVersion: createVersion("ver_noise_wording_cand"),
      baselineAnalysis: createAnalysisReport({
        reportId: "analysis_noise_wording_base",
        versionId: "ver_noise_wording_base",
        integratedLufs: -16,
        truePeakDbtp: -1.6,
        crestFactorDb: 10.4,
        transientDensity: 1.9,
        dynamicRangeDb: 8.3,
        lowBandDb: -16.2,
        midBandDb: -11.4,
        highBandDb: -10.1,
        spectralCentroidHz: 2500,
        stereoWidth: 0.3,
        stereoCorrelation: 0.42,
        noiseFloorDbfs: -60,
        clippingDetected: false,
      }),
      candidateAnalysis: createAnalysisReport({
        reportId: "analysis_noise_wording_cand",
        versionId: "ver_noise_wording_cand",
        integratedLufs: -16,
        truePeakDbtp: -1.6,
        crestFactorDb: 10.3,
        transientDensity: 1.88,
        dynamicRangeDb: 8.1,
        lowBandDb: -16.2,
        midBandDb: -11.5,
        highBandDb: -10.3,
        spectralCentroidHz: 2470,
        stereoWidth: 0.31,
        stereoCorrelation: 0.43,
        noiseFloorDbfs: -64,
        clippingDetected: false,
      }),
      generatedAt: "2026-04-14T20:20:22Z",
    });

    expect(report.semantic_deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "cleaner",
          evidence:
            "estimated noise floor decreased without a matching collapse in high-band or punch metrics",
        }),
      ]),
    );
  });

  it("emits Layer 2 compare evidence for restoration and normalization side effects", () => {
    const report = compareVersions({
      baselineVersion: createVersion("ver_layer2_base"),
      candidateVersion: createVersion("ver_layer2_cand"),
      baselineAnalysis: createAnalysisReport({
        reportId: "analysis_layer2_base",
        versionId: "ver_layer2_base",
        integratedLufs: -16,
        truePeakDbtp: -1.8,
        samplePeakDbfs: -1.8,
        headroomDb: 1.8,
        crestFactorDb: 10.2,
        transientDensity: 1.8,
        dynamicRangeDb: 8.4,
        lowBandDb: -16,
        midBandDb: -11,
        highBandDb: -10.5,
        spectralCentroidHz: 2400,
        brightnessTiltDb: 5.5,
        presenceBandDb: -10.2,
        harshnessRatioDb: 1.1,
        stereoWidth: 0.52,
        stereoCorrelation: 0.48,
        stereoBalanceDb: 0.2,
        noiseFloorDbfs: -72,
        clippedSampleCount: 4,
        clippingDetected: false,
      }),
      candidateAnalysis: createAnalysisReport({
        reportId: "analysis_layer2_cand",
        versionId: "ver_layer2_cand",
        integratedLufs: -13.8,
        truePeakDbtp: -0.4,
        samplePeakDbfs: -0.4,
        headroomDb: 0.4,
        crestFactorDb: 10.1,
        transientDensity: 1.75,
        dynamicRangeDb: 8.1,
        lowBandDb: -12.8,
        midBandDb: -10.1,
        highBandDb: -8.9,
        spectralCentroidHz: 2550,
        brightnessTiltDb: 8.1,
        presenceBandDb: -8.8,
        harshnessRatioDb: 2.1,
        stereoWidth: 0.51,
        stereoCorrelation: 0.49,
        stereoBalanceDb: 0.3,
        noiseFloorDbfs: -70.5,
        clippedSampleCount: 32,
        clippingDetected: false,
      }),
      generatedAt: "2026-04-18T20:20:22Z",
    });

    expect(report.metric_deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: "spectral_balance.presence_band_db",
          direction: "increased",
          delta: 1.4,
        }),
        expect.objectContaining({
          metric: "spectral_balance.harshness_ratio_db",
          direction: "increased",
          delta: 1,
        }),
        expect.objectContaining({
          metric: "artifacts.clipped_sample_count",
          direction: "increased",
          delta: 28,
        }),
      ]),
    );
    expect(report.semantic_deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "brighter" }),
        expect.objectContaining({ label: "more_sibilant" }),
      ]),
    );
    expect(report.regressions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "loudness_headroom_loss" }),
        expect.objectContaining({ kind: "increased_sibilance" }),
        expect.objectContaining({ kind: "increased_hum_proxy" }),
      ]),
    );
    expect(report.regressions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "added_muddiness" })]),
    );
  });

  it("does not label a broad louder-control lift as muddiness without a duller tilt", () => {
    const report = compareVersions({
      baselineVersion: createVersion("ver_louder_control_base"),
      candidateVersion: createVersion("ver_louder_control_cand"),
      baselineAnalysis: createAnalysisReport({
        reportId: "analysis_louder_control_base",
        versionId: "ver_louder_control_base",
        integratedLufs: -11.1,
        truePeakDbtp: -2.0,
        samplePeakDbfs: -2.1,
        headroomDb: 2.1,
        crestFactorDb: 11.4,
        transientDensity: 2.2,
        dynamicRangeDb: 8.6,
        lowBandDb: -12.2,
        midBandDb: -11.7,
        highBandDb: -10.3,
        spectralCentroidHz: 2100,
        brightnessTiltDb: 3.4,
        presenceBandDb: -8.5,
        harshnessRatioDb: 1.6,
        stereoWidth: 0.12,
        stereoCorrelation: 0.98,
        stereoBalanceDb: 0,
        noiseFloorDbfs: -74,
        clippedSampleCount: 0,
        clippingDetected: false,
      }),
      candidateAnalysis: createAnalysisReport({
        reportId: "analysis_louder_control_cand",
        versionId: "ver_louder_control_cand",
        integratedLufs: -10,
        truePeakDbtp: -1.4,
        samplePeakDbfs: -1.5,
        headroomDb: 1.5,
        crestFactorDb: 10.5,
        transientDensity: 2.25,
        dynamicRangeDb: 7.6,
        lowBandDb: -11.0,
        midBandDb: -10.55,
        highBandDb: -9.25,
        spectralCentroidHz: 2125,
        brightnessTiltDb: 3.45,
        presenceBandDb: -7.3,
        harshnessRatioDb: 1.65,
        stereoWidth: 0.12,
        stereoCorrelation: 0.98,
        stereoBalanceDb: 0,
        noiseFloorDbfs: -73,
        clippedSampleCount: 0,
        clippingDetected: false,
      }),
      generatedAt: "2026-04-19T22:00:00Z",
    });

    expect(report.regressions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "added_muddiness" })]),
    );
  });
});

describe("evaluateGoalAlignment", () => {
  it("supports first-slice prompt wording variants", () => {
    const baseline = createAnalysisReport({
      reportId: "analysis_prompt_base",
      versionId: "ver_prompt_base",
      integratedLufs: -14.8,
      truePeakDbtp: -1.1,
      samplePeakDbfs: -1.5,
      headroomDb: 1.5,
      crestFactorDb: 10.3,
      transientDensity: 2,
      dynamicRangeDb: 8.5,
      lowBandDb: -16.4,
      midBandDb: -11.2,
      highBandDb: -9.8,
      spectralCentroidHz: 2650,
      stereoWidth: 0.62,
      stereoCorrelation: 0.41,
      noiseFloorDbfs: -72,
      clippingDetected: false,
    }).measurements;
    const candidate = createAnalysisReport({
      reportId: "analysis_prompt_cand",
      versionId: "ver_prompt_cand",
      integratedLufs: -15,
      truePeakDbtp: -1.2,
      samplePeakDbfs: -1.7,
      headroomDb: 1.7,
      crestFactorDb: 10.2,
      transientDensity: 1.98,
      dynamicRangeDb: 8.2,
      lowBandDb: -16.3,
      midBandDb: -11.4,
      highBandDb: -11.1,
      spectralCentroidHz: 2440,
      stereoWidth: 0.62,
      stereoCorrelation: 0.43,
      noiseFloorDbfs: -75.5,
      clippingDetected: false,
    }).measurements;

    const goalAlignment = evaluateGoalAlignment(
      [
        "make this loop darker",
        "make it less harsh",
        "clean this sample up a bit",
        "keep the punch",
      ],
      baseline,
      candidate,
      computeAnalysisMetricDeltas(baseline, candidate),
    );

    expect(goalAlignment).toEqual([
      { goal: "make this loop darker", status: "met" },
      { goal: "make it less harsh", status: "met" },
      { goal: "clean this sample up a bit", status: "met" },
      { goal: "keep the punch", status: "met" },
    ]);
  });

  it("returns unknown for broad ambiguous wording", () => {
    const baseline = createAnalysisReport({
      reportId: "analysis_ambiguous_base",
      versionId: "ver_ambiguous_base",
      integratedLufs: -14.8,
      truePeakDbtp: -1.1,
      crestFactorDb: 10.3,
      transientDensity: 2,
      lowBandDb: -16.4,
      midBandDb: -11.2,
      highBandDb: -9.8,
      spectralCentroidHz: 2650,
      stereoWidth: 0.62,
      stereoCorrelation: 0.41,
      noiseFloorDbfs: -72,
      clippingDetected: false,
    }).measurements;
    const candidate = createAnalysisReport({
      reportId: "analysis_ambiguous_cand",
      versionId: "ver_ambiguous_cand",
      integratedLufs: -14.8,
      truePeakDbtp: -1.1,
      crestFactorDb: 10.3,
      transientDensity: 2,
      lowBandDb: -16.4,
      midBandDb: -11.2,
      highBandDb: -9.8,
      spectralCentroidHz: 2650,
      stereoWidth: 0.62,
      stereoCorrelation: 0.41,
      noiseFloorDbfs: -72,
      clippingDetected: false,
    }).measurements;

    const goalAlignment = evaluateGoalAlignment(
      ["make it better", "clean it"],
      baseline,
      candidate,
      computeAnalysisMetricDeltas(baseline, candidate),
    );

    expect(goalAlignment).toEqual([
      { goal: "make it better", status: "unknown" },
      { goal: "clean it", status: "unknown" },
    ]);
  });

  it("scores compound dynamics-sensitive goals without guessing", () => {
    const baseline = createAnalysisReport({
      reportId: "analysis_dynamics_base",
      versionId: "ver_dynamics_base",
      integratedLufs: -15.2,
      truePeakDbtp: -1.1,
      samplePeakDbfs: -1.4,
      headroomDb: 1.4,
      crestFactorDb: 10.5,
      transientDensity: 1.9,
      dynamicRangeDb: 8.1,
      lowBandDb: -16.2,
      midBandDb: -11.4,
      highBandDb: -9.5,
      spectralCentroidHz: 2600,
      stereoWidth: 0.58,
      stereoCorrelation: 0.46,
      noiseFloorDbfs: -73,
      clippingDetected: false,
    }).measurements;
    const candidate = createAnalysisReport({
      reportId: "analysis_dynamics_cand",
      versionId: "ver_dynamics_cand",
      integratedLufs: -15.5,
      truePeakDbtp: -1.7,
      samplePeakDbfs: -2.1,
      headroomDb: 2.1,
      crestFactorDb: 10.2,
      transientDensity: 1.87,
      dynamicRangeDb: 7.7,
      lowBandDb: -16.1,
      midBandDb: -11.5,
      highBandDb: -10.8,
      spectralCentroidHz: 2450,
      stereoWidth: 0.58,
      stereoCorrelation: 0.47,
      noiseFloorDbfs: -73,
      clippingDetected: false,
    }).measurements;

    const goalAlignment = evaluateGoalAlignment(
      [
        "make it less harsh but keep the punch",
        "control peaks without killing the punch",
        "keep the level under control",
      ],
      baseline,
      candidate,
      computeAnalysisMetricDeltas(baseline, candidate),
    );

    expect(goalAlignment).toEqual([
      { goal: "make it less harsh but keep the punch", status: "met" },
      { goal: "control peaks without killing the punch", status: "met" },
      { goal: "keep the level under control", status: "met" },
    ]);
  });

  it("understands planner-emitted conservative peak-control goal wording", () => {
    const baseline = createAnalysisReport({
      reportId: "analysis_peak_goal_base",
      versionId: "ver_peak_goal_base",
      integratedLufs: -15.2,
      truePeakDbtp: -1.1,
      samplePeakDbfs: -1.4,
      headroomDb: 1.4,
      crestFactorDb: 10.5,
      transientDensity: 1.9,
      dynamicRangeDb: 8.1,
      lowBandDb: -16.2,
      midBandDb: -11.4,
      highBandDb: -9.5,
      spectralCentroidHz: 2600,
      stereoWidth: 0.58,
      stereoCorrelation: 0.46,
      noiseFloorDbfs: -73,
      clippingDetected: false,
    }).measurements;
    const candidate = createAnalysisReport({
      reportId: "analysis_peak_goal_cand",
      versionId: "ver_peak_goal_cand",
      integratedLufs: -15.4,
      truePeakDbtp: -1.7,
      samplePeakDbfs: -2.1,
      headroomDb: 2.1,
      crestFactorDb: 10.2,
      transientDensity: 1.87,
      dynamicRangeDb: 7.8,
      lowBandDb: -16.1,
      midBandDb: -11.5,
      highBandDb: -10.4,
      spectralCentroidHz: 2470,
      stereoWidth: 0.58,
      stereoCorrelation: 0.47,
      noiseFloorDbfs: -73,
      clippingDetected: false,
    }).measurements;

    const goalAlignment = evaluateGoalAlignment(
      ["control peak excursions conservatively"],
      baseline,
      candidate,
      computeAnalysisMetricDeltas(baseline, candidate),
    );

    expect(goalAlignment).toEqual([
      { goal: "control peak excursions conservatively", status: "met" },
    ]);
  });

  it("scores width and denoise prompt families conservatively", () => {
    const baseline = createAnalysisReport({
      reportId: "analysis_width_cleanup_base",
      versionId: "ver_width_cleanup_base",
      integratedLufs: -15.5,
      truePeakDbtp: -1.4,
      samplePeakDbfs: -1.8,
      headroomDb: 1.8,
      crestFactorDb: 10.1,
      transientDensity: 1.85,
      dynamicRangeDb: 8,
      lowBandDb: -16.1,
      midBandDb: -11.3,
      highBandDb: -10,
      spectralCentroidHz: 2480,
      stereoWidth: 0.31,
      stereoCorrelation: 0.39,
      noiseFloorDbfs: -60,
      clippingDetected: false,
    }).measurements;
    const candidate = createAnalysisReport({
      reportId: "analysis_width_cleanup_cand",
      versionId: "ver_width_cleanup_cand",
      integratedLufs: -15.4,
      truePeakDbtp: -1.5,
      samplePeakDbfs: -1.9,
      headroomDb: 1.9,
      crestFactorDb: 9.9,
      transientDensity: 1.8,
      dynamicRangeDb: 7.8,
      lowBandDb: -16.2,
      midBandDb: -11.5,
      highBandDb: -10.6,
      spectralCentroidHz: 2420,
      stereoWidth: 0.4,
      stereoCorrelation: 0.31,
      noiseFloorDbfs: -64.5,
      clippingDetected: false,
    }).measurements;

    const goalAlignment = evaluateGoalAlignment(
      [
        "widen this slightly without making it phasey",
        "reduce steady background noise without obvious denoise artifacts",
      ],
      baseline,
      candidate,
      computeAnalysisMetricDeltas(baseline, candidate),
    );

    expect(goalAlignment).toEqual([
      { goal: "widen this slightly without making it phasey", status: "met" },
      {
        goal: "reduce steady background noise without obvious denoise artifacts",
        status: "met",
      },
    ]);
  });

  it("marks width and denoise goals not met when the measurable side effects are too large", () => {
    const baseline = createAnalysisReport({
      reportId: "analysis_width_cleanup_fail_base",
      versionId: "ver_width_cleanup_fail_base",
      integratedLufs: -15.5,
      truePeakDbtp: -1.4,
      samplePeakDbfs: -1.8,
      headroomDb: 1.8,
      crestFactorDb: 10.2,
      transientDensity: 1.9,
      dynamicRangeDb: 8.2,
      lowBandDb: -16.1,
      midBandDb: -11.3,
      highBandDb: -10,
      spectralCentroidHz: 2480,
      stereoWidth: 0.3,
      stereoCorrelation: 0.4,
      noiseFloorDbfs: -60,
      clippingDetected: false,
    }).measurements;
    const candidate = createAnalysisReport({
      reportId: "analysis_width_cleanup_fail_cand",
      versionId: "ver_width_cleanup_fail_cand",
      integratedLufs: -15.6,
      truePeakDbtp: -1.4,
      samplePeakDbfs: -1.8,
      headroomDb: 1.8,
      crestFactorDb: 8.7,
      transientDensity: 1.68,
      dynamicRangeDb: 7.1,
      lowBandDb: -16.2,
      midBandDb: -12,
      highBandDb: -12.4,
      spectralCentroidHz: 2230,
      stereoWidth: 0.46,
      stereoCorrelation: 0.04,
      noiseFloorDbfs: -66.5,
      clippingDetected: false,
    }).measurements;

    const goalAlignment = evaluateGoalAlignment(
      [
        "widen this slightly without making it phasey",
        "reduce steady background noise without obvious denoise artifacts",
      ],
      baseline,
      candidate,
      computeAnalysisMetricDeltas(baseline, candidate),
    );

    expect(goalAlignment).toEqual([
      { goal: "widen this slightly without making it phasey", status: "not_met" },
      {
        goal: "reduce steady background noise without obvious denoise artifacts",
        status: "not_met",
      },
    ]);
  });

  it("marks compound goals not met when peak control flattens dynamics", () => {
    const baseline = createAnalysisReport({
      reportId: "analysis_flat_base",
      versionId: "ver_flat_base",
      integratedLufs: -16,
      truePeakDbtp: -1.2,
      samplePeakDbfs: -1.6,
      headroomDb: 1.6,
      crestFactorDb: 10.8,
      transientDensity: 2,
      dynamicRangeDb: 8.8,
      lowBandDb: -16.5,
      midBandDb: -11.6,
      highBandDb: -10.2,
      spectralCentroidHz: 2550,
      stereoWidth: 0.57,
      stereoCorrelation: 0.49,
      noiseFloorDbfs: -74,
      clippingDetected: false,
    }).measurements;
    const candidate = createAnalysisReport({
      reportId: "analysis_flat_cand",
      versionId: "ver_flat_cand",
      integratedLufs: -15.9,
      truePeakDbtp: -1.5,
      samplePeakDbfs: -1.9,
      headroomDb: 1.9,
      crestFactorDb: 8.6,
      transientDensity: 1.55,
      dynamicRangeDb: 5.6,
      lowBandDb: -16.4,
      midBandDb: -11.8,
      highBandDb: -10.9,
      spectralCentroidHz: 2430,
      stereoWidth: 0.57,
      stereoCorrelation: 0.5,
      noiseFloorDbfs: -74,
      clippingDetected: false,
    }).measurements;

    const goalAlignment = evaluateGoalAlignment(
      ["control peaks without killing the punch"],
      baseline,
      candidate,
      computeAnalysisMetricDeltas(baseline, candidate),
    );

    expect(goalAlignment).toEqual([
      { goal: "control peaks without killing the punch", status: "not_met" },
    ]);
  });

  it("scores Layer 2 tonal goals with evidence-backed semantics", () => {
    const baseline = createAnalysisReport({
      reportId: "analysis_layer2_tonal_base",
      versionId: "ver_layer2_tonal_base",
      integratedLufs: -15.3,
      truePeakDbtp: -1.4,
      samplePeakDbfs: -1.7,
      headroomDb: 1.7,
      crestFactorDb: 10.2,
      transientDensity: 1.9,
      dynamicRangeDb: 8,
      lowBandDb: -16.1,
      midBandDb: -11.4,
      highBandDb: -10.6,
      spectralCentroidHz: 2420,
      brightnessTiltDb: 5.5,
      presenceBandDb: -9.1,
      harshnessRatioDb: 1,
      stereoWidth: 0.52,
      stereoCorrelation: 0.45,
      stereoBalanceDb: 0.2,
      noiseFloorDbfs: -72,
      clippedSampleCount: 0,
      clippingDetected: false,
    }).measurements;
    const candidate = createAnalysisReport({
      reportId: "analysis_layer2_tonal_cand",
      versionId: "ver_layer2_tonal_cand",
      integratedLufs: -15.2,
      truePeakDbtp: -1.5,
      samplePeakDbfs: -1.8,
      headroomDb: 1.8,
      crestFactorDb: 10.1,
      transientDensity: 1.86,
      dynamicRangeDb: 7.9,
      lowBandDb: -16,
      midBandDb: -12.3,
      highBandDb: -9.6,
      spectralCentroidHz: 2520,
      brightnessTiltDb: 6.4,
      presenceBandDb: -10.1,
      harshnessRatioDb: 0.3,
      stereoWidth: 0.52,
      stereoCorrelation: 0.46,
      stereoBalanceDb: 0.2,
      noiseFloorDbfs: -72,
      clippedSampleCount: 0,
      clippingDetected: false,
    }).measurements;

    const goalAlignment = evaluateGoalAlignment(
      ["add a little air", "reduce low-mid muddiness", "reduce sibilance"],
      baseline,
      candidate,
      computeAnalysisMetricDeltas(baseline, candidate),
    );

    expect(goalAlignment).toEqual([
      { goal: "add a little air", status: "met" },
      { goal: "reduce low-mid muddiness", status: "met" },
      { goal: "reduce sibilance", status: "met" },
    ]);
  });

  it("scores hum, click, and loudness-stability goals conservatively", () => {
    const baseline = createAnalysisReport({
      reportId: "analysis_layer2_restore_base",
      versionId: "ver_layer2_restore_base",
      integratedLufs: -15.8,
      truePeakDbtp: -1.6,
      samplePeakDbfs: -1.9,
      headroomDb: 1.9,
      crestFactorDb: 10.1,
      transientDensity: 1.85,
      dynamicRangeDb: 8,
      lowBandDb: -13.5,
      midBandDb: -11.2,
      highBandDb: -10.4,
      spectralCentroidHz: 2380,
      brightnessTiltDb: 3.1,
      presenceBandDb: -9.5,
      harshnessRatioDb: 0.8,
      stereoWidth: 0.47,
      stereoCorrelation: 0.52,
      stereoBalanceDb: 0.1,
      noiseFloorDbfs: -61.5,
      clippedSampleCount: 120,
      clippingDetected: false,
    }).measurements;
    const candidate = createAnalysisReport({
      reportId: "analysis_layer2_restore_cand",
      versionId: "ver_layer2_restore_cand",
      integratedLufs: -15.4,
      truePeakDbtp: -1.4,
      samplePeakDbfs: -1.6,
      headroomDb: 1.6,
      crestFactorDb: 9.9,
      transientDensity: 1.78,
      dynamicRangeDb: 7.8,
      lowBandDb: -17.8,
      midBandDb: -11.3,
      highBandDb: -10.5,
      spectralCentroidHz: 2370,
      brightnessTiltDb: 2.7,
      presenceBandDb: -9.6,
      harshnessRatioDb: 0.7,
      stereoWidth: 0.47,
      stereoCorrelation: 0.53,
      stereoBalanceDb: 0.1,
      noiseFloorDbfs: -63,
      clippedSampleCount: 12,
      clippingDetected: false,
    }).measurements;

    const goalAlignment = evaluateGoalAlignment(
      ["reduce hum", "reduce clicks", "keep loudness stable"],
      baseline,
      candidate,
      computeAnalysisMetricDeltas(baseline, candidate),
    );

    expect(goalAlignment).toEqual([
      { goal: "reduce hum", status: "mostly_met" },
      { goal: "reduce clicks", status: "unknown" },
      { goal: "keep loudness stable", status: "met" },
    ]);
  });

  it("treats normalization goals as direction-agnostic target moves", () => {
    const baseline = createAnalysisReport({
      reportId: "analysis_normalize_base",
      versionId: "ver_normalize_base",
      integratedLufs: -11.2,
      truePeakDbtp: -0.8,
      samplePeakDbfs: -1.1,
      headroomDb: 1.1,
      crestFactorDb: 9.4,
      transientDensity: 1.7,
      dynamicRangeDb: 7.4,
      lowBandDb: -14.6,
      midBandDb: -11,
      highBandDb: -10.2,
      spectralCentroidHz: 2320,
      brightnessTiltDb: 3.2,
      presenceBandDb: -9.2,
      harshnessRatioDb: 0.7,
      stereoWidth: 0.45,
      stereoCorrelation: 0.51,
      stereoBalanceDb: 0.1,
      noiseFloorDbfs: -68,
      clippedSampleCount: 0,
      clippingDetected: false,
    }).measurements;
    const candidate = createAnalysisReport({
      reportId: "analysis_normalize_cand",
      versionId: "ver_normalize_cand",
      integratedLufs: -13,
      truePeakDbtp: -1.1,
      samplePeakDbfs: -1.5,
      headroomDb: 1.5,
      crestFactorDb: 9.5,
      transientDensity: 1.69,
      dynamicRangeDb: 7.3,
      lowBandDb: -14.6,
      midBandDb: -11.1,
      highBandDb: -10.3,
      spectralCentroidHz: 2310,
      brightnessTiltDb: 3.1,
      presenceBandDb: -9.3,
      harshnessRatioDb: 0.7,
      stereoWidth: 0.45,
      stereoCorrelation: 0.52,
      stereoBalanceDb: 0.1,
      noiseFloorDbfs: -68,
      clippedSampleCount: 0,
      clippingDetected: false,
    }).measurements;

    const goalAlignment = evaluateGoalAlignment(
      ["normalize to a quieter target loudness"],
      baseline,
      candidate,
      computeAnalysisMetricDeltas(baseline, candidate),
    );

    expect(goalAlignment).toEqual([
      { goal: "normalize to a quieter target loudness", status: "met" },
    ]);
  });

  it("returns unknown for inverse air and warmth wording", () => {
    const baseline = createAnalysisReport({
      reportId: "analysis_inverse_tone_base",
      versionId: "ver_inverse_tone_base",
      integratedLufs: -15,
      truePeakDbtp: -1.4,
      crestFactorDb: 10,
      transientDensity: 1.85,
      dynamicRangeDb: 8,
      lowBandDb: -15.9,
      midBandDb: -11.4,
      highBandDb: -10.2,
      spectralCentroidHz: 2400,
      brightnessTiltDb: 4.2,
      presenceBandDb: -9.4,
      harshnessRatioDb: 0.8,
      stereoWidth: 0.48,
      stereoCorrelation: 0.5,
      noiseFloorDbfs: -70,
      clippingDetected: false,
    }).measurements;
    const candidate = createAnalysisReport({
      reportId: "analysis_inverse_tone_cand",
      versionId: "ver_inverse_tone_cand",
      integratedLufs: -15,
      truePeakDbtp: -1.4,
      crestFactorDb: 10,
      transientDensity: 1.85,
      dynamicRangeDb: 8,
      lowBandDb: -16.6,
      midBandDb: -11.4,
      highBandDb: -11.1,
      spectralCentroidHz: 2260,
      brightnessTiltDb: 3.2,
      presenceBandDb: -9.8,
      harshnessRatioDb: 0.8,
      stereoWidth: 0.48,
      stereoCorrelation: 0.5,
      noiseFloorDbfs: -70,
      clippingDetected: false,
    }).measurements;

    const goalAlignment = evaluateGoalAlignment(
      ["make it less warm", "remove some air"],
      baseline,
      candidate,
      computeAnalysisMetricDeltas(baseline, candidate),
    );

    expect(goalAlignment).toEqual([
      { goal: "make it less warm", status: "unknown" },
      { goal: "remove some air", status: "unknown" },
    ]);
  });

  it("does not double-score hum-only requests as generic cleanup", () => {
    const baseline = createAnalysisReport({
      reportId: "analysis_hum_only_base",
      versionId: "ver_hum_only_base",
      integratedLufs: -15.8,
      truePeakDbtp: -1.6,
      samplePeakDbfs: -1.9,
      headroomDb: 1.9,
      crestFactorDb: 10.1,
      transientDensity: 1.85,
      dynamicRangeDb: 8,
      lowBandDb: -13.5,
      midBandDb: -11.2,
      highBandDb: -10.4,
      spectralCentroidHz: 2380,
      brightnessTiltDb: 3.1,
      presenceBandDb: -9.5,
      harshnessRatioDb: 0.8,
      stereoWidth: 0.47,
      stereoCorrelation: 0.52,
      stereoBalanceDb: 0.1,
      noiseFloorDbfs: -61.5,
      clippedSampleCount: 0,
      clippingDetected: false,
    }).measurements;
    const candidate = createAnalysisReport({
      reportId: "analysis_hum_only_cand",
      versionId: "ver_hum_only_cand",
      integratedLufs: -15.7,
      truePeakDbtp: -1.5,
      samplePeakDbfs: -1.8,
      headroomDb: 1.8,
      crestFactorDb: 10,
      transientDensity: 1.84,
      dynamicRangeDb: 7.9,
      lowBandDb: -17.9,
      midBandDb: -11.3,
      highBandDb: -10.4,
      spectralCentroidHz: 2375,
      brightnessTiltDb: 2.8,
      presenceBandDb: -9.5,
      harshnessRatioDb: 0.8,
      stereoWidth: 0.47,
      stereoCorrelation: 0.53,
      stereoBalanceDb: 0.1,
      noiseFloorDbfs: -61.2,
      clippedSampleCount: 0,
      clippingDetected: false,
    }).measurements;

    const goalAlignment = evaluateGoalAlignment(
      ["reduce hum"],
      baseline,
      candidate,
      computeAnalysisMetricDeltas(baseline, candidate),
    );

    expect(goalAlignment).toEqual([{ goal: "reduce hum", status: "mostly_met" }]);
  });
});

describe("compareRenders", () => {
  it("performs an explicit thin render comparison without analysis reports", () => {
    const report = compareRenders({
      baselineRender: createRenderArtifact({
        renderId: "render_base123",
        versionId: "ver_baseline123",
        sampleRateHz: 44100,
        channels: 2,
        durationSeconds: 4,
        fileSizeBytes: 48211,
        integratedLufs: -15.1,
        truePeakDbtp: -1.2,
      }),
      candidateRender: createRenderArtifact({
        renderId: "render_cand123",
        versionId: "ver_candidate123",
        sampleRateHz: 48000,
        channels: 1,
        durationSeconds: 4.08,
        fileSizeBytes: 45100,
        integratedLufs: -12,
        truePeakDbtp: -0.5,
      }),
      generatedAt: new Date("2026-04-14T20:20:22Z"),
    });

    expect(validateComparisonReport(report)).toBe(true);
    expect(report.metric_deltas).toContainEqual({
      metric: "output.sample_rate_hz",
      direction: "increased",
      delta: 3900,
    });
    expect(report.metric_deltas).toContainEqual({
      metric: "loudness_summary.integrated_lufs",
      direction: "increased",
      delta: 3.1,
    });
    expect(report.semantic_deltas).toBeUndefined();
    expect(report.evaluation_basis).toEqual({
      metric_source: "render_artifacts",
      goal_evaluation_source: "none",
      authoritative_signal: "metric_deltas",
    });
    expect(report.regressions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "render_duration_mismatch" }),
        expect.objectContaining({ kind: "render_channel_change" }),
        expect.objectContaining({ kind: "render_sample_rate_change" }),
      ]),
    );
  });

  it("rejects unpaired render analysis inputs", () => {
    expect(() =>
      compareRenders({
        baselineRender: createRenderArtifact({
          renderId: "render_pair_base",
          versionId: "ver_pair_base",
          sampleRateHz: 44100,
          channels: 2,
          durationSeconds: 4,
          fileSizeBytes: 48211,
          integratedLufs: -15.1,
          truePeakDbtp: -1.2,
        }),
        candidateRender: createRenderArtifact({
          renderId: "render_pair_cand",
          versionId: "ver_pair_cand",
          sampleRateHz: 44100,
          channels: 2,
          durationSeconds: 4,
          fileSizeBytes: 48100,
          integratedLufs: -15,
          truePeakDbtp: -1.1,
        }),
        baselineAnalysis: createAnalysisReport({
          reportId: "analysis_pair_base",
          versionId: "ver_pair_base",
          integratedLufs: -15.1,
          truePeakDbtp: -1.2,
          crestFactorDb: 10,
          transientDensity: 1.8,
          lowBandDb: -16,
          midBandDb: -11,
          highBandDb: -10,
          spectralCentroidHz: 2500,
          stereoWidth: 0.5,
          stereoCorrelation: 0.4,
          noiseFloorDbfs: -72,
          clippingDetected: false,
        }),
      }),
    ).toThrow(/requires both baselineAnalysis and candidateAnalysis/i);
  });
});

describe("comparison provenance checks", () => {
  it("rejects version comparisons when analysis provenance does not match the paired version", () => {
    expect(() =>
      compareVersions({
        baselineVersion: createVersion("ver_base_mismatch"),
        candidateVersion: createVersion("ver_cand_match"),
        baselineAnalysis: createAnalysisReport({
          reportId: "analysis_base_mismatch",
          versionId: "ver_other_base",
          integratedLufs: -14.8,
          truePeakDbtp: -1.1,
          crestFactorDb: 10.3,
          transientDensity: 2,
          lowBandDb: -16.4,
          midBandDb: -11.2,
          highBandDb: -9.8,
          spectralCentroidHz: 2650,
          stereoWidth: 0.62,
          stereoCorrelation: 0.41,
          noiseFloorDbfs: -72,
          clippingDetected: false,
        }),
        candidateAnalysis: createAnalysisReport({
          reportId: "analysis_cand_match",
          versionId: "ver_cand_match",
          integratedLufs: -15,
          truePeakDbtp: -1.2,
          crestFactorDb: 10.2,
          transientDensity: 1.98,
          lowBandDb: -16.3,
          midBandDb: -11.4,
          highBandDb: -11.1,
          spectralCentroidHz: 2440,
          stereoWidth: 0.62,
          stereoCorrelation: 0.43,
          noiseFloorDbfs: -75.5,
          clippingDetected: false,
        }),
      }),
    ).toThrow(/baseline AnalysisReport version_id must match the paired AudioVersion version_id/i);
  });

  it("rejects render comparisons when analysis provenance does not match the paired render", () => {
    expect(() =>
      compareRenders({
        baselineRender: createRenderArtifact({
          renderId: "render_prov_base",
          versionId: "ver_render_base",
          sampleRateHz: 44100,
          channels: 2,
          durationSeconds: 4,
          fileSizeBytes: 48211,
          integratedLufs: -15.1,
          truePeakDbtp: -1.2,
        }),
        candidateRender: createRenderArtifact({
          renderId: "render_prov_cand",
          versionId: "ver_render_cand",
          sampleRateHz: 44100,
          channels: 2,
          durationSeconds: 4,
          fileSizeBytes: 48100,
          integratedLufs: -15,
          truePeakDbtp: -1.1,
        }),
        baselineAnalysis: createAnalysisReport({
          reportId: "analysis_render_base",
          versionId: "ver_other_render_base",
          integratedLufs: -15.1,
          truePeakDbtp: -1.2,
          crestFactorDb: 10,
          transientDensity: 1.8,
          lowBandDb: -16,
          midBandDb: -11,
          highBandDb: -10,
          spectralCentroidHz: 2500,
          stereoWidth: 0.5,
          stereoCorrelation: 0.4,
          noiseFloorDbfs: -72,
          clippingDetected: false,
        }),
        candidateAnalysis: createAnalysisReport({
          reportId: "analysis_render_cand",
          versionId: "ver_render_cand",
          integratedLufs: -15,
          truePeakDbtp: -1.1,
          crestFactorDb: 10,
          transientDensity: 1.8,
          lowBandDb: -16,
          midBandDb: -11,
          highBandDb: -10,
          spectralCentroidHz: 2500,
          stereoWidth: 0.5,
          stereoCorrelation: 0.4,
          noiseFloorDbfs: -72,
          clippingDetected: false,
        }),
      }),
    ).toThrow(
      /baseline AnalysisReport version_id must match the paired RenderArtifact version_id/i,
    );
  });
});

function createVersion(
  versionId: string,
  options?: {
    storageRef?: string;
    sampleRateHz?: number;
    channels?: number;
    durationSeconds?: number;
    channelLayout?: string;
  },
): AudioVersion {
  const sampleRateHz = options?.sampleRateHz ?? 44100;
  const channels = options?.channels ?? 2;
  const durationSeconds = options?.durationSeconds ?? 1;
  return {
    schema_version: "1.0.0",
    version_id: versionId as `ver_${string}`,
    asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
    lineage: {
      created_at: "2026-04-14T20:20:05Z",
      created_by: "compare-test",
      reason: "fixture",
    },
    audio: {
      storage_ref: options?.storageRef ?? `storage/audio/${versionId}.wav`,
      sample_rate_hz: sampleRateHz,
      channels,
      duration_seconds: durationSeconds,
      frame_count: Math.round(durationSeconds * sampleRateHz),
      channel_layout: options?.channelLayout ?? (channels === 1 ? "mono" : "stereo"),
    },
  };
}

interface AnalysisFixtureOptions {
  reportId: string;
  versionId: string;
  integratedLufs: number;
  truePeakDbtp: number;
  rmsDbfs?: number;
  samplePeakDbfs?: number;
  headroomDb?: number;
  crestFactorDb: number;
  transientDensity: number;
  rmsShortTermDbfs?: number;
  dynamicRangeDb?: number;
  transientCrestDb?: number;
  punchWindowRatio?: number;
  lowBandDb: number;
  midBandDb: number;
  highBandDb: number;
  spectralCentroidHz: number;
  brightnessTiltDb?: number;
  presenceBandDb?: number;
  harshnessRatioDb?: number;
  stereoWidth: number;
  stereoCorrelation: number;
  stereoBalanceDb?: number;
  noiseFloorDbfs: number;
  clippedSampleCount?: number;
  humDetected?: boolean;
  humLevelDbfs?: number;
  humFundamentalHz?: number;
  humHarmonicCount?: number;
  clickDetected?: boolean;
  clickCount?: number;
  clippingDetected: boolean;
}

function createAnalysisReport(options: AnalysisFixtureOptions): AnalysisReport {
  return {
    schema_version: "1.0.0",
    report_id: options.reportId,
    asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
    version_id: options.versionId,
    generated_at: "2026-04-14T20:20:10Z",
    analyzer: {
      name: "default-analysis",
      version: "0.1.0",
    },
    summary: {
      plain_text: "fixture summary",
    },
    measurements: {
      levels: {
        integrated_lufs: options.integratedLufs,
        true_peak_dbtp: options.truePeakDbtp,
        rms_dbfs: options.rmsDbfs ?? options.integratedLufs - 3,
        sample_peak_dbfs: options.samplePeakDbfs ?? options.truePeakDbtp - 0.3,
        headroom_db: options.headroomDb ?? Math.max(0, -(options.truePeakDbtp - 0.3)),
      },
      dynamics: {
        crest_factor_db: options.crestFactorDb,
        transient_density_per_second: options.transientDensity,
        rms_short_term_dbfs: options.rmsShortTermDbfs ?? options.integratedLufs - 1.5,
        dynamic_range_db: options.dynamicRangeDb ?? 8,
        ...(options.transientCrestDb === undefined
          ? {}
          : { transient_crest_db: options.transientCrestDb }),
        ...(options.punchWindowRatio === undefined
          ? {}
          : { punch_window_ratio: options.punchWindowRatio }),
      },
      spectral_balance: {
        low_band_db: options.lowBandDb,
        mid_band_db: options.midBandDb,
        high_band_db: options.highBandDb,
        spectral_centroid_hz: options.spectralCentroidHz,
        ...(options.brightnessTiltDb === undefined
          ? {}
          : { brightness_tilt_db: options.brightnessTiltDb }),
        ...(options.presenceBandDb === undefined
          ? {}
          : { presence_band_db: options.presenceBandDb }),
        ...(options.harshnessRatioDb === undefined
          ? {}
          : { harshness_ratio_db: options.harshnessRatioDb }),
      },
      stereo: {
        width: options.stereoWidth,
        correlation: options.stereoCorrelation,
        balance_db: options.stereoBalanceDb ?? 0,
      },
      artifacts: {
        clipping_detected: options.clippingDetected,
        noise_floor_dbfs: options.noiseFloorDbfs,
        clipped_sample_count: options.clippedSampleCount ?? 0,
        hum_detected: options.humDetected ?? false,
        ...(options.humLevelDbfs === undefined ? {} : { hum_level_dbfs: options.humLevelDbfs }),
        ...(options.humFundamentalHz === undefined
          ? {}
          : { hum_fundamental_hz: options.humFundamentalHz }),
        hum_harmonic_count: options.humHarmonicCount ?? 0,
        click_detected: options.clickDetected ?? false,
        click_count: options.clickCount ?? 0,
        click_rate_per_second: (options.clickCount ?? 0) / 1,
      },
    },
  };
}

function createEditPlan(): EditPlan {
  return {
    schema_version: "1.0.0",
    plan_id: "plan_01HZX8E7J2V3M4N5P6Q7R8S9T0",
    capability_manifest_id: "capmanifest_20260418C",
    asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
    version_id: "ver_baseline123",
    user_request: "Make the loop a little darker and less harsh, but keep the punch.",
    goals: [
      "reduce upper-mid harshness",
      "slightly reduce perceived brightness",
      "preserve transient impact",
    ],
    verification_targets: [
      {
        target_id: "target_reduce_harshness_high_band",
        goal: "reduce upper-mid harshness",
        label: "reduce high-band energy in the harshness region",
        kind: "analysis_metric",
        comparison: "decrease_by",
        metric: "spectral_balance.high_band_db",
        threshold: 1,
      },
      {
        target_id: "target_reduce_brightness_tilt",
        goal: "slightly reduce perceived brightness",
        label: "reduce high-band brightness modestly",
        kind: "analysis_metric",
        comparison: "decrease_by",
        metric: "spectral_balance.high_band_db",
        threshold: 0.75,
      },
      {
        target_id: "target_preserve_punch_crest_factor",
        goal: "preserve transient impact",
        label: "keep crest factor close to the baseline",
        kind: "analysis_metric",
        comparison: "at_least",
        metric: "dynamics.crest_factor_db",
        threshold: 9.8,
        tolerance: 0.25,
      },
    ],
  };
}

interface RenderFixtureOptions {
  renderId: string;
  versionId: string;
  sampleRateHz: number;
  channels: number;
  durationSeconds: number;
  fileSizeBytes: number;
  integratedLufs: number;
  truePeakDbtp: number;
}

function createRenderArtifact(options: RenderFixtureOptions): RenderArtifact {
  return {
    schema_version: "1.0.0",
    render_id: options.renderId,
    asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
    version_id: options.versionId,
    kind: "preview",
    created_at: "2026-04-14T20:20:20Z",
    output: {
      path: `renders/${options.renderId}.mp3`,
      format: "mp3",
      codec: "libmp3lame",
      sample_rate_hz: options.sampleRateHz,
      channels: options.channels,
      duration_seconds: options.durationSeconds,
      file_size_bytes: options.fileSizeBytes,
    },
    loudness_summary: {
      integrated_lufs: options.integratedLufs,
      true_peak_dbtp: options.truePeakDbtp,
    },
    warnings: [],
  };
}

function validateComparisonReport(payload: unknown): boolean {
  const Ajv2020 = Ajv2020Import as unknown as new (options: {
    strict: boolean;
  }) => {
    addSchema: (schema: unknown, key?: string) => void;
    compile: (schema: unknown) => {
      (value: unknown): boolean;
      errors?: unknown;
    };
  };
  const addFormats = addFormatsImport as unknown as (ajv: object) => void;
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  ajv.addSchema(commonSchema, commonSchema.$id);
  const validate = ajv.compile(comparisonReportSchema);
  const valid = validate(payload);

  if (!valid) {
    throw new Error(JSON.stringify(validate.errors));
  }

  return true;
}
