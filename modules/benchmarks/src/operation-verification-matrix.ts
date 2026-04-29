import {
  getRuntimeOperationCapability,
  plannerSupportedRuntimeOperations,
  type RuntimeOperationName,
} from "@audio-language-interface/capabilities";

import type {
  PlannerSupportedOperationVerificationCoverageStatus,
  PlannerSupportedOperationVerificationEntry,
} from "./types.js";

type MatrixEntryInput = Omit<
  PlannerSupportedOperationVerificationEntry,
  "category" | "supportedTargetScopes"
>;

function entry(input: MatrixEntryInput): PlannerSupportedOperationVerificationEntry {
  const capability = getRuntimeOperationCapability(input.operation);

  return {
    ...input,
    category: capability.category,
    supportedTargetScopes: capability.supported_target_scopes,
  };
}

export const plannerSupportedOperationVerificationMatrix = [
  entry({
    operation: "gain",
    plannerIntentSummary:
      "Localized or whole-file level changes such as louder, quieter, softer, or turn down.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: [
      "request_cycle_first_half_second_softer_stress",
      "request_cycle_first_half_second_turn_down_stress",
    ],
    verificationTargetIds: ["target_louder_integrated_lufs", "target_quieter_integrated_lufs"],
    verificationMetrics: ["levels.integrated_lufs", "derived.local_rms_db"],
    regressionGuardKinds: ["loudness_headroom_loss"],
    compareEvidence: [
      "structured_verification.analysis_metric",
      "local_audio_metrics.time_range",
      "compare.regressions",
    ],
    coverageStatus: "request_cycle_verified",
    notes:
      "Request-cycle coverage currently exercises numeric time_range gain reductions; whole-file louder/quieter targets are covered by planner and compare target logic.",
  }),
  entry({
    operation: "normalize",
    plannerIntentSummary:
      "Conservative loudness normalization and controlled-loudness output staging.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: [
      "request_cycle_louder_and_more_controlled",
      "request_cycle_louder_keep_controlled_stress",
    ],
    verificationTargetIds: [
      "target_normalize_integrated_lufs",
      "target_normalize_true_peak_ceiling",
      "target_normalize_no_headroom_loss",
      "target_controlled_loudness_integrated_lufs",
      "target_controlled_loudness_no_headroom_loss",
    ],
    verificationMetrics: ["levels.integrated_lufs", "levels.true_peak_dbtp"],
    regressionGuardKinds: ["loudness_headroom_loss", "peak_control_regression"],
    compareEvidence: [
      "structured_verification.analysis_metric",
      "structured_verification.regression_guard",
    ],
    coverageStatus: "request_cycle_verified",
    notes:
      "The benchmarked normalize path is currently tied to louder-and-controlled compounds rather than a standalone normalize prompt.",
  }),
  entry({
    operation: "trim",
    plannerIntentSummary: "Explicit keep/cut ranges with concrete start and end timestamps.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: ["request_cycle_explicit_trim_range"],
    verificationTargetIds: ["target_trim_explicit_duration"],
    verificationMetrics: ["duration_seconds", "derived.output_duration_seconds"],
    regressionGuardKinds: [],
    compareEvidence: ["local_audio_metrics.duration"],
    coverageStatus: "request_cycle_verified",
    notes: "Explicit trim ranges now have request-cycle coverage with local duration evidence.",
  }),
  entry({
    operation: "trim_silence",
    plannerIntentSummary:
      "Conservative boundary-silence removal at the beginning and end of a file.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: ["request_cycle_trim_boundary_silence"],
    verificationTargetIds: [
      "target_trim_leading_silence",
      "target_trim_trailing_silence",
      "target_trim_silence_duration_reduction",
    ],
    verificationMetrics: [
      "derived.leading_silence_seconds",
      "derived.trailing_silence_seconds",
      "duration_seconds",
    ],
    regressionGuardKinds: [],
    compareEvidence: ["structured_verification.analysis_metric", "local_audio_metrics.duration"],
    coverageStatus: "request_cycle_verified",
    notes:
      "Boundary silence trimming is covered by request-cycle planner and structured outcome checks.",
  }),
  entry({
    operation: "fade",
    plannerIntentSummary: "Explicit fade-in and fade-out envelopes with concrete durations.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: ["request_cycle_explicit_fade_out"],
    verificationTargetIds: [
      "target_fade_in_200ms_envelope",
      "target_fade_out_100ms_envelope",
      "target_fade_out_200ms_envelope",
    ],
    verificationMetrics: ["derived.fade_in_boundary_ratio", "derived.fade_out_boundary_ratio"],
    regressionGuardKinds: [],
    compareEvidence: ["local_audio_metrics.fade_envelope"],
    coverageStatus: "request_cycle_verified",
    notes:
      "Explicit fade-out requests now have request-cycle coverage with local envelope evidence.",
  }),
  entry({
    operation: "pitch_shift",
    plannerIntentSummary: "Semitone pitch shifts that preserve duration on pitched material.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: [
      "request_cycle_pitch_up_two_semitones",
      "request_cycle_raise_pitch_two_semitones_word_stress",
    ],
    verificationTargetIds: ["target_pitch_shift_center", "target_pitch_shift_duration_guard"],
    verificationMetrics: ["derived.pitch_center_hz", "duration_seconds"],
    regressionGuardKinds: [],
    compareEvidence: ["local_audio_metrics.pitch_center", "local_audio_metrics.duration"],
    coverageStatus: "request_cycle_verified",
    notes: "Pitch-shift checks depend on fixture material with stable pitch-center evidence.",
  }),
  entry({
    operation: "parametric_eq",
    plannerIntentSummary: "Surgical tonal cuts for muddiness and low-mid cleanup.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: [
      "request_cycle_less_muddy",
      "request_cycle_clean_up_low_mids_stress",
      "request_cycle_warmer_clean_low_mids_stress",
      "request_cycle_darker_less_harsh_less_muddy",
    ],
    verificationTargetIds: [
      "target_less_muddy_mid_band",
      "target_less_muddy_no_lost_air_regression",
    ],
    verificationMetrics: ["spectral_balance.mid_band_db"],
    regressionGuardKinds: ["lost_air"],
    compareEvidence: [
      "structured_verification.analysis_metric",
      "structured_verification.regression_guard",
    ],
    coverageStatus: "request_cycle_verified",
    notes:
      "The current request-cycle surface verifies the audible goal, not exact biquad response.",
  }),
  entry({
    operation: "high_pass_filter",
    plannerIntentSummary: "Sub-bass rumble cleanup and explicit high-pass low-end requests.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: ["request_cycle_high_pass_low_end_rumble_stress"],
    verificationTargetIds: ["target_remove_rumble_low_band"],
    verificationMetrics: ["spectral_balance.low_band_db"],
    regressionGuardKinds: [],
    compareEvidence: ["structured_verification.analysis_metric"],
    coverageStatus: "request_cycle_verified",
    notes:
      "High-pass verification is anchored to low-band reduction around the published rumble target.",
  }),
  entry({
    operation: "low_pass_filter",
    plannerIntentSummary:
      "Explicit low-pass filtering and high-frequency rolloff requests that should not be folded into generic darker wording.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: ["request_cycle_low_pass_top_end_stress"],
    verificationTargetIds: ["target_low_pass_high_band", "target_low_pass_no_added_muddiness"],
    verificationMetrics: ["spectral_balance.high_band_db"],
    regressionGuardKinds: ["added_muddiness"],
    compareEvidence: [
      "structured_verification.analysis_metric",
      "structured_verification.regression_guard",
    ],
    coverageStatus: "request_cycle_verified",
    notes:
      "Explicit low-pass wording is planner-emitted and benchmarked separately from generic darker tonal tilt.",
  }),
  entry({
    operation: "high_shelf",
    plannerIntentSummary:
      "Broad top-end air or sparkle boosts when evidence supports a safe tonal lift.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: ["request_cycle_warmer_and_airier"],
    verificationTargetIds: ["target_more_air_high_band", "target_more_air_no_sibilance_regression"],
    verificationMetrics: ["spectral_balance.high_band_db"],
    regressionGuardKinds: ["increased_sibilance"],
    compareEvidence: [
      "structured_verification.analysis_metric",
      "structured_verification.regression_guard",
    ],
    coverageStatus: "request_cycle_verified",
    notes:
      "Air checks include a sibilance regression guard so broad high-shelf boosts do not overclaim success.",
  }),
  entry({
    operation: "low_shelf",
    plannerIntentSummary: "Broad warmth and low-band weight adjustments.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: [
      "request_cycle_warmer_and_airier",
      "request_cycle_warmer_clean_low_mids_stress",
    ],
    verificationTargetIds: [
      "target_more_warmth_low_band",
      "target_more_warmth_relative_tilt",
      "target_more_warmth_no_added_muddiness",
    ],
    verificationMetrics: ["spectral_balance.low_band_db", "spectral_balance.brightness_tilt_db"],
    regressionGuardKinds: ["added_muddiness"],
    compareEvidence: [
      "structured_verification.analysis_metric",
      "structured_verification.regression_guard",
    ],
    coverageStatus: "request_cycle_verified",
    notes:
      "Warmth checks accept relative tonal movement when paired with other level or low-mid cleanup edits.",
  }),
  entry({
    operation: "notch_filter",
    plannerIntentSummary: "Narrow harshness or resonance reduction for texture-softening requests.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: [
      "request_cycle_darker_less_harsh",
      "request_cycle_more_relaxed",
      "request_cycle_darker_less_harsh_less_muddy",
      "request_cycle_first_half_second_darker_and_less_harsh",
    ],
    verificationTargetIds: [
      "target_reduce_harshness_presence_band",
      "target_reduce_harshness_ratio",
    ],
    verificationMetrics: [
      "spectral_balance.presence_band_db",
      "spectral_balance.harshness_ratio_db",
    ],
    regressionGuardKinds: [],
    compareEvidence: ["structured_verification.analysis_metric", "local_audio_metrics.time_range"],
    coverageStatus: "request_cycle_verified",
    notes:
      "The matrix treats texture-softening requests as verified when measurable harshness falls.",
  }),
  entry({
    operation: "tilt_eq",
    plannerIntentSummary: "Broad darker/brighter tonal tilt and relaxed texture softening.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: [
      "request_cycle_darker_less_harsh",
      "request_cycle_more_relaxed",
      "request_cycle_reduce_brightness_without_losing_punch",
      "request_cycle_tame_sibilance_and_darker",
      "request_cycle_more_controlled_and_darker",
    ],
    verificationTargetIds: [
      "target_darker_brightness_tilt",
      "target_brighter_brightness_tilt",
      "target_preserve_punch_crest_factor",
      "target_preserve_punch_no_regression",
    ],
    verificationMetrics: ["spectral_balance.brightness_tilt_db", "dynamics.crest_factor_db"],
    regressionGuardKinds: ["lost_punch"],
    compareEvidence: [
      "structured_verification.analysis_metric",
      "structured_verification.regression_guard",
    ],
    coverageStatus: "request_cycle_verified",
    notes:
      "Darker/relaxed paths are benchmarked; brighter support remains more conservative and failure-gated.",
  }),
  entry({
    operation: "compressor",
    plannerIntentSummary:
      "Controlled-dynamics requests where the source has enough dynamic range to justify compression.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: [
      "request_cycle_louder_and_more_controlled",
      "request_cycle_louder_keep_controlled_stress",
    ],
    verificationTargetIds: [
      "target_controlled_loudness_range",
      "target_controlled_loudness_no_overcompression",
      "target_control_dynamics_range",
      "target_control_dynamics_no_overcompression",
    ],
    verificationMetrics: ["dynamics.dynamic_range_db", "levels.headroom_db"],
    regressionGuardKinds: ["over_compression"],
    compareEvidence: [
      "structured_verification.analysis_metric",
      "structured_verification.regression_guard",
    ],
    coverageStatus: "request_cycle_verified",
    notes:
      "Benchmarks also cover the safe skip path where already-controlled material should avoid redundant compression.",
  }),
  entry({
    operation: "limiter",
    plannerIntentSummary: "Peak control and already-controlled loudness gain staging.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: [
      "request_cycle_control_peaks_without_crushing",
      "request_cycle_limit_peaks_phrase_stress",
      "request_cycle_louder_controlled_already_tight_stress",
    ],
    verificationTargetIds: ["target_peak_control_true_peak", "target_peak_control_no_regression"],
    verificationMetrics: ["levels.true_peak_dbtp", "levels.headroom_db"],
    regressionGuardKinds: ["peak_control_regression"],
    compareEvidence: [
      "structured_verification.analysis_metric",
      "structured_verification.regression_guard",
    ],
    coverageStatus: "request_cycle_verified",
    notes:
      "Limiter cases verify peak ceilings and avoid-crushing language through regression guards.",
  }),
  entry({
    operation: "time_stretch",
    plannerIntentSummary: "Explicit tempo or duration changes that preserve pitch.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: [
      "request_cycle_speed_up_preserve_pitch",
      "request_cycle_faster_keep_pitch_stress",
      "request_cycle_speed_up_and_tame_sibilance",
    ],
    verificationTargetIds: [
      "target_time_stretch_duration",
      "target_time_stretch_pitch_preservation",
    ],
    verificationMetrics: ["duration_seconds", "derived.pitch_center_hz"],
    regressionGuardKinds: [],
    compareEvidence: ["local_audio_metrics.duration", "local_audio_metrics.pitch_center"],
    coverageStatus: "request_cycle_verified",
    notes:
      "Pitch-preservation checks are strongest when the fixture has stable pitch-center evidence.",
  }),
  entry({
    operation: "stereo_balance_correction",
    plannerIntentSummary: "Centering and left-right imbalance correction on stereo sources.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: [
      "request_cycle_center_this_more",
      "request_cycle_move_stereo_image_center_stress",
      "request_cycle_fix_stereo_imbalance",
      "request_cycle_center_this_more_and_make_it_wider",
    ],
    verificationTargetIds: [
      "target_center_stereo_balance",
      "target_center_no_balance_regression",
      "target_center_no_collapse",
    ],
    verificationMetrics: ["derived.absolute_stereo_balance_db", "stereo.width"],
    regressionGuardKinds: ["stereo_balance_regression", "stereo_collapse"],
    compareEvidence: [
      "structured_verification.analysis_metric",
      "structured_verification.regression_guard",
    ],
    coverageStatus: "request_cycle_verified",
    notes:
      "Stereo centering checks require already-stereo material with a measurable balance offset.",
  }),
  entry({
    operation: "stereo_width",
    plannerIntentSummary: "Small width increases or decreases when stereo image evidence is safe.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: [
      "request_cycle_make_this_wider",
      "request_cycle_narrow_it_a_bit",
      "request_cycle_center_this_more_and_make_it_wider",
    ],
    verificationTargetIds: [
      "target_wider_stereo_width",
      "target_wider_no_instability",
      "target_narrower_stereo_width",
      "target_narrower_no_collapse",
    ],
    verificationMetrics: ["stereo.width", "stereo.correlation"],
    regressionGuardKinds: ["stereo_instability", "stereo_collapse"],
    compareEvidence: [
      "structured_verification.analysis_metric",
      "structured_verification.regression_guard",
    ],
    coverageStatus: "request_cycle_verified",
    notes:
      "Width changes are benchmarked in both wider and narrower directions plus a center-and-widen compound.",
  }),
  entry({
    operation: "denoise",
    plannerIntentSummary:
      "Conservative noise-floor reduction only when steady-noise evidence is present.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: ["request_cycle_remove_hiss_denoise"],
    verificationTargetIds: ["target_reduce_noise_floor", "target_reduce_noise_no_artifacts"],
    verificationMetrics: ["artifacts.noise_floor_dbfs"],
    regressionGuardKinds: ["denoise_artifacts"],
    compareEvidence: [
      "structured_verification.analysis_metric",
      "structured_verification.regression_guard",
    ],
    coverageStatus: "request_cycle_verified",
    notes:
      "Denoise is request-cycle verified on the committed bright/noisy cleanup fixture with steady-noise evidence.",
  }),
  entry({
    operation: "de_esser",
    plannerIntentSummary: "Sibilance reduction when presence-band evidence supports de-essing.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: [
      "request_cycle_tame_sibilance",
      "request_cycle_speed_up_and_tame_sibilance",
      "request_cycle_tame_sibilance_and_darker",
    ],
    verificationTargetIds: [
      "target_reduce_sibilance_presence",
      "target_reduce_sibilance_harshness_ratio",
    ],
    verificationMetrics: [
      "spectral_balance.presence_band_db",
      "spectral_balance.harshness_ratio_db",
    ],
    regressionGuardKinds: ["increased_sibilance"],
    compareEvidence: ["structured_verification.analysis_metric", "compare.regressions"],
    coverageStatus: "request_cycle_verified",
    notes: "De-essing coverage includes standalone and compound restoration requests.",
  }),
  entry({
    operation: "declick",
    plannerIntentSummary: "Click and pop cleanup when direct or proxy click evidence exists.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: ["request_cycle_clean_up_clicks"],
    verificationTargetIds: ["target_reduce_click_activity", "target_reduce_click_no_regression"],
    verificationMetrics: ["artifacts.click_count", "artifacts.clipped_sample_count"],
    regressionGuardKinds: ["increased_click_proxy"],
    compareEvidence: [
      "structured_verification.analysis_metric",
      "structured_verification.regression_guard",
      "analysis.artifacts.click_detected",
    ],
    coverageStatus: "request_cycle_verified",
    notes:
      "Compare prefers direct click metrics and falls back to spike proxies when direct click evidence is unavailable.",
  }),
  entry({
    operation: "declip",
    plannerIntentSummary:
      "Clipping repair for explicit distorted/clipped requests with direct clipping evidence.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: ["request_cycle_less_distorted_declip"],
    verificationTargetIds: [
      "target_reduce_clipping_activity",
      "target_reduce_clipping_ratio",
      "target_declip_no_new_clipping",
    ],
    verificationMetrics: [
      "artifacts.clipped_frame_count",
      "artifacts.clipped_sample_count",
      "artifacts.clipped_frame_ratio",
    ],
    regressionGuardKinds: ["introduced_or_worsened_clipping"],
    compareEvidence: [
      "structured_verification.analysis_metric",
      "structured_verification.regression_guard",
      "analysis.artifacts.clipping_severity",
    ],
    coverageStatus: "request_cycle_verified",
    notes:
      "No-evidence distortion wording remains intentionally gated; the request-cycle case uses a clipped fixture.",
  }),
  entry({
    operation: "dehum",
    plannerIntentSummary: "50 Hz or 60 Hz hum removal when hum evidence exists.",
    plannerUnitTestRefs: ["modules/planning/tests/plan-edits.test.ts"],
    requestCycleCaseIds: ["request_cycle_remove_60hz_hum"],
    verificationTargetIds: ["target_reduce_hum_activity", "target_reduce_hum_no_regression"],
    verificationMetrics: ["artifacts.hum_level_dbfs", "spectral_balance.low_band_db"],
    regressionGuardKinds: ["increased_hum_proxy"],
    compareEvidence: [
      "structured_verification.analysis_metric",
      "structured_verification.regression_guard",
      "analysis.artifacts.hum_detected",
    ],
    coverageStatus: "request_cycle_verified",
    notes: "Compare prefers direct hum metrics and falls back to conservative low-band evidence.",
  }),
] satisfies readonly PlannerSupportedOperationVerificationEntry[];

const matrixByOperation = new Map(
  plannerSupportedOperationVerificationMatrix.map((item) => [item.operation, item]),
);

export function getPlannerSupportedOperationVerificationEntry(
  operation: RuntimeOperationName,
): PlannerSupportedOperationVerificationEntry | undefined {
  return matrixByOperation.get(operation);
}

export function listPlannerSupportedOperationVerificationEntries(options?: {
  coverageStatus?: PlannerSupportedOperationVerificationCoverageStatus;
}): PlannerSupportedOperationVerificationEntry[] {
  if (options?.coverageStatus === undefined) {
    return [...plannerSupportedOperationVerificationMatrix];
  }

  return plannerSupportedOperationVerificationMatrix.filter(
    (item) => item.coverageStatus === options.coverageStatus,
  );
}

export const plannerSupportedOperationVerificationGaps =
  listPlannerSupportedOperationVerificationEntries({
    coverageStatus: "verification_gap",
  });

export const plannerSupportedOperationVerificationPlannerOnly =
  listPlannerSupportedOperationVerificationEntries({
    coverageStatus: "planner_verified",
  });

export const plannerSupportedOperationVerificationRequestCycleVerified =
  listPlannerSupportedOperationVerificationEntries({
    coverageStatus: "request_cycle_verified",
  });

export const plannerSupportedOperationVerificationRequestCyclePlannerCovered =
  listPlannerSupportedOperationVerificationEntries({
    coverageStatus: "request_cycle_planner_covered",
  });

const missingMatrixOperations = plannerSupportedRuntimeOperations.filter(
  (operation) => !matrixByOperation.has(operation),
);

if (missingMatrixOperations.length > 0) {
  throw new Error(
    `Planner-supported operation verification matrix is missing: ${missingMatrixOperations.join(
      ", ",
    )}.`,
  );
}
