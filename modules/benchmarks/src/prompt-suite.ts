import type {
  AnalysisReport,
  AudioVersion,
  CompareVersionsOptions,
  EditPlan,
} from "@audio-language-interface/compare";

import type {
  ComparisonBenchmarkCase,
  ComparisonBenchmarkCorpus,
  RequestCycleBenchmarkCase,
  RequestCycleBenchmarkCorpus,
} from "./types.js";

export const FIRST_PROMPT_FAMILY_CORPUS_ID = "cleanup_slice_v1";
export const FIRST_PROMPT_FAMILY_REQUEST_CYCLE_CORPUS_ID = "cleanup_request_cycle_v1";
export const FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH = "fixtures/audio/manifest.json";
export const FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID = "fixture_phase1_first_slice_loop_synthetic";

export const firstPromptFamilyFixtureCorpus: ComparisonBenchmarkCorpus = {
  corpusId: FIRST_PROMPT_FAMILY_CORPUS_ID,
  suiteId: "first_prompt_family",
  fixtureManifestPath: FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH,
  description:
    "Current compare benchmark corpus anchored to committed phase-1 WAV fixtures across tonal, restoration, and control checks plus one explicit ambiguous control.",
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
  ],
};

export const firstPromptFamilyPromptSuite: ComparisonBenchmarkCase[] =
  firstPromptFamilyFixtureCorpus.cases;

export const firstPromptFamilyRequestCycleCorpus: RequestCycleBenchmarkCorpus = {
  corpusId: FIRST_PROMPT_FAMILY_REQUEST_CYCLE_CORPUS_ID,
  suiteId: "first_prompt_family",
  fixtureManifestPath: FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH,
  description:
    "Real request-cycle benchmark corpus over committed phase-1 fixtures, covering supported tonal cleanup, restoration, timing edits, loudness/control, and explicit clarification/failure controls.",
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
  verificationTargets?: string[];
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
  verificationTargets?: string[],
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
        balance_db: 0,
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
