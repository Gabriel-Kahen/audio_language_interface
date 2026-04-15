import type {
  AnalysisReport,
  AudioVersion,
  CompareVersionsOptions,
  EditPlan,
} from "@audio-language-interface/compare";

import type { ComparisonBenchmarkCase } from "./types.js";

export const firstPromptFamilyPromptSuite: ComparisonBenchmarkCase[] = [
  {
    caseId: "compare_darker_less_harsh_preserve_punch",
    family: "first_prompt_family",
    prompt: "make this loop darker and less harsh",
    description: "Successful tonal softening with punch preserved.",
    compareOptions: createCompareOptions({
      baselineVersionId: "ver_suite_01_base",
      candidateVersionId: "ver_suite_01_cand",
      baseline: {
        integratedLufs: -14.8,
        truePeakDbtp: -1.3,
        crestFactorDb: 10.4,
        transientDensity: 2.02,
        lowBandDb: -16.4,
        midBandDb: -11.2,
        highBandDb: -9.7,
        spectralCentroidHz: 2670,
        stereoWidth: 0.62,
        stereoCorrelation: 0.43,
        noiseFloorDbfs: -72,
        clippingDetected: false,
      },
      candidate: {
        integratedLufs: -15,
        truePeakDbtp: -1.4,
        crestFactorDb: 10.2,
        transientDensity: 1.99,
        lowBandDb: -16.2,
        midBandDb: -11.4,
        highBandDb: -11.2,
        spectralCentroidHz: 2430,
        stereoWidth: 0.61,
        stereoCorrelation: 0.45,
        noiseFloorDbfs: -72.5,
        clippingDetected: false,
      },
      prompt: "make this loop darker and less harsh",
      goals: ["make this loop darker", "make it less harsh", "keep the punch"],
    }),
    expectation: {
      goalStatuses: {
        "make this loop darker": "met",
        "make it less harsh": "met",
        "keep the punch": "met",
      },
      requiredSemanticLabels: ["darker", "less_harsh"],
      forbiddenRegressionKinds: ["lost_punch", "introduced_clipping"],
    },
  },
  {
    caseId: "compare_reduce_brightness_without_losing_punch",
    family: "first_prompt_family",
    prompt: "reduce brightness without losing punch",
    description: "Brightness reduction wording variant with transient preservation.",
    compareOptions: createCompareOptions({
      baselineVersionId: "ver_suite_02_base",
      candidateVersionId: "ver_suite_02_cand",
      baseline: {
        integratedLufs: -15.1,
        truePeakDbtp: -1.8,
        crestFactorDb: 10,
        transientDensity: 1.85,
        lowBandDb: -16.1,
        midBandDb: -11.4,
        highBandDb: -9.4,
        spectralCentroidHz: 2550,
        stereoWidth: 0.57,
        stereoCorrelation: 0.48,
        noiseFloorDbfs: -70.5,
        clippingDetected: false,
      },
      candidate: {
        integratedLufs: -15.3,
        truePeakDbtp: -1.9,
        crestFactorDb: 9.82,
        transientDensity: 1.81,
        lowBandDb: -16,
        midBandDb: -11.5,
        highBandDb: -10.4,
        spectralCentroidHz: 2430,
        stereoWidth: 0.57,
        stereoCorrelation: 0.49,
        noiseFloorDbfs: -71,
        clippingDetected: false,
      },
      prompt: "reduce brightness without losing punch",
      goals: ["reduce brightness", "without losing punch"],
    }),
    expectation: {
      goalStatuses: {
        "reduce brightness": "met",
        "without losing punch": "met",
      },
      requiredSemanticLabels: ["darker"],
      forbiddenRegressionKinds: ["lost_punch", "introduced_clipping"],
    },
  },
  {
    caseId: "compare_clean_this_sample_up_a_bit",
    family: "first_prompt_family",
    prompt: "clean this sample up a bit",
    description: "Cleanup prompt succeeds only on measurable cleanup evidence.",
    compareOptions: createCompareOptions({
      baselineVersionId: "ver_suite_03_base",
      candidateVersionId: "ver_suite_03_cand",
      baseline: {
        integratedLufs: -16.2,
        truePeakDbtp: -2.1,
        crestFactorDb: 9.7,
        transientDensity: 1.76,
        lowBandDb: -15.8,
        midBandDb: -11.7,
        highBandDb: -10.9,
        spectralCentroidHz: 2360,
        stereoWidth: 0.54,
        stereoCorrelation: 0.52,
        noiseFloorDbfs: -61,
        clippingDetected: false,
      },
      candidate: {
        integratedLufs: -16.1,
        truePeakDbtp: -2.3,
        crestFactorDb: 9.7,
        transientDensity: 1.76,
        lowBandDb: -15.8,
        midBandDb: -11.7,
        highBandDb: -10.9,
        spectralCentroidHz: 2360,
        stereoWidth: 0.54,
        stereoCorrelation: 0.52,
        noiseFloorDbfs: -64.5,
        clippingDetected: false,
      },
      prompt: "clean this sample up a bit",
      goals: ["clean this sample up a bit"],
    }),
    expectation: {
      goalStatuses: {
        "clean this sample up a bit": "met",
      },
      requiredSemanticLabels: ["cleaner"],
      forbiddenRegressionKinds: ["introduced_clipping"],
    },
  },
  {
    caseId: "compare_ambiguous_clean_it_unknown",
    family: "first_prompt_family",
    prompt: "clean it",
    description: "Broad ambiguous cleanup wording should stay explicit as unknown.",
    compareOptions: createCompareOptions({
      baselineVersionId: "ver_suite_04_base",
      candidateVersionId: "ver_suite_04_cand",
      baseline: {
        integratedLufs: -15.5,
        truePeakDbtp: -1.9,
        crestFactorDb: 9.9,
        transientDensity: 1.8,
        lowBandDb: -16,
        midBandDb: -11.6,
        highBandDb: -10.4,
        spectralCentroidHz: 2440,
        stereoWidth: 0.58,
        stereoCorrelation: 0.47,
        noiseFloorDbfs: -68,
        clippingDetected: false,
      },
      candidate: {
        integratedLufs: -15.5,
        truePeakDbtp: -1.9,
        crestFactorDb: 9.9,
        transientDensity: 1.8,
        lowBandDb: -16,
        midBandDb: -11.6,
        highBandDb: -10.4,
        spectralCentroidHz: 2440,
        stereoWidth: 0.58,
        stereoCorrelation: 0.47,
        noiseFloorDbfs: -68,
        clippingDetected: false,
      },
      prompt: "clean it",
      goals: ["clean it"],
    }),
    expectation: {
      goalStatuses: {
        "clean it": "unknown",
      },
      forbiddenSemanticLabels: ["cleaner"],
      forbiddenRegressionKinds: ["introduced_clipping", "lost_punch"],
    },
  },
  {
    caseId: "compare_darker_but_lost_punch_regression",
    family: "first_prompt_family",
    prompt: "make it darker but keep the punch",
    description: "The tonal direction lands, but compare must flag punch loss regression.",
    compareOptions: createCompareOptions({
      baselineVersionId: "ver_suite_05_base",
      candidateVersionId: "ver_suite_05_cand",
      baseline: {
        integratedLufs: -15.1,
        truePeakDbtp: -2.4,
        crestFactorDb: 10.7,
        transientDensity: 2,
        lowBandDb: -16.2,
        midBandDb: -11.3,
        highBandDb: -9.5,
        spectralCentroidHz: 2580,
        stereoWidth: 0.59,
        stereoCorrelation: 0.46,
        noiseFloorDbfs: -71,
        clippingDetected: false,
      },
      candidate: {
        integratedLufs: -14.8,
        truePeakDbtp: -1.6,
        crestFactorDb: 9.2,
        transientDensity: 1.75,
        lowBandDb: -16,
        midBandDb: -11.4,
        highBandDb: -10.8,
        spectralCentroidHz: 2410,
        stereoWidth: 0.58,
        stereoCorrelation: 0.49,
        noiseFloorDbfs: -71,
        clippingDetected: false,
      },
      prompt: "make it darker but keep the punch",
      goals: ["make it darker", "keep the punch"],
    }),
    expectation: {
      goalStatuses: {
        "make it darker": "met",
        "keep the punch": "not_met",
      },
      requiredSemanticLabels: ["darker", "less_punchy"],
      requiredRegressionKinds: ["lost_punch"],
    },
  },
];

interface AnalysisValues {
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

interface CreateCompareOptionsInput {
  baselineVersionId: string;
  candidateVersionId: string;
  baseline: AnalysisValues;
  candidate: AnalysisValues;
  prompt: string;
  goals: string[];
}

function createCompareOptions(input: CreateCompareOptionsInput): CompareVersionsOptions {
  return {
    baselineVersion: createVersion(input.baselineVersionId),
    candidateVersion: createVersion(input.candidateVersionId),
    baselineAnalysis: createAnalysisReport(
      `${input.baselineVersionId}_analysis`,
      input.baselineVersionId,
      input.baseline,
    ),
    candidateAnalysis: createAnalysisReport(
      `${input.candidateVersionId}_analysis`,
      input.candidateVersionId,
      input.candidate,
    ),
    editPlan: createEditPlan(input.baselineVersionId, input.prompt, input.goals),
    generatedAt: "2026-04-14T22:00:00Z",
  };
}

function createVersion(versionId: string): AudioVersion {
  return {
    schema_version: "1.0.0",
    version_id: versionId,
    asset_id: "asset_benchmark_01",
  };
}

function createEditPlan(versionId: string, prompt: string, goals: string[]): EditPlan {
  return {
    schema_version: "1.0.0",
    plan_id: `plan_${versionId}`,
    asset_id: "asset_benchmark_01",
    version_id: versionId,
    user_request: prompt,
    goals,
    verification_targets: [],
  };
}

function createAnalysisReport(
  reportId: string,
  versionId: string,
  values: AnalysisValues,
): AnalysisReport {
  return {
    schema_version: "1.0.0",
    report_id: reportId,
    asset_id: "asset_benchmark_01",
    version_id: versionId,
    generated_at: "2026-04-14T21:59:00Z",
    analyzer: {
      name: "benchmark-fixture",
      version: "0.1.0",
    },
    summary: {
      plain_text: "benchmark fixture",
    },
    measurements: {
      levels: {
        integrated_lufs: values.integratedLufs,
        true_peak_dbtp: values.truePeakDbtp,
      },
      dynamics: {
        crest_factor_db: values.crestFactorDb,
        transient_density_per_second: values.transientDensity,
      },
      spectral_balance: {
        low_band_db: values.lowBandDb,
        mid_band_db: values.midBandDb,
        high_band_db: values.highBandDb,
        spectral_centroid_hz: values.spectralCentroidHz,
      },
      stereo: {
        width: values.stereoWidth,
        correlation: values.stereoCorrelation,
      },
      artifacts: {
        clipping_detected: values.clippingDetected,
        noise_floor_dbfs: values.noiseFloorDbfs,
      },
    },
  };
}
