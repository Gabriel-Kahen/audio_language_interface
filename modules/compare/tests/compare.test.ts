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
        reportId: "analysis_cand123",
        versionId: "ver_candidate123",
        integratedLufs: -15.1,
        truePeakDbtp: -1.2,
        crestFactorDb: 10.1,
        transientDensity: 1.97,
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
        crestFactorDb: 11,
        transientDensity: 1.5,
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
        crestFactorDb: 8.8,
        transientDensity: 1.1,
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
      reportId: "analysis_prompt_cand",
      versionId: "ver_prompt_cand",
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
      reportMetricDeltas(baseline, candidate),
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
      reportMetricDeltas(baseline, candidate),
    );

    expect(goalAlignment).toEqual([
      { goal: "make it better", status: "unknown" },
      { goal: "clean it", status: "unknown" },
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
  crestFactorDb: number;
  transientDensity: number;
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
      },
      dynamics: {
        crest_factor_db: options.crestFactorDb,
        transient_density_per_second: options.transientDensity,
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

function reportMetricDeltas(
  baseline: AnalysisReport["measurements"],
  candidate: AnalysisReport["measurements"],
) {
  return [
    {
      metric: "levels.integrated_lufs",
      direction: deltaDirection(candidate.levels.integrated_lufs - baseline.levels.integrated_lufs),
      delta: round(candidate.levels.integrated_lufs - baseline.levels.integrated_lufs),
    },
    {
      metric: "levels.true_peak_dbtp",
      direction: deltaDirection(candidate.levels.true_peak_dbtp - baseline.levels.true_peak_dbtp),
      delta: round(candidate.levels.true_peak_dbtp - baseline.levels.true_peak_dbtp),
    },
    {
      metric: "dynamics.crest_factor_db",
      direction: deltaDirection(
        candidate.dynamics.crest_factor_db - baseline.dynamics.crest_factor_db,
      ),
      delta: round(candidate.dynamics.crest_factor_db - baseline.dynamics.crest_factor_db),
    },
    {
      metric: "dynamics.transient_density_per_second",
      direction: deltaDirection(
        candidate.dynamics.transient_density_per_second -
          baseline.dynamics.transient_density_per_second,
      ),
      delta: round(
        candidate.dynamics.transient_density_per_second -
          baseline.dynamics.transient_density_per_second,
      ),
    },
    {
      metric: "spectral_balance.high_band_db",
      direction: deltaDirection(
        candidate.spectral_balance.high_band_db - baseline.spectral_balance.high_band_db,
      ),
      delta: round(
        candidate.spectral_balance.high_band_db - baseline.spectral_balance.high_band_db,
      ),
    },
    {
      metric: "spectral_balance.spectral_centroid_hz",
      direction: deltaDirection(
        candidate.spectral_balance.spectral_centroid_hz -
          baseline.spectral_balance.spectral_centroid_hz,
      ),
      delta: round(
        candidate.spectral_balance.spectral_centroid_hz -
          baseline.spectral_balance.spectral_centroid_hz,
      ),
    },
    {
      metric: "artifacts.noise_floor_dbfs",
      direction: deltaDirection(
        candidate.artifacts.noise_floor_dbfs - baseline.artifacts.noise_floor_dbfs,
      ),
      delta: round(candidate.artifacts.noise_floor_dbfs - baseline.artifacts.noise_floor_dbfs),
    },
  ];
}

function deltaDirection(delta: number): "increased" | "decreased" | "unchanged" {
  if (Math.abs(delta) <= 1e-6) {
    return "unchanged";
  }

  return delta > 0 ? "increased" : "decreased";
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
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
