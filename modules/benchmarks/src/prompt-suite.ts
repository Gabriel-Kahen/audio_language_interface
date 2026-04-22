import type {
  AnalysisReport,
  AudioVersion,
  CompareVersionsOptions,
  EditPlan,
  VerificationTarget,
} from "@audio-language-interface/compare";
import type { IntentInterpretation } from "@audio-language-interface/interpretation";

import type {
  ComparisonBenchmarkCase,
  ComparisonBenchmarkCorpus,
  InterpretationBenchmarkCase,
  InterpretationBenchmarkCorpus,
  RequestCycleBenchmarkCase,
  RequestCycleBenchmarkCorpus,
} from "./types.js";

export const FIRST_PROMPT_FAMILY_CORPUS_ID = "cleanup_slice_v1";
export const FIRST_PROMPT_FAMILY_REQUEST_CYCLE_CORPUS_ID = "cleanup_request_cycle_v1";
export const INTERPRETATION_CORPUS_ID = "intent_interpretation_v1";
export const FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH = "fixtures/audio/manifest.json";
export const FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID = "fixture_phase1_first_slice_loop_synthetic";

export const firstPromptFamilyFixtureCorpus: ComparisonBenchmarkCorpus = {
  corpusId: FIRST_PROMPT_FAMILY_CORPUS_ID,
  suiteId: "first_prompt_family",
  fixtureManifestPath: FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH,
  description:
    "Current compare benchmark corpus anchored to committed phase-1 WAV fixtures across tonal, restoration, control, and stereo-spatial checks plus one explicit ambiguous control.",
  cases: [
    {
      caseId: "compare_darker_less_harsh_preserve_punch",
      family: "first_prompt_family",
      prompt: "make this loop darker and less harsh",
      description: "Successful tonal softening with punch preserved.",
      fixtures: {
        sourceFixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
        baselineFixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
        candidateFixtureId: "fixture_phase1_first_slice_loop_darker_less_harsh",
      },
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
        goals: [
          "reduce upper-mid harshness",
          "tilt the overall balance slightly darker",
          "preserve transient impact",
        ],
        verificationTargets: [
          "reduced energy in the 3 kHz to 4.5 kHz region",
          "slightly reduced perceived brightness without obvious dulling",
          "no material loss of crest factor",
        ],
      }),
      expectation: {
        goalStatuses: {
          "reduce upper-mid harshness": "met",
          "tilt the overall balance slightly darker": "met",
          "preserve transient impact": "met",
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
      fixtures: {
        sourceFixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
        baselineFixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
        candidateFixtureId: "fixture_phase1_first_slice_loop_reduced_brightness",
      },
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
        goals: ["tilt the overall balance slightly darker", "preserve transient impact"],
        verificationTargets: [
          "slightly reduced perceived brightness without obvious dulling",
          "no material loss of crest factor",
        ],
      }),
      expectation: {
        goalStatuses: {
          "tilt the overall balance slightly darker": "met",
          "preserve transient impact": "met",
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
      fixtures: {
        sourceFixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
        baselineFixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
        candidateFixtureId: "fixture_phase1_first_slice_loop_cleaner",
      },
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
        goals: ["reduce steady background noise conservatively"],
        verificationTargets: ["lower measured noise floor without obvious denoise artifacts"],
      }),
      expectation: {
        goalStatuses: {
          "reduce steady background noise conservatively": "met",
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
      fixtures: {
        sourceFixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
        baselineFixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
        candidateFixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
      },
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
      caseId: "compare_control_peak_excursions_conservatively",
      family: "first_prompt_family",
      prompt: "control the peaks without crushing it",
      description:
        "Peak control with punch preserved on the new committed limiter-derived fixture.",
      fixtures: {
        sourceFixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
        baselineFixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
        candidateFixtureId: "fixture_phase1_first_slice_loop_peak_controlled",
      },
      compareOptions: createCompareOptions({
        baselineVersionId: "ver_suite_05_base",
        candidateVersionId: "ver_suite_05_cand",
        baseline: {
          integratedLufs: -15.4,
          truePeakDbtp: -1.1,
          headroomDb: 1.1,
          crestFactorDb: 10.2,
          transientDensity: 1.86,
          dynamicRangeDb: 8.2,
          lowBandDb: -16,
          midBandDb: -11.4,
          highBandDb: -10.1,
          spectralCentroidHz: 2480,
          stereoWidth: 0.54,
          stereoCorrelation: 0.5,
          noiseFloorDbfs: -67.5,
          clippingDetected: false,
        },
        candidate: {
          integratedLufs: -15.8,
          truePeakDbtp: -1.7,
          headroomDb: 1.7,
          crestFactorDb: 10,
          transientDensity: 1.84,
          dynamicRangeDb: 8,
          lowBandDb: -16,
          midBandDb: -11.5,
          highBandDb: -10,
          spectralCentroidHz: 2470,
          stereoWidth: 0.54,
          stereoCorrelation: 0.5,
          noiseFloorDbfs: -67.6,
          clippingDetected: false,
        },
        prompt: "control the peaks without crushing it",
        goals: ["control peak excursions conservatively", "preserve transient impact"],
        verificationTargets: [
          "lower peak excursions while keeping the output ceiling near -1 dB true peak",
          "no material loss of crest factor",
        ],
      }),
      expectation: {
        goalStatuses: {
          "control peak excursions conservatively": "met",
          "preserve transient impact": "met",
        },
        forbiddenRegressionKinds: ["introduced_clipping", "lost_punch"],
      },
    },
    {
      caseId: "compare_reduce_hum_direct_evidence",
      family: "first_prompt_family",
      prompt: "reduce hum",
      description: "Hum cleanup scored from direct hum detector evidence.",
      fixtures: {
        sourceFixtureId: "fixture_phase1_request_cycle_hum_60hz_source",
        baselineFixtureId: "fixture_phase1_request_cycle_hum_60hz_source",
        candidateFixtureId: "fixture_phase1_request_cycle_hum_60hz_source",
      },
      compareOptions: createCompareOptions({
        baselineVersionId: "ver_suite_06_base",
        candidateVersionId: "ver_suite_06_cand",
        baseline: {
          integratedLufs: -16.1,
          truePeakDbtp: -1.8,
          crestFactorDb: 9.8,
          transientDensity: 1.72,
          lowBandDb: -12.8,
          midBandDb: -11.4,
          highBandDb: -10.6,
          spectralCentroidHz: 2320,
          stereoWidth: 0.49,
          stereoCorrelation: 0.51,
          noiseFloorDbfs: -60.8,
          clippingDetected: false,
          humDetected: true,
          humLevelDbfs: -21.5,
          humFundamentalHz: 60,
          humHarmonicCount: 3,
        },
        candidate: {
          integratedLufs: -16.1,
          truePeakDbtp: -1.9,
          crestFactorDb: 9.8,
          transientDensity: 1.71,
          lowBandDb: -15.8,
          midBandDb: -11.5,
          highBandDb: -10.6,
          spectralCentroidHz: 2310,
          stereoWidth: 0.49,
          stereoCorrelation: 0.51,
          noiseFloorDbfs: -62.4,
          clippingDetected: false,
          humDetected: false,
        },
        prompt: "reduce hum",
        goals: ["reduce hum"],
      }),
      expectation: {
        goalStatuses: {
          "reduce hum": "met",
        },
        forbiddenRegressionKinds: ["introduced_clipping", "increased_hum_proxy"],
      },
    },
    {
      caseId: "compare_reduce_hum_fallback_proxy",
      family: "first_prompt_family",
      prompt: "reduce hum",
      description: "Hum cleanup fallback when direct hum artifact fields are unavailable.",
      fixtures: {
        sourceFixtureId: "fixture_phase1_request_cycle_hum_60hz_source",
        baselineFixtureId: "fixture_phase1_request_cycle_hum_60hz_source",
        candidateFixtureId: "fixture_phase1_request_cycle_hum_60hz_source",
      },
      compareOptions: createCompareOptions({
        baselineVersionId: "ver_suite_07_base",
        candidateVersionId: "ver_suite_07_cand",
        baseline: {
          integratedLufs: -16,
          truePeakDbtp: -1.9,
          crestFactorDb: 9.7,
          transientDensity: 1.7,
          lowBandDb: -13.4,
          midBandDb: -11.2,
          highBandDb: -10.6,
          spectralCentroidHz: 2310,
          stereoWidth: 0.48,
          stereoCorrelation: 0.52,
          noiseFloorDbfs: -61.2,
          clippingDetected: false,
        },
        candidate: {
          integratedLufs: -16.1,
          truePeakDbtp: -2,
          crestFactorDb: 9.7,
          transientDensity: 1.7,
          lowBandDb: -17.9,
          midBandDb: -11.4,
          highBandDb: -10.7,
          spectralCentroidHz: 2300,
          stereoWidth: 0.48,
          stereoCorrelation: 0.52,
          noiseFloorDbfs: -63.1,
          clippingDetected: false,
        },
        prompt: "reduce hum",
        goals: ["reduce hum"],
      }),
      expectation: {
        goalStatuses: {
          "reduce hum": "mostly_met",
        },
        forbiddenRegressionKinds: ["introduced_clipping", "increased_hum_proxy"],
      },
    },
    {
      caseId: "compare_reduce_clicks_direct_evidence",
      family: "first_prompt_family",
      prompt: "reduce clicks",
      description: "Click cleanup scored from direct click detector evidence.",
      fixtures: {
        sourceFixtureId: "fixture_phase1_request_cycle_clicks_source",
        baselineFixtureId: "fixture_phase1_request_cycle_clicks_source",
        candidateFixtureId: "fixture_phase1_request_cycle_clicks_source",
      },
      compareOptions: createCompareOptions({
        baselineVersionId: "ver_suite_08_base",
        candidateVersionId: "ver_suite_08_cand",
        baseline: {
          integratedLufs: -16.2,
          truePeakDbtp: -1.7,
          crestFactorDb: 10.3,
          transientDensity: 1.94,
          lowBandDb: -15.8,
          midBandDb: -11.8,
          highBandDb: -10.5,
          spectralCentroidHz: 2410,
          stereoWidth: 0.5,
          stereoCorrelation: 0.5,
          noiseFloorDbfs: -63.3,
          clippingDetected: false,
          clippedSampleCount: 96,
          clickDetected: true,
          clickCount: 10,
          clickRatePerSecond: 5.5,
        },
        candidate: {
          integratedLufs: -16.3,
          truePeakDbtp: -1.8,
          crestFactorDb: 10.1,
          transientDensity: 1.87,
          lowBandDb: -15.9,
          midBandDb: -11.8,
          highBandDb: -10.6,
          spectralCentroidHz: 2400,
          stereoWidth: 0.5,
          stereoCorrelation: 0.5,
          noiseFloorDbfs: -63.5,
          clippingDetected: false,
          clippedSampleCount: 8,
          clickDetected: false,
          clickCount: 0,
          clickRatePerSecond: 0,
        },
        prompt: "reduce clicks",
        goals: ["reduce clicks"],
      }),
      expectation: {
        goalStatuses: {
          "reduce clicks": "met",
        },
        forbiddenRegressionKinds: ["introduced_clipping", "increased_click_proxy", "lost_punch"],
      },
    },
    {
      caseId: "compare_reduce_clicks_fallback_proxy",
      family: "first_prompt_family",
      prompt: "reduce clicks",
      description: "Click cleanup fallback when direct click detector evidence is unavailable.",
      fixtures: {
        sourceFixtureId: "fixture_phase1_request_cycle_clicks_source",
        baselineFixtureId: "fixture_phase1_request_cycle_clicks_source",
        candidateFixtureId: "fixture_phase1_request_cycle_clicks_source",
      },
      compareOptions: createCompareOptions({
        baselineVersionId: "ver_suite_09_base",
        candidateVersionId: "ver_suite_09_cand",
        baseline: {
          integratedLufs: -16.2,
          truePeakDbtp: -1.8,
          crestFactorDb: 10.2,
          transientDensity: 1.92,
          lowBandDb: -15.8,
          midBandDb: -11.7,
          highBandDb: -10.5,
          spectralCentroidHz: 2410,
          stereoWidth: 0.5,
          stereoCorrelation: 0.5,
          noiseFloorDbfs: -63.2,
          clippingDetected: false,
          clippedSampleCount: 96,
        },
        candidate: {
          integratedLufs: -16.3,
          truePeakDbtp: -1.9,
          crestFactorDb: 10.1,
          transientDensity: 1.86,
          lowBandDb: -15.9,
          midBandDb: -11.8,
          highBandDb: -10.6,
          spectralCentroidHz: 2400,
          stereoWidth: 0.5,
          stereoCorrelation: 0.5,
          noiseFloorDbfs: -63.4,
          clippingDetected: false,
          clippedSampleCount: 10,
        },
        prompt: "reduce clicks",
        goals: ["reduce clicks"],
      }),
      expectation: {
        goalStatuses: {
          "reduce clicks": "unknown",
        },
        forbiddenRegressionKinds: ["introduced_clipping", "increased_click_proxy", "lost_punch"],
      },
    },
    {
      caseId: "compare_make_this_wider",
      family: "first_prompt_family",
      prompt: "make this wider",
      description: "Conservative stereo widening scored from direct width and stability signals.",
      fixtures: {
        sourceFixtureId: "fixture_phase1_request_cycle_stereo_width_source",
        baselineFixtureId: "fixture_phase1_request_cycle_stereo_width_source",
        candidateFixtureId: "fixture_phase1_request_cycle_stereo_width_source",
      },
      compareOptions: createCompareOptions({
        baselineVersionId: "ver_suite_10_base",
        candidateVersionId: "ver_suite_10_cand",
        baseline: {
          integratedLufs: -17.4,
          truePeakDbtp: -1.8,
          crestFactorDb: 9.9,
          transientDensity: 1.48,
          lowBandDb: -15.2,
          midBandDb: -11.6,
          highBandDb: -10.4,
          spectralCentroidHz: 2280,
          stereoWidth: 0.3,
          stereoCorrelation: 0.68,
          stereoBalanceDb: 0,
          noiseFloorDbfs: -71.4,
          clippingDetected: false,
        },
        candidate: {
          integratedLufs: -17.5,
          truePeakDbtp: -1.9,
          crestFactorDb: 9.8,
          transientDensity: 1.47,
          lowBandDb: -15.2,
          midBandDb: -11.6,
          highBandDb: -10.4,
          spectralCentroidHz: 2280,
          stereoWidth: 0.35,
          stereoCorrelation: 0.61,
          stereoBalanceDb: 0.1,
          noiseFloorDbfs: -71.6,
          clippingDetected: false,
        },
        prompt: "make this wider",
        goals: ["slightly increase stereo width"],
        verificationTargets: [
          {
            target_id: "target_wider_stereo_width",
            goal: "slightly increase stereo width",
            label: "increase stereo width slightly",
            kind: "analysis_metric",
            comparison: "increase_by",
            metric: "stereo.width",
            threshold: 0.04,
          },
          {
            target_id: "target_wider_no_instability",
            goal: "slightly increase stereo width",
            label: "avoid stereo-instability regressions while widening",
            kind: "regression_guard",
            comparison: "absent",
            regression_kind: "stereo_instability",
          },
        ],
      }),
      expectation: {
        goalStatuses: {
          "slightly increase stereo width": "met",
        },
        requiredSemanticLabels: ["wider"],
        forbiddenRegressionKinds: ["stereo_instability", "stereo_balance_regression"],
      },
    },
    {
      caseId: "compare_narrow_it_a_bit",
      family: "first_prompt_family",
      prompt: "narrow it a bit",
      description: "Conservative stereo narrowing scored from direct width reduction.",
      fixtures: {
        sourceFixtureId: "fixture_phase1_request_cycle_stereo_width_source",
        baselineFixtureId: "fixture_phase1_request_cycle_stereo_width_source",
        candidateFixtureId: "fixture_phase1_request_cycle_stereo_width_source",
      },
      compareOptions: createCompareOptions({
        baselineVersionId: "ver_suite_11_base",
        candidateVersionId: "ver_suite_11_cand",
        baseline: {
          integratedLufs: -17.4,
          truePeakDbtp: -1.8,
          crestFactorDb: 9.9,
          transientDensity: 1.48,
          lowBandDb: -15.2,
          midBandDb: -11.6,
          highBandDb: -10.4,
          spectralCentroidHz: 2280,
          stereoWidth: 0.3,
          stereoCorrelation: 0.68,
          stereoBalanceDb: 0,
          noiseFloorDbfs: -71.4,
          clippingDetected: false,
        },
        candidate: {
          integratedLufs: -17.4,
          truePeakDbtp: -1.9,
          crestFactorDb: 9.9,
          transientDensity: 1.48,
          lowBandDb: -15.2,
          midBandDb: -11.6,
          highBandDb: -10.4,
          spectralCentroidHz: 2280,
          stereoWidth: 0.27,
          stereoCorrelation: 0.72,
          stereoBalanceDb: 0,
          noiseFloorDbfs: -71.5,
          clippingDetected: false,
        },
        prompt: "narrow it a bit",
        goals: ["slightly reduce stereo width"],
        verificationTargets: [
          {
            target_id: "target_narrower_stereo_width",
            goal: "slightly reduce stereo width",
            label: "reduce stereo width slightly",
            kind: "analysis_metric",
            comparison: "decrease_by",
            metric: "stereo.width",
            threshold: 0.02,
          },
          {
            target_id: "target_narrower_no_collapse",
            goal: "slightly reduce stereo width",
            label: "avoid collapsing the image too far",
            kind: "regression_guard",
            comparison: "absent",
            regression_kind: "stereo_collapse",
          },
        ],
      }),
      expectation: {
        goalStatuses: {
          "slightly reduce stereo width": "met",
        },
        requiredSemanticLabels: ["narrower"],
        forbiddenRegressionKinds: ["stereo_collapse", "stereo_balance_regression"],
      },
    },
    {
      caseId: "compare_center_this_more",
      family: "first_prompt_family",
      prompt: "center this more",
      description: "Centering scored from direct absolute stereo-balance reduction.",
      fixtures: {
        sourceFixtureId: "fixture_phase1_request_cycle_stereo_imbalance_source",
        baselineFixtureId: "fixture_phase1_request_cycle_stereo_imbalance_source",
        candidateFixtureId: "fixture_phase1_request_cycle_stereo_imbalance_source",
      },
      compareOptions: createCompareOptions({
        baselineVersionId: "ver_suite_12_base",
        candidateVersionId: "ver_suite_12_cand",
        baseline: {
          integratedLufs: -16.9,
          truePeakDbtp: -1.7,
          crestFactorDb: 9.7,
          transientDensity: 1.42,
          lowBandDb: -15.4,
          midBandDb: -11.7,
          highBandDb: -10.6,
          spectralCentroidHz: 2260,
          stereoWidth: 0.29,
          stereoCorrelation: 0.73,
          stereoBalanceDb: 2.4,
          noiseFloorDbfs: -71.1,
          clippingDetected: false,
        },
        candidate: {
          integratedLufs: -17.1,
          truePeakDbtp: -1.9,
          crestFactorDb: 9.7,
          transientDensity: 1.41,
          lowBandDb: -15.4,
          midBandDb: -11.7,
          highBandDb: -10.6,
          spectralCentroidHz: 2260,
          stereoWidth: 0.25,
          stereoCorrelation: 0.79,
          stereoBalanceDb: 0.8,
          noiseFloorDbfs: -71.2,
          clippingDetected: false,
        },
        prompt: "center this more",
        goals: ["reduce left-right stereo imbalance conservatively"],
        verificationTargets: [
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
      }),
      expectation: {
        goalStatuses: {
          "reduce left-right stereo imbalance conservatively": "met",
        },
        requiredSemanticLabels: ["more_centered"],
        forbiddenRegressionKinds: ["stereo_balance_regression", "stereo_collapse"],
      },
    },
    {
      caseId: "compare_fix_stereo_imbalance",
      family: "first_prompt_family",
      prompt: "fix the stereo imbalance",
      description: "Stereo-imbalance correction wording variant with the same measurable target.",
      fixtures: {
        sourceFixtureId: "fixture_phase1_request_cycle_stereo_imbalance_source",
        baselineFixtureId: "fixture_phase1_request_cycle_stereo_imbalance_source",
        candidateFixtureId: "fixture_phase1_request_cycle_stereo_imbalance_source",
      },
      compareOptions: createCompareOptions({
        baselineVersionId: "ver_suite_13_base",
        candidateVersionId: "ver_suite_13_cand",
        baseline: {
          integratedLufs: -16.9,
          truePeakDbtp: -1.7,
          crestFactorDb: 9.7,
          transientDensity: 1.42,
          lowBandDb: -15.4,
          midBandDb: -11.7,
          highBandDb: -10.6,
          spectralCentroidHz: 2260,
          stereoWidth: 0.29,
          stereoCorrelation: 0.73,
          stereoBalanceDb: 2.4,
          noiseFloorDbfs: -71.1,
          clippingDetected: false,
        },
        candidate: {
          integratedLufs: -17.1,
          truePeakDbtp: -1.9,
          crestFactorDb: 9.7,
          transientDensity: 1.41,
          lowBandDb: -15.4,
          midBandDb: -11.7,
          highBandDb: -10.6,
          spectralCentroidHz: 2260,
          stereoWidth: 0.25,
          stereoCorrelation: 0.79,
          stereoBalanceDb: 0.9,
          noiseFloorDbfs: -71.2,
          clippingDetected: false,
        },
        prompt: "fix the stereo imbalance",
        goals: ["reduce left-right stereo imbalance conservatively"],
      }),
      expectation: {
        goalStatuses: {
          "reduce left-right stereo imbalance conservatively": "met",
        },
        requiredSemanticLabels: ["more_centered"],
        forbiddenRegressionKinds: ["stereo_balance_regression", "stereo_collapse"],
      },
    },
  ],
};

export const firstPromptFamilyPromptSuite: ComparisonBenchmarkCase[] =
  firstPromptFamilyFixtureCorpus.cases;

export const firstPromptFamilyRequestCycleCorpus: RequestCycleBenchmarkCorpus = {
  corpusId: FIRST_PROMPT_FAMILY_REQUEST_CYCLE_CORPUS_ID,
  suiteId: "first_prompt_family",
  fixtureManifestPath: FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH,
  description:
    "Real request-cycle benchmark corpus over committed phase-1 fixtures, covering supported tonal cleanup, cross-family compounds across restoration, timing, tonal, stereo, and loudness/control edits, plus explicit clarification/failure controls.",
  cases: [
    {
      caseId: "request_cycle_darker_less_harsh",
      family: "first_prompt_family",
      prompt: "make this loop darker and less harsh",
      description: "Happy-path tonal cleanup through notch plus tilt EQ.",
      fixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["notch_filter", "tilt_eq"],
          expected_operation_order: ["notch_filter", "tilt_eq"],
          required_goals: [
            "reduce upper-mid harshness",
            "tilt the overall balance slightly darker",
          ],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "reduce upper-mid harshness": "met",
            "tilt the overall balance slightly darker": "met",
          },
          verification_statuses: {
            target_reduce_harshness_high_band: "met",
            target_reduce_harshness_centroid: "met",
            target_darker_brightness_tilt: "met",
          },
        },
      },
    },
    {
      caseId: "request_cycle_reduce_brightness_without_losing_punch",
      family: "first_prompt_family",
      prompt: "reduce brightness without losing punch",
      description: "Single-step darker rebalance with punch-preservation checks.",
      fixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["tilt_eq"],
          forbidden_operations: ["notch_filter", "compressor"],
          required_goals: ["tilt the overall balance slightly darker", "preserve transient impact"],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "tilt the overall balance slightly darker": "met",
            "preserve transient impact": "met",
          },
          verification_statuses: {
            target_darker_brightness_tilt: "met",
            target_preserve_punch_crest_factor: "met",
            target_preserve_punch_no_regression: "met",
          },
        },
      },
    },
    {
      caseId: "request_cycle_less_muddy",
      family: "first_prompt_family",
      prompt: "make this less muddy",
      description: "Low-shelf tonal cleanup on the supported low-mid path.",
      fixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["low_shelf"],
          forbidden_operations: ["notch_filter", "compressor", "denoise"],
          required_goals: ["trim excess low-mid weight"],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "trim excess low-mid weight": "met",
          },
          verification_statuses: {
            target_less_muddy_mid_band: "met",
            target_less_muddy_no_lost_air_regression: "met",
          },
        },
      },
    },
    {
      caseId: "request_cycle_warmer_and_airier",
      family: "first_prompt_family",
      prompt: "Make this warmer and airier.",
      description: "Two-step tonal compound on the shared first-slice fixture.",
      fixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["low_shelf", "high_shelf"],
          expected_operation_order: ["low_shelf", "high_shelf"],
          required_goals: ["add a little low-band warmth", "add a little upper-band air"],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "add a little low-band warmth": "met",
            "add a little upper-band air": "met",
          },
          verification_statuses: {
            target_more_warmth_low_band: "met",
            target_more_warmth_no_added_muddiness: "met",
            target_more_air_high_band: "met",
            target_more_air_no_sibilance_regression: "met",
          },
        },
        regressions: {
          forbidden_regression_kinds: ["added_muddiness", "increased_sibilance"],
        },
      },
    },
    {
      caseId: "request_cycle_darker_less_harsh_less_muddy",
      family: "first_prompt_family",
      prompt: "Make this darker, less harsh, and less muddy.",
      description: "Three-step tonal compound on the shared first-slice fixture.",
      fixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["notch_filter", "tilt_eq", "low_shelf"],
          expected_operation_order: ["notch_filter", "tilt_eq", "low_shelf"],
          required_goals: [
            "reduce upper-mid harshness",
            "trim excess low-mid weight",
            "tilt the overall balance slightly darker",
          ],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "reduce upper-mid harshness": "mostly_met",
            "trim excess low-mid weight": "met",
            "tilt the overall balance slightly darker": "met",
          },
          verification_statuses: {
            target_reduce_harshness_high_band: "met",
            target_less_muddy_mid_band: "met",
            target_less_muddy_no_lost_air_regression: "met",
            target_darker_brightness_tilt: "met",
          },
        },
      },
    },
    {
      caseId: "request_cycle_tame_sibilance",
      family: "first_prompt_family",
      prompt: "Tame the sibilance.",
      description: "Explicit de-essing path on the committed sibilance fixture.",
      fixtureId: "fixture_phase1_request_cycle_sibilance_source",
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["de_esser"],
          expected_operation_order: ["de_esser"],
          required_goals: ["tame sibilant bursts conservatively"],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "tame sibilant bursts conservatively": "met",
          },
          verification_statuses: {
            target_reduce_sibilance_presence: "met",
            target_reduce_sibilance_harshness_ratio: "met",
          },
        },
      },
    },
    {
      caseId: "request_cycle_speed_up_and_tame_sibilance",
      family: "first_prompt_family",
      prompt: "Speed up by 10% and tame the sibilance.",
      description: "Timing-plus-restoration compound on the committed sibilance fixture.",
      fixtureId: "fixture_phase1_request_cycle_sibilance_source",
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["time_stretch", "de_esser"],
          expected_operation_order: ["time_stretch", "de_esser"],
          required_goals: [
            "shorten the clip duration while preserving pitch",
            "tame sibilant bursts conservatively",
          ],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "shorten the clip duration while preserving pitch": "met",
            "tame sibilant bursts conservatively": "mostly_met",
          },
          verification_statuses: {
            target_time_stretch_duration: "met",
            target_reduce_sibilance_presence: "mostly_met",
            target_reduce_sibilance_harshness_ratio: "mostly_met",
          },
        },
      },
    },
    {
      caseId: "request_cycle_tame_sibilance_and_darker",
      family: "first_prompt_family",
      prompt: "Tame the sibilance and make it darker.",
      description: "Restoration-plus-tonal compound on the committed sibilance fixture.",
      fixtureId: "fixture_phase1_request_cycle_sibilance_source",
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["de_esser", "tilt_eq"],
          expected_operation_order: ["de_esser", "tilt_eq"],
          required_goals: [
            "tame sibilant bursts conservatively",
            "tilt the overall balance slightly darker",
          ],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "tame sibilant bursts conservatively": "met",
            "tilt the overall balance slightly darker": "met",
          },
          verification_statuses: {
            target_reduce_sibilance_presence: "met",
            target_reduce_sibilance_harshness_ratio: "met",
            target_darker_brightness_tilt: "met",
          },
        },
      },
    },
    {
      caseId: "request_cycle_remove_60hz_hum",
      family: "first_prompt_family",
      prompt: "Remove 60 Hz hum.",
      description: "Explicit dehum path on the committed 60 Hz mains-contaminated fixture.",
      fixtureId: "fixture_phase1_request_cycle_hum_60hz_source",
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["dehum"],
          expected_operation_order: ["dehum"],
          required_goals: ["reduce mains hum and harmonic buzz conservatively"],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "reduce mains hum and harmonic buzz conservatively": "met",
          },
          verification_statuses: {
            target_reduce_hum_activity: "met",
            target_reduce_hum_no_regression: "met",
          },
        },
      },
    },
    {
      caseId: "request_cycle_clean_up_clicks",
      family: "first_prompt_family",
      prompt: "Clean up clicks.",
      description: "Explicit declick path on the committed sparse-click source fixture.",
      fixtureId: "fixture_phase1_request_cycle_clicks_source",
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["declick"],
          expected_operation_order: ["declick"],
          required_goals: ["repair short clicks and pops conservatively"],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "repair short clicks and pops conservatively": "met",
          },
          verification_statuses: {
            target_reduce_click_activity: "met",
            target_reduce_click_no_regression: "met",
          },
        },
      },
    },
    {
      caseId: "request_cycle_control_peaks_without_crushing",
      family: "first_prompt_family",
      prompt: "Control the peaks without crushing it.",
      description: "Explicit limiter path with crest-factor preservation checks.",
      fixtureId: "fixture_phase1_request_cycle_loudness_control_source",
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["limiter"],
          expected_operation_order: ["limiter"],
          required_goals: ["control peak excursions conservatively", "preserve transient impact"],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "control peak excursions conservatively": "met",
            "preserve transient impact": "met",
          },
          verification_statuses: {
            target_peak_control_true_peak: "met",
            target_peak_control_no_regression: "met",
            target_preserve_punch_crest_factor: "met",
            target_preserve_punch_no_regression: "met",
          },
        },
      },
    },
    {
      caseId: "request_cycle_louder_and_more_controlled",
      family: "first_prompt_family",
      prompt: "Make it louder and more controlled.",
      description:
        "Dedicated controlled-loudness path on the committed sustained louder-control fixture.",
      fixtureId: "fixture_phase1_request_cycle_louder_controlled_source",
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["compressor", "normalize"],
          expected_operation_order: ["compressor", "normalize"],
          required_goals: [
            "make dynamics more controlled without over-compressing",
            "increase output level conservatively",
          ],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "make dynamics more controlled without over-compressing": "met",
            "increase output level conservatively": "met",
          },
          verification_statuses: {
            target_controlled_loudness_range: "met",
            target_controlled_loudness_no_overcompression: "met",
            target_controlled_loudness_integrated_lufs: "met",
            target_controlled_loudness_peak_guard: "met",
            target_controlled_loudness_no_headroom_loss: "met",
          },
        },
        regressions: {
          forbidden_regression_kinds: [
            "peak_control_regression",
            "loudness_headroom_loss",
            "increased_sibilance",
            "added_muddiness",
          ],
        },
      },
    },
    {
      caseId: "request_cycle_more_controlled_and_darker",
      family: "first_prompt_family",
      prompt: "Make this a little tighter and more controlled, and darker.",
      description: "Control-plus-tonal compound on the shared first-slice fixture.",
      fixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["tilt_eq", "compressor"],
          expected_operation_order: ["tilt_eq", "compressor"],
          required_goals: [
            "tilt the overall balance slightly darker",
            "make dynamics more controlled without over-compressing",
          ],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "tilt the overall balance slightly darker": "met",
            "make dynamics more controlled without over-compressing": "not_met",
          },
          verification_statuses: {
            target_darker_brightness_tilt: "met",
            target_control_dynamics_range: "not_met",
            target_control_dynamics_no_overcompression: "met",
          },
        },
        regressions: {
          forbidden_regression_kinds: ["over_compression"],
        },
      },
    },
    {
      caseId: "request_cycle_trim_boundary_silence",
      family: "first_prompt_family",
      prompt: "Trim the silence at the beginning and end.",
      description: "Boundary-silence trimming on the committed edge-silence timing fixture.",
      fixtureId: "fixture_phase1_request_cycle_trim_silence_source",
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["trim_silence"],
          expected_operation_order: ["trim_silence"],
          required_goals: ["trim leading and trailing boundary silence conservatively"],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "trim leading and trailing boundary silence conservatively": "met",
          },
          verification_statuses: {
            target_trim_leading_silence: "met",
            target_trim_trailing_silence: "met",
            target_trim_silence_duration_reduction: "met",
          },
        },
      },
    },
    {
      caseId: "request_cycle_speed_up_preserve_pitch",
      family: "first_prompt_family",
      prompt: "Speed up by 10%.",
      description: "Conservative full-file time stretch on the committed pitched timing fixture.",
      fixtureId: "fixture_phase1_request_cycle_pitched_timing_source",
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["time_stretch"],
          expected_operation_order: ["time_stretch"],
          required_goals: ["shorten the clip duration while preserving pitch"],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "shorten the clip duration while preserving pitch": "met",
          },
          verification_statuses: {
            target_time_stretch_duration: "met",
            target_time_stretch_pitch_preservation: "met",
          },
        },
      },
    },
    {
      caseId: "request_cycle_pitch_up_two_semitones",
      family: "first_prompt_family",
      prompt: "Pitch up by 2 semitones.",
      description: "Conservative pitch shift on the committed pitched timing fixture.",
      fixtureId: "fixture_phase1_request_cycle_pitched_timing_source",
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["pitch_shift"],
          expected_operation_order: ["pitch_shift"],
          required_goals: ["raise the pitch by 2 semitones"],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "raise the pitch by 2 semitones": "met",
          },
          verification_statuses: {
            target_pitch_shift_center: "met",
            target_pitch_shift_duration_guard: "met",
          },
        },
      },
    },
    {
      caseId: "request_cycle_make_this_wider",
      family: "first_prompt_family",
      prompt: "Make this wider.",
      description: "Conservative stereo widening on the committed narrow stereo fixture.",
      fixtureId: "fixture_phase1_request_cycle_stereo_width_source",
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["stereo_width"],
          expected_operation_order: ["stereo_width"],
          required_goals: ["slightly increase stereo width"],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "slightly increase stereo width": "met",
          },
          verification_statuses: {
            target_wider_stereo_width: "met",
            target_wider_no_instability: "met",
          },
          required_semantic_labels: ["wider"],
        },
        regressions: {
          forbidden_regression_kinds: ["stereo_instability", "stereo_balance_regression"],
        },
      },
    },
    {
      caseId: "request_cycle_narrow_it_a_bit",
      family: "first_prompt_family",
      prompt: "Narrow it a bit.",
      description: "Conservative stereo narrowing on the committed moderate-width stereo fixture.",
      fixtureId: "fixture_phase1_request_cycle_stereo_width_source",
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["stereo_width"],
          expected_operation_order: ["stereo_width"],
          required_goals: ["slightly reduce stereo width"],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "slightly reduce stereo width": "met",
          },
          verification_statuses: {
            target_narrower_stereo_width: "met",
            target_narrower_no_collapse: "met",
          },
          required_semantic_labels: ["narrower"],
        },
        regressions: {
          forbidden_regression_kinds: ["stereo_collapse", "stereo_balance_regression"],
        },
      },
    },
    {
      caseId: "request_cycle_center_this_more",
      family: "first_prompt_family",
      prompt: "Center this more.",
      description:
        "Conservative stereo-balance correction on the committed imbalanced stereo fixture.",
      fixtureId: "fixture_phase1_request_cycle_stereo_imbalance_source",
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["stereo_balance_correction"],
          expected_operation_order: ["stereo_balance_correction"],
          required_goals: ["reduce left-right stereo imbalance conservatively"],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "reduce left-right stereo imbalance conservatively": "met",
          },
          verification_statuses: {
            target_center_stereo_balance: "met",
            target_center_no_balance_regression: "met",
            target_center_no_collapse: "met",
          },
          required_semantic_labels: ["more_centered"],
        },
        regressions: {
          forbidden_regression_kinds: ["stereo_balance_regression", "stereo_collapse"],
        },
      },
    },
    {
      caseId: "request_cycle_fix_stereo_imbalance",
      family: "first_prompt_family",
      prompt: "Fix the stereo imbalance.",
      description: "Stereo-imbalance wording variant on the committed imbalanced stereo fixture.",
      fixtureId: "fixture_phase1_request_cycle_stereo_imbalance_source",
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["stereo_balance_correction"],
          expected_operation_order: ["stereo_balance_correction"],
          required_goals: ["reduce left-right stereo imbalance conservatively"],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "reduce left-right stereo imbalance conservatively": "met",
          },
          verification_statuses: {
            target_center_stereo_balance: "met",
            target_center_no_balance_regression: "met",
            target_center_no_collapse: "met",
          },
          required_semantic_labels: ["more_centered"],
        },
        regressions: {
          forbidden_regression_kinds: ["stereo_balance_regression", "stereo_collapse"],
        },
      },
    },
    {
      caseId: "request_cycle_center_this_more_and_make_it_wider",
      family: "first_prompt_family",
      prompt: "Center this more and make it wider.",
      description: "Stereo-balance-plus-width compound on the committed imbalanced stereo fixture.",
      fixtureId: "fixture_phase1_request_cycle_stereo_imbalance_source",
      expectation: {
        planner: {
          expected_result_kind: "applied",
          required_operations: ["stereo_balance_correction", "stereo_width"],
          expected_operation_order: ["stereo_balance_correction", "stereo_width"],
          required_goals: [
            "reduce left-right stereo imbalance conservatively",
            "slightly increase stereo width",
          ],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "reduce left-right stereo imbalance conservatively": "met",
            "slightly increase stereo width": "mostly_met",
          },
          verification_statuses: {
            target_center_stereo_balance: "met",
            target_center_no_balance_regression: "met",
            target_wider_stereo_width: "mostly_met",
            target_wider_no_instability: "met",
          },
          required_semantic_labels: ["more_centered", "wider"],
        },
        regressions: {
          forbidden_regression_kinds: [
            "stereo_balance_regression",
            "stereo_instability",
            "stereo_collapse",
          ],
        },
      },
    },
    {
      caseId: "request_cycle_follow_up_more",
      family: "first_prompt_family",
      prompt: "more",
      description: "Follow-up shorthand should replay the previous request on the latest version.",
      fixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
      setup_sequence: ["make this loop darker and less harsh"],
      expectation: {
        planner: {
          expected_result_kind: "applied",
          expected_follow_up_source: "repeat_last_request",
          expected_input_setup_index: 0,
          required_operations: ["notch_filter", "tilt_eq"],
          expected_operation_order: ["notch_filter", "tilt_eq"],
          required_goals: [
            "reduce upper-mid harshness",
            "tilt the overall balance slightly darker",
          ],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "reduce upper-mid harshness": "met",
            "tilt the overall balance slightly darker": "met",
          },
        },
      },
    },
    {
      caseId: "request_cycle_follow_up_try_another_version",
      family: "first_prompt_family",
      prompt: "try another version",
      description:
        "Alternate follow-up should branch from the prior baseline and replay the last request.",
      fixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
      setup_sequence: ["make this loop darker and less harsh"],
      expectation: {
        planner: {
          expected_result_kind: "applied",
          expected_follow_up_source: "try_another_version",
          require_active_branch: true,
          required_operations: ["notch_filter", "tilt_eq"],
          expected_operation_order: ["notch_filter", "tilt_eq"],
          required_goals: [
            "reduce upper-mid harshness",
            "tilt the overall balance slightly darker",
          ],
        },
        outcome: {
          report_scope: "version",
          require_structured_verification: true,
          goal_statuses: {
            "reduce upper-mid harshness": "met",
            "tilt the overall balance slightly darker": "met",
          },
        },
      },
    },
    {
      caseId: "request_cycle_follow_up_less",
      family: "first_prompt_family",
      prompt: "less",
      description: "Less should revert one step back through version ancestry.",
      fixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
      setup_sequence: ["make this loop darker and less harsh", "more"],
      expectation: {
        planner: {
          expected_result_kind: "reverted",
          expected_follow_up_source: "less",
          expected_output_setup_index: 0,
        },
      },
    },
    {
      caseId: "request_cycle_follow_up_undo",
      family: "first_prompt_family",
      prompt: "undo",
      description: "Undo should restore the prior active version from session history.",
      fixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
      setup_sequence: ["make this loop darker and less harsh", "more", "less"],
      expectation: {
        planner: {
          expected_result_kind: "reverted",
          expected_follow_up_source: "undo",
          expected_output_setup_index: 1,
        },
      },
    },
    {
      caseId: "request_cycle_follow_up_revert_previous_version",
      family: "first_prompt_family",
      prompt: "revert to previous version",
      description: "Explicit revert wording should resolve to the previous recorded version.",
      fixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
      setup_sequence: ["make this loop darker and less harsh", "more"],
      expectation: {
        planner: {
          expected_result_kind: "reverted",
          expected_follow_up_source: "revert",
          expected_output_setup_index: 0,
        },
      },
    },
    {
      caseId: "request_cycle_clean_it_clarification",
      family: "first_prompt_family",
      prompt: "clean it",
      description:
        "Generic cleanup wording should fail explicitly as supported-but-underspecified instead of inventing a restoration path.",
      fixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
      expectation: {
        error: {
          stage: "plan",
          failure_class: "supported_but_underspecified",
          message_includes: "could not derive an executable plan",
        },
      },
    },
    {
      caseId: "request_cycle_brighter_and_darker_contradiction",
      family: "first_prompt_family",
      prompt: "Make it brighter and darker.",
      description:
        "Contradictory tonal directions should fail explicitly instead of inventing a blended compound edit.",
      fixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
      expectation: {
        error: {
          stage: "plan",
          failure_class: "supported_but_underspecified",
          message_includes: "both darker and brighter tonal moves",
        },
      },
    },
    {
      caseId: "request_cycle_speed_up_and_slow_down_contradiction",
      family: "first_prompt_family",
      prompt: "Make it faster and slower.",
      description:
        "Contradictory timing directions should fail explicitly instead of guessing a compromise.",
      fixtureId: "fixture_phase1_request_cycle_pitched_timing_source",
      expectation: {
        error: {
          stage: "plan",
          failure_class: "supported_but_underspecified",
          message_includes: "both faster and slower timing moves",
        },
      },
    },
    {
      caseId: "request_cycle_wider_and_narrower_contradiction",
      family: "first_prompt_family",
      prompt: "Make it wider and narrower.",
      description:
        "Contradictory stereo-width directions should fail explicitly instead of inventing a compromise image move.",
      fixtureId: "fixture_phase1_request_cycle_stereo_width_source",
      expectation: {
        error: {
          stage: "plan",
          failure_class: "supported_but_underspecified",
          message_includes: "both wider and narrower stereo moves",
        },
      },
    },
    {
      caseId: "request_cycle_clean_this_sample_up_a_bit_underspecified",
      family: "first_prompt_family",
      prompt: "clean this sample up a bit",
      description:
        "Cleanup wording on a non-noisy source should fail conservatively with a supported-but-underspecified planning error.",
      fixtureId: FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
      expectation: {
        error: {
          stage: "plan",
          failure_class: "supported_but_underspecified",
          message_includes: "only supports conservative tonal cleanup",
        },
      },
    },
  ],
};

export const firstPromptFamilyRequestCycleSuite: RequestCycleBenchmarkCase[] =
  firstPromptFamilyRequestCycleCorpus.cases;

export const interpretationBenchmarkCorpus: InterpretationBenchmarkCorpus = {
  corpusId: INTERPRETATION_CORPUS_ID,
  suiteId: "intent_interpretation",
  description:
    "Offline interpretation benchmark corpus for the richer IntentInterpretation artifact, covering clarification, constraints, region intents, follow-up interpretation, and runtime-only refusal behavior.",
  cases: [
    {
      caseId: "interpret_darker_keep_punch",
      family: "intent_interpretation",
      prompt: "Make it darker but keep the punch.",
      description: "Supported tonal request with a preservation constraint.",
      interpretation: createInterpretationArtifact({
        userRequest: "Make it darker but keep the punch.",
        normalizedRequest: "Make it darker while preserving punch.",
        nextAction: "plan",
        normalizedObjectives: ["darker"],
        candidateDescriptors: ["dark"],
        constraints: [{ kind: "preserve", label: "punch" }],
        descriptorHypotheses: [
          {
            label: "harsh",
            status: "weak",
            needs_more_evidence: ["analysis.measurements.spectral_balance.harshness_ratio_db"],
          },
        ],
        groundingNotes: ["preserve transient impact while darkening"],
      }),
      expectation: {
        requestClassification: "supported",
        nextAction: "plan",
        requiredNormalizedObjectives: ["darker"],
        requiredConstraints: [{ kind: "preserve", label: "punch" }],
        requiredGroundingNotes: ["preserve transient impact while darkening"],
      },
    },
    {
      caseId: "interpret_clean_it_clarify",
      family: "intent_interpretation",
      prompt: "Clean it.",
      description: "Underspecified cleanup wording should clarify rather than overreach.",
      interpretation: createInterpretationArtifact({
        userRequest: "Clean it.",
        normalizedRequest: "Clarify the cleanup target before planning.",
        requestClassification: "supported_but_underspecified",
        nextAction: "clarify",
        normalizedObjectives: [],
        candidateDescriptors: ["cleaner"],
        ambiguities: ["cleanup target is not specific enough"],
        clarificationQuestion:
          "Do you want less hum, fewer clicks, less harshness, or lower steady noise?",
        candidateInterpretations: [
          {
            normalized_request: "Reduce steady background noise conservatively.",
            request_classification: "supported_but_underspecified",
            next_action: "clarify",
            normalized_objectives: ["cleaner"],
            candidate_descriptors: ["cleaner"],
            rationale:
              "One plausible reading is broadband cleanup, but the request is still underspecified.",
            confidence: 0.48,
          },
        ],
      }),
      expectation: {
        requestClassification: "supported_but_underspecified",
        nextAction: "clarify",
        requireClarificationQuestion: true,
        expectedCandidateInterpretationCount: 1,
      },
    },
    {
      caseId: "interpret_brighter_and_darker",
      family: "intent_interpretation",
      prompt: "Make it brighter and darker.",
      description:
        "Contradictory tonal directions should surface as clarification, not a fake compound plan.",
      interpretation: createInterpretationArtifact({
        userRequest: "Make it brighter and darker.",
        normalizedRequest: "Clarify whether the tonal direction should be brighter or darker.",
        requestClassification: "supported_but_underspecified",
        nextAction: "clarify",
        normalizedObjectives: ["brighter", "darker"],
        candidateDescriptors: ["bright", "dark"],
        ambiguities: ["conflicting tonal directions"],
        clarificationQuestion: "Should the result be brighter or darker overall?",
      }),
      expectation: {
        requestClassification: "supported_but_underspecified",
        nextAction: "clarify",
        requiredNormalizedObjectives: ["brighter", "darker"],
        requireClarificationQuestion: true,
      },
    },
    {
      caseId: "interpret_remove_hum_first_second",
      family: "intent_interpretation",
      prompt: "Remove the hum only in the first second.",
      description:
        "Explicit region language should survive into region_intents even if planning later declines to auto-ground it.",
      interpretation: createInterpretationArtifact({
        userRequest: "Remove the hum only in the first second.",
        normalizedRequest: "Reduce hum only in the first second.",
        nextAction: "plan",
        normalizedObjectives: ["remove_hum"],
        candidateDescriptors: ["hum_present"],
        regionIntents: [{ scope: "time_range", start_seconds: 0, end_seconds: 1 }],
        descriptorHypotheses: [
          {
            label: "hum_present",
            status: "supported",
            supported_by: ["analysis.measurements.artifacts.hum_detected"],
          },
        ],
      }),
      expectation: {
        requestClassification: "supported",
        nextAction: "plan",
        requiredNormalizedObjectives: ["remove_hum"],
        requiredDescriptorHypotheses: [{ label: "hum_present", status: "supported" }],
        requiredRegionIntentScope: "time_range",
      },
    },
    {
      caseId: "interpret_follow_up_not_that_much",
      family: "intent_interpretation",
      prompt: "Not that much.",
      description:
        "Session-aware fuzzy follow-up should reduce intensity without replacing deterministic follow-up resolution.",
      interpretation: createInterpretationArtifact({
        userRequest: "Not that much.",
        normalizedRequest: "Make it darker and less harsh, but more subtly.",
        nextAction: "plan",
        normalizedObjectives: ["darker", "less_harsh"],
        candidateDescriptors: ["dark", "harsh"],
        constraints: [{ kind: "intensity", label: "subtle", value: "subtle" }],
        followUpIntent: { kind: "reduce_previous_intensity" },
        groundingNotes: ["use prior request as the semantic baseline"],
      }),
      expectation: {
        requestClassification: "supported",
        nextAction: "plan",
        requiredConstraints: [{ kind: "intensity", label: "subtle", value: "subtle" }],
        expectedFollowUpIntentKind: "reduce_previous_intensity",
        requiredGroundingNotes: ["use prior request as the semantic baseline"],
      },
    },
    {
      caseId: "interpret_try_another_version",
      family: "intent_interpretation",
      prompt: "Try another version.",
      description: "Follow-up branching request should stay explicit at the interpretation layer.",
      interpretation: createInterpretationArtifact({
        userRequest: "Try another version.",
        normalizedRequest: "Try another version of the previous request from the prior baseline.",
        nextAction: "plan",
        normalizedObjectives: ["alternate_version"],
        candidateDescriptors: [],
        followUpIntent: { kind: "try_another_version" },
      }),
      expectation: {
        requestClassification: "supported",
        nextAction: "plan",
        expectedFollowUpIntentKind: "try_another_version",
      },
    },
    {
      caseId: "interpret_bitcrush_runtime_only",
      family: "intent_interpretation",
      prompt: "Bitcrush this a little.",
      description:
        "Runtime-only wording should remain explicit instead of being upgraded into planner support.",
      interpretation: createInterpretationArtifact({
        userRequest: "Bitcrush this a little.",
        normalizedRequest: "Apply a subtle bitcrush effect.",
        requestClassification: "supported_runtime_only_but_not_planner_enabled",
        nextAction: "refuse",
        normalizedObjectives: ["bitcrush"],
        candidateDescriptors: ["crunchy"],
        unsupportedPhrases: ["bitcrush"],
        rationale:
          "The runtime can execute bitcrush explicitly, but the baseline planner does not support it automatically.",
      }),
      expectation: {
        requestClassification: "supported_runtime_only_but_not_planner_enabled",
        nextAction: "refuse",
        requiredNormalizedObjectives: ["bitcrush"],
      },
    },
  ],
};

export const interpretationBenchmarkSuite: InterpretationBenchmarkCase[] =
  interpretationBenchmarkCorpus.cases;

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
  stereoBalanceDb?: number;
  noiseFloorDbfs: number;
  clippingDetected: boolean;
  headroomDb?: number;
  dynamicRangeDb?: number;
  clippedSampleCount?: number;
  humDetected?: boolean;
  humLevelDbfs?: number;
  humFundamentalHz?: number;
  humHarmonicCount?: number;
  clickDetected?: boolean;
  clickCount?: number;
  clickRatePerSecond?: number;
}

interface CreateCompareOptionsInput {
  baselineVersionId: string;
  candidateVersionId: string;
  baseline: AnalysisValues;
  candidate: AnalysisValues;
  prompt: string;
  goals: string[];
  verificationTargets?: Array<string | VerificationTarget>;
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
    editPlan: createEditPlan(
      input.baselineVersionId,
      input.prompt,
      input.goals,
      input.verificationTargets,
    ),
    generatedAt: "2026-04-14T22:00:00Z",
  };
}

interface CreateInterpretationArtifactInput {
  userRequest: string;
  normalizedRequest: string;
  requestClassification?: IntentInterpretation["request_classification"];
  nextAction: IntentInterpretation["next_action"];
  normalizedObjectives: string[];
  candidateDescriptors: string[];
  ambiguities?: string[];
  unsupportedPhrases?: string[];
  clarificationQuestion?: string;
  descriptorHypotheses?: IntentInterpretation["descriptor_hypotheses"];
  constraints?: IntentInterpretation["constraints"];
  regionIntents?: IntentInterpretation["region_intents"];
  candidateInterpretations?: IntentInterpretation["candidate_interpretations"];
  followUpIntent?: IntentInterpretation["follow_up_intent"];
  groundingNotes?: string[];
  rationale?: string;
  confidence?: number;
}

function createInterpretationArtifact(
  input: CreateInterpretationArtifactInput,
): IntentInterpretation {
  return {
    schema_version: "1.0.0",
    interpretation_id: `interpret_benchmark_${slugify(input.normalizedRequest)}`,
    asset_id: "asset_benchmark_interpretation",
    version_id: "ver_benchmark_interpretation",
    analysis_report_id: "analysis_benchmark_interpretation",
    semantic_profile_id: "semantic_benchmark_interpretation",
    user_request: input.userRequest,
    normalized_request: input.normalizedRequest,
    request_classification: input.requestClassification ?? "supported",
    next_action: input.nextAction,
    normalized_objectives: input.normalizedObjectives,
    candidate_descriptors: input.candidateDescriptors,
    ...(input.descriptorHypotheses === undefined
      ? {}
      : { descriptor_hypotheses: input.descriptorHypotheses }),
    ...(input.constraints === undefined ? {} : { constraints: input.constraints }),
    ...(input.regionIntents === undefined ? {} : { region_intents: input.regionIntents }),
    ...(input.candidateInterpretations === undefined
      ? {}
      : { candidate_interpretations: input.candidateInterpretations }),
    ...(input.followUpIntent === undefined ? {} : { follow_up_intent: input.followUpIntent }),
    ...(input.ambiguities === undefined ? {} : { ambiguities: input.ambiguities }),
    ...(input.unsupportedPhrases === undefined
      ? {}
      : { unsupported_phrases: input.unsupportedPhrases }),
    ...(input.clarificationQuestion === undefined
      ? {}
      : { clarification_question: input.clarificationQuestion }),
    ...(input.groundingNotes === undefined ? {} : { grounding_notes: input.groundingNotes }),
    rationale:
      input.rationale ??
      "Benchmark fixture artifact for evaluating the richer interpretation contract.",
    confidence: input.confidence ?? 0.78,
    provider: {
      kind: "openai",
      model: "gpt-5-mini",
      prompt_version: "intent_v2",
      cached: false,
      response_ms: 42,
    },
    generated_at: "2026-04-21T22:00:00Z",
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function createVersion(versionId: string): AudioVersion {
  return {
    schema_version: "1.0.0",
    version_id: versionId as `ver_${string}`,
    asset_id: "asset_benchmark_01",
    lineage: {
      created_at: "2026-04-14T20:20:05Z",
      created_by: "benchmarks",
      reason: "fixture",
    },
    audio: {
      storage_ref: `storage/audio/${versionId}.wav`,
      sample_rate_hz: 22050,
      channels: 1,
      duration_seconds: 0.96,
      frame_count: Math.round(0.96 * 22050),
      channel_layout: "mono",
    },
  };
}

function createEditPlan(
  versionId: string,
  prompt: string,
  goals: string[],
  verificationTargets?: Array<string | VerificationTarget>,
): EditPlan {
  const plan: EditPlan = {
    schema_version: "1.0.0",
    plan_id: `plan_${versionId}`,
    capability_manifest_id: "capmanifest_20260418C",
    asset_id: "asset_benchmark_01",
    version_id: versionId,
    user_request: prompt,
    goals,
  };

  if (verificationTargets !== undefined && verificationTargets.length > 0) {
    plan.verification_targets = verificationTargets;
  }

  return plan;
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
        rms_dbfs: values.integratedLufs - 3,
        sample_peak_dbfs: values.truePeakDbtp - 0.3,
        headroom_db: values.headroomDb ?? Math.max(0, -(values.truePeakDbtp - 0.3)),
      },
      dynamics: {
        crest_factor_db: values.crestFactorDb,
        transient_density_per_second: values.transientDensity,
        rms_short_term_dbfs: values.integratedLufs - 1.5,
        dynamic_range_db: values.dynamicRangeDb ?? 8,
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
        balance_db: values.stereoBalanceDb ?? 0,
      },
      artifacts: {
        clipping_detected: values.clippingDetected,
        noise_floor_dbfs: values.noiseFloorDbfs,
        clipped_sample_count: values.clippedSampleCount ?? 0,
        hum_detected: values.humDetected ?? false,
        ...(values.humLevelDbfs === undefined ? {} : { hum_level_dbfs: values.humLevelDbfs }),
        ...(values.humFundamentalHz === undefined
          ? {}
          : { hum_fundamental_hz: values.humFundamentalHz }),
        hum_harmonic_count: values.humHarmonicCount ?? 0,
        click_detected: values.clickDetected ?? false,
        click_count: values.clickCount ?? 0,
        click_rate_per_second: values.clickRatePerSecond ?? 0,
      },
    },
  };
}
