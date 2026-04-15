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
    expect(report.regressions).toBeUndefined();
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

function createVersion(versionId: string): AudioVersion {
  return {
    schema_version: "1.0.0",
    version_id: versionId,
    asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
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
  lowBandDb: number;
  midBandDb: number;
  highBandDb: number;
  spectralCentroidHz: number;
  stereoWidth: number;
  stereoCorrelation: number;
  noiseFloorDbfs: number;
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
        ...(options.rmsDbfs === undefined ? {} : { rms_dbfs: options.rmsDbfs }),
        ...(options.samplePeakDbfs === undefined
          ? {}
          : { sample_peak_dbfs: options.samplePeakDbfs }),
        ...(options.headroomDb === undefined ? {} : { headroom_db: options.headroomDb }),
      },
      dynamics: {
        crest_factor_db: options.crestFactorDb,
        transient_density_per_second: options.transientDensity,
        ...(options.rmsShortTermDbfs === undefined
          ? {}
          : { rms_short_term_dbfs: options.rmsShortTermDbfs }),
        ...(options.dynamicRangeDb === undefined
          ? {}
          : { dynamic_range_db: options.dynamicRangeDb }),
      },
      spectral_balance: {
        low_band_db: options.lowBandDb,
        mid_band_db: options.midBandDb,
        high_band_db: options.highBandDb,
        spectral_centroid_hz: options.spectralCentroidHz,
      },
      stereo: {
        width: options.stereoWidth,
        correlation: options.stereoCorrelation,
      },
      artifacts: {
        clipping_detected: options.clippingDetected,
        noise_floor_dbfs: options.noiseFloorDbfs,
      },
    },
  };
}

function createEditPlan(): EditPlan {
  return {
    schema_version: "1.0.0",
    plan_id: "plan_01HZX8E7J2V3M4N5P6Q7R8S9T0",
    asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
    version_id: "ver_baseline123",
    user_request: "Make the loop a little darker and less harsh, but keep the punch.",
    goals: [
      "reduce upper-mid harshness",
      "slightly reduce perceived brightness",
      "preserve transient impact",
    ],
    verification_targets: ["reduced brightness", "no material loss of crest factor"],
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
