import {
  getRuntimeOperationCapability,
  type RuntimeOperationName,
  type RuntimeTargetScope,
} from "@audio-language-interface/capabilities";

import {
  assertValidFadeSpans,
  buildCompressorSafetyLimits,
  buildDeclickSafetyLimits,
  buildDeEsserSafetyLimits,
  buildDehumSafetyLimits,
  buildDenoiseSafetyLimits,
  buildEqSafetyLimits,
  buildFadeSafetyLimits,
  buildFilterSafetyLimits,
  buildGainSafetyLimits,
  buildLimiterSafetyLimits,
  buildNormalizeSafetyLimits,
  buildStereoWidthSafetyLimits,
  buildTrimSafetyLimits,
  resolveEqGainDb,
  resolveGainStepDb,
} from "./safety.js";
import type {
  AnalysisReport,
  AudioVersion,
  EditPlanStep,
  ParsedEditObjectives,
  SemanticProfile,
} from "./types.js";

interface StepBuildContext {
  objectives: ParsedEditObjectives;
  audioVersion: AudioVersion;
  analysisReport: AnalysisReport;
  semanticProfile: SemanticProfile;
}

export function buildPlannedSteps(context: StepBuildContext): EditPlanStep[] {
  const steps: EditPlanStep[] = [];

  const trimStep = buildTrimStep(context.objectives, context.audioVersion);
  if (trimStep) {
    steps.push(trimStep);
  }

  const fadeStep = buildFadeStep(context.objectives, context.audioVersion);
  if (fadeStep) {
    steps.push(fadeStep);
  }

  const declickStep = buildDeclickStep(context.objectives);
  if (declickStep) {
    steps.push(declickStep);
  }

  const dehumStep = buildDehumStep(context.objectives);
  if (dehumStep) {
    steps.push(dehumStep);
  }

  const denoiseStep = buildDenoiseStep(context.objectives, context.analysisReport);
  if (denoiseStep) {
    steps.push(denoiseStep);
  }

  const deEsserStep = buildDeEsserStep(context.objectives);
  if (deEsserStep) {
    steps.push(deEsserStep);
  }

  const filterStep = buildRumbleStep(context.objectives);
  if (filterStep) {
    steps.push(filterStep);
  }

  steps.push(...buildTonalSteps(context));

  const compressorStep = buildCompressorStep(context.objectives);
  if (compressorStep) {
    steps.push(compressorStep);
  }

  const limiterStep = buildLimiterStep(context.objectives, context.analysisReport);
  if (limiterStep) {
    steps.push(limiterStep);
  }

  const stereoWidthStep = buildStereoWidthStep(context.objectives);
  if (stereoWidthStep) {
    steps.push(stereoWidthStep);
  }

  const normalizeStep = buildNormalizeStep(context.objectives, context.analysisReport);
  if (normalizeStep) {
    steps.push(normalizeStep);
  }

  const gainStep = buildGainStep(context.objectives, context.analysisReport);
  if (gainStep) {
    steps.push(gainStep);
  }

  return steps;
}

function buildTrimStep(
  objectives: ParsedEditObjectives,
  audioVersion: AudioVersion,
): EditPlanStep | undefined {
  if (!objectives.trim_range) {
    return undefined;
  }

  if (objectives.trim_range.end_seconds > audioVersion.audio.duration_seconds) {
    throw new Error("Requested trim range must stay within the provided AudioVersion duration.");
  }

  return {
    ...assertPlannerStepSupport("trim", "time_range"),
    step_id: "step_trim_1",
    operation: "trim",
    target: {
      scope: "time_range",
      start_seconds: objectives.trim_range.start_seconds,
      end_seconds: objectives.trim_range.end_seconds,
    },
    parameters: {},
    expected_effects: [
      `retain audio from ${objectives.trim_range.start_seconds}s to ${objectives.trim_range.end_seconds}s only`,
    ],
    safety_limits: buildTrimSafetyLimits(),
  };
}

function buildFadeStep(
  objectives: ParsedEditObjectives,
  audioVersion: AudioVersion,
): EditPlanStep | undefined {
  if (objectives.fade_in_seconds === undefined && objectives.fade_out_seconds === undefined) {
    return undefined;
  }

  const availableDurationSeconds = objectives.trim_range
    ? objectives.trim_range.end_seconds - objectives.trim_range.start_seconds
    : audioVersion.audio.duration_seconds;
  const parameters: Record<string, unknown> = {};
  const expectedEffects: string[] = [];

  if (objectives.fade_in_seconds !== undefined) {
    if (objectives.fade_in_seconds > availableDurationSeconds) {
      throw new Error(
        "Requested fade in duration must not exceed the available AudioVersion duration.",
      );
    }

    parameters.fade_in_seconds = objectives.fade_in_seconds;
    expectedEffects.push(`add a ${objectives.fade_in_seconds}s fade in`);
  }

  if (objectives.fade_out_seconds !== undefined) {
    if (objectives.fade_out_seconds > availableDurationSeconds) {
      throw new Error(
        "Requested fade out duration must not exceed the available AudioVersion duration.",
      );
    }

    parameters.fade_out_seconds = objectives.fade_out_seconds;
    expectedEffects.push(`add a ${objectives.fade_out_seconds}s fade out`);
  }

  assertValidFadeSpans(
    objectives.fade_in_seconds,
    objectives.fade_out_seconds,
    availableDurationSeconds,
  );

  return {
    ...assertPlannerStepSupport("fade", "full_file"),
    step_id: "step_fade_1",
    operation: "fade",
    target: { scope: "full_file" },
    parameters,
    expected_effects: expectedEffects,
    safety_limits: buildFadeSafetyLimits(),
  };
}

function buildRumbleStep(objectives: ParsedEditObjectives): EditPlanStep | undefined {
  if (!objectives.wants_remove_rumble) {
    return undefined;
  }

  return {
    ...assertPlannerStepSupport("high_pass_filter", "full_file"),
    step_id: "step_high_pass_1",
    operation: "high_pass_filter",
    target: { scope: "full_file" },
    parameters: { frequency_hz: 40 },
    expected_effects: ["reduce low-frequency rumble below 40 Hz"],
    safety_limits: buildFilterSafetyLimits(),
  };
}

function buildDeclickStep(objectives: ParsedEditObjectives): EditPlanStep | undefined {
  if (!objectives.wants_remove_clicks) {
    return undefined;
  }

  return {
    ...assertPlannerStepSupport("declick", "full_file"),
    step_id: "step_declick_1",
    operation: "declick",
    target: { scope: "full_file" },
    parameters: {
      window_ms:
        objectives.intensity === "subtle" ? 45 : objectives.intensity === "strong" ? 60 : 55,
      overlap_percent: 75,
      ar_order: 2,
      threshold: objectives.intensity === "strong" ? 2.4 : 2,
      burst_fusion: 2,
      method: "add",
    },
    expected_effects: ["repair short impulsive clicks and pops conservatively"],
    safety_limits: buildDeclickSafetyLimits(),
  };
}

function buildDehumStep(objectives: ParsedEditObjectives): EditPlanStep | undefined {
  if (!objectives.wants_remove_hum) {
    return undefined;
  }

  return {
    ...assertPlannerStepSupport("dehum", "full_file"),
    step_id: "step_dehum_1",
    operation: "dehum",
    target: { scope: "full_file" },
    parameters: {
      fundamental_hz: objectives.hum_frequency_hz ?? 60,
      harmonics: 4,
      q: objectives.intensity === "strong" ? 20 : 18,
      mix: objectives.intensity === "subtle" ? 0.85 : 1,
    },
    expected_effects: [
      `reduce narrowband hum centered around ${(objectives.hum_frequency_hz ?? 60).toFixed(0)} Hz and its harmonics`,
    ],
    safety_limits: buildDehumSafetyLimits(),
  };
}

function buildDenoiseStep(
  objectives: ParsedEditObjectives,
  analysisReport: AnalysisReport,
): EditPlanStep | undefined {
  if (!objectives.wants_denoise) {
    return undefined;
  }

  return {
    ...assertPlannerStepSupport("denoise", "full_file"),
    step_id: "step_denoise_1",
    operation: "denoise",
    target: { scope: "full_file" },
    parameters: {
      reduction_db:
        objectives.intensity === "subtle" ? 4 : objectives.intensity === "strong" ? 9 : 6,
      noise_floor_dbfs: Number(analysisReport.measurements.artifacts.noise_floor_dbfs.toFixed(1)),
    },
    expected_effects: ["reduce steady broadband noise without changing the core balance"],
    safety_limits: buildDenoiseSafetyLimits(),
  };
}

function buildDeEsserStep(objectives: ParsedEditObjectives): EditPlanStep | undefined {
  if (!objectives.wants_tame_sibilance) {
    return undefined;
  }

  return {
    ...assertPlannerStepSupport("de_esser", "full_file"),
    step_id: "step_de_esser_1",
    operation: "de_esser",
    target: { scope: "full_file" },
    parameters: {
      intensity:
        objectives.intensity === "subtle" ? 0.3 : objectives.intensity === "strong" ? 0.5 : 0.4,
      max_reduction:
        objectives.intensity === "subtle" ? 0.35 : objectives.intensity === "strong" ? 0.55 : 0.45,
      frequency_hz: 5500,
    },
    expected_effects: ["reduce sibilant bursts without broadly dulling the top end"],
    safety_limits: buildDeEsserSafetyLimits(),
  };
}

function buildTonalSteps({ objectives, analysisReport }: StepBuildContext): EditPlanStep[] {
  const steps: EditPlanStep[] = [];
  const harshnessAnnotation = analysisReport.annotations?.find(
    (annotation) => annotation.kind === "harshness",
  );

  if (objectives.wants_less_harsh) {
    const harshBand = harshnessAnnotation?.bands_hz ?? [3000, 4500];
    steps.push({
      ...assertPlannerStepSupport("notch_filter", "full_file"),
      step_id: "step_notch_filter_1",
      operation: "notch_filter",
      target: { scope: "full_file" },
      parameters: {
        frequency_hz: midpoint(harshBand[0], harshBand[1]),
        q: objectives.intensity === "strong" ? 8.5 : 8,
      },
      expected_effects: ["reduce a narrow harsh resonance"],
      safety_limits: buildEqSafetyLimits(objectives),
    });
  }

  if (objectives.wants_darker || objectives.wants_brighter) {
    steps.push({
      ...assertPlannerStepSupport("tilt_eq", "full_file"),
      step_id: "step_tilt_eq_1",
      operation: "tilt_eq",
      target: { scope: "full_file" },
      parameters: {
        pivot_frequency_hz: 1200,
        gain_db: resolveTiltGainDb(objectives),
        q: 0.6,
      },
      expected_effects: [
        objectives.wants_darker
          ? "tilt the overall balance slightly darker"
          : "tilt the overall balance slightly brighter",
      ],
      safety_limits: buildEqSafetyLimits(objectives),
    });
  }

  if (objectives.wants_less_muddy) {
    steps.push({
      ...assertPlannerStepSupport("low_shelf", "full_file"),
      step_id: "step_low_shelf_1",
      operation: "low_shelf",
      target: { scope: "full_file" },
      parameters: {
        frequency_hz: 220,
        gain_db: Number((resolveEqGainDb(objectives, "cut") * 0.75).toFixed(2)),
        q: 0.75,
      },
      expected_effects: ["trim excess low-mid weight without hollowing the mids"],
      safety_limits: buildEqSafetyLimits(objectives),
    });
  }

  if (objectives.wants_more_warmth) {
    steps.push({
      ...assertPlannerStepSupport("low_shelf", "full_file"),
      step_id: steps.some((step) => step.operation === "low_shelf")
        ? "step_low_shelf_2"
        : "step_low_shelf_1",
      operation: "low_shelf",
      target: { scope: "full_file" },
      parameters: {
        frequency_hz: 180,
        gain_db: Number((resolveEqGainDb(objectives, "boost") * 0.75).toFixed(2)),
        q: 0.7,
      },
      expected_effects: ["add a little low-band warmth"],
      safety_limits: buildEqSafetyLimits(objectives),
    });
  }

  if (objectives.wants_more_air) {
    steps.push({
      ...assertPlannerStepSupport("high_shelf", "full_file"),
      step_id: "step_high_shelf_1",
      operation: "high_shelf",
      target: { scope: "full_file" },
      parameters: {
        frequency_hz: 6500,
        gain_db: Number((resolveEqGainDb(objectives, "boost") * 0.75).toFixed(2)),
        q: 0.8,
      },
      expected_effects: ["add a little upper-band air"],
      safety_limits: buildEqSafetyLimits(objectives),
    });
  }

  return steps;
}

function resolveTiltGainDb(objectives: ParsedEditObjectives): number {
  const magnitude = resolveEqGainDb(objectives, objectives.wants_darker ? "cut" : "boost");
  const scaledMagnitude = objectives.wants_darker ? magnitude * 0.75 : magnitude * 0.85;
  return Number(scaledMagnitude.toFixed(2));
}

function buildGainStep(
  objectives: ParsedEditObjectives,
  analysisReport: AnalysisReport,
): EditPlanStep | undefined {
  if (objectives.wants_more_even_level || objectives.wants_louder === objectives.wants_quieter) {
    return undefined;
  }

  if (objectives.wants_quieter) {
    const gainDb = Math.abs(resolveEqGainDb(objectives, "cut"));

    return {
      ...assertPlannerStepSupport("gain", "full_file"),
      step_id: "step_gain_1",
      operation: "gain",
      target: { scope: "full_file" },
      parameters: { gain_db: -gainDb },
      expected_effects: ["reduce output level conservatively"],
      safety_limits: buildGainSafetyLimits(),
    };
  }

  const availableHeadroomDb = Math.max(0, -1 - analysisReport.measurements.levels.true_peak_dbtp);
  const gainDb = resolveGainStepDb(objectives, availableHeadroomDb);
  if (gainDb <= 0) {
    return undefined;
  }

  return {
    ...assertPlannerStepSupport("gain", "full_file"),
    step_id: "step_gain_1",
    operation: "gain",
    target: { scope: "full_file" },
    parameters: { gain_db: gainDb },
    expected_effects: ["increase level within measured peak headroom"],
    safety_limits: buildGainSafetyLimits(),
  };
}

function buildNormalizeStep(
  objectives: ParsedEditObjectives,
  analysisReport: AnalysisReport,
): EditPlanStep | undefined {
  if (!objectives.wants_more_even_level) {
    return undefined;
  }

  const targetIntegratedLufs =
    analysisReport.measurements.levels.integrated_lufs +
    (objectives.wants_louder
      ? objectives.intensity === "subtle"
        ? 1
        : objectives.intensity === "strong"
          ? 2
          : 1.5
      : objectives.intensity === "strong"
        ? 1
        : 0.5);

  return {
    ...assertPlannerStepSupport("normalize", "full_file"),
    step_id: "step_normalize_1",
    operation: "normalize",
    target: { scope: "full_file" },
    parameters: {
      mode: "integrated_lufs",
      target_integrated_lufs: Number(targetIntegratedLufs.toFixed(1)),
      measured_integrated_lufs: Number(
        analysisReport.measurements.levels.integrated_lufs.toFixed(1),
      ),
      max_true_peak_dbtp: -1,
      measured_true_peak_dbtp: Number(analysisReport.measurements.levels.true_peak_dbtp.toFixed(1)),
    },
    expected_effects: [
      objectives.wants_louder
        ? "raise and normalize overall loudness conservatively"
        : "normalize overall loudness conservatively",
    ],
    safety_limits: buildNormalizeSafetyLimits(),
  };
}

function buildCompressorStep(objectives: ParsedEditObjectives): EditPlanStep | undefined {
  if (!objectives.wants_more_controlled_dynamics) {
    return undefined;
  }

  const ratio =
    objectives.preserve_punch && objectives.intensity !== "strong"
      ? 1.8
      : objectives.intensity === "subtle"
        ? 1.6
        : objectives.intensity === "strong"
          ? 2.5
          : 2;

  return {
    ...assertPlannerStepSupport("compressor", "full_file"),
    step_id: "step_compressor_1",
    operation: "compressor",
    target: { scope: "full_file" },
    parameters: {
      threshold_db:
        objectives.intensity === "subtle" ? -16 : objectives.intensity === "strong" ? -20 : -18,
      ratio,
      attack_ms: objectives.preserve_punch ? 25 : 12,
      release_ms: 120,
      knee_db: 3,
      makeup_gain_db: 0,
    },
    expected_effects: ["gently reduce dynamic swings for a more controlled result"],
    safety_limits: buildCompressorSafetyLimits(),
  };
}

function buildLimiterStep(
  objectives: ParsedEditObjectives,
  _analysisReport: AnalysisReport,
): EditPlanStep | undefined {
  if (!objectives.wants_peak_control) {
    return undefined;
  }

  return {
    ...assertPlannerStepSupport("limiter", "full_file"),
    step_id: "step_limiter_1",
    operation: "limiter",
    target: { scope: "full_file" },
    parameters: {
      ceiling_dbtp: -1,
      input_gain_db: 0,
      release_ms: 80,
      lookahead_ms: 5,
    },
    expected_effects: ["catch short peak excursions without broad loudness maximization"],
    safety_limits: buildLimiterSafetyLimits(),
  };
}

function buildStereoWidthStep(objectives: ParsedEditObjectives): EditPlanStep | undefined {
  if (objectives.wants_wider === objectives.wants_narrower) {
    return undefined;
  }

  const widthMultiplier = objectives.wants_wider
    ? objectives.intensity === "subtle"
      ? 1.12
      : objectives.intensity === "strong"
        ? 1.28
        : 1.18
    : objectives.intensity === "subtle"
      ? 0.9
      : objectives.intensity === "strong"
        ? 0.72
        : 0.82;

  return {
    ...assertPlannerStepSupport("stereo_width", "full_file"),
    step_id: "step_stereo_width_1",
    operation: "stereo_width",
    target: { scope: "full_file" },
    parameters: {
      width_multiplier: widthMultiplier,
    },
    expected_effects: [
      objectives.wants_wider
        ? "slightly widen the stereo image"
        : "slightly narrow the stereo image",
    ],
    safety_limits: buildStereoWidthSafetyLimits(),
  };
}

function midpoint(start: number, end: number): number {
  return Number(((start + end) / 2).toFixed(2));
}

function assertPlannerStepSupport(
  operation: RuntimeOperationName,
  scope: RuntimeTargetScope,
): Record<string, never> {
  const capability = getRuntimeOperationCapability(operation);

  if (capability.intent_support !== "planner_supported") {
    throw new Error(
      `Planner step '${operation}' is not marked as planner_supported in the runtime capability manifest.`,
    );
  }

  if (!capability.supported_target_scopes.includes(scope)) {
    throw new Error(
      `Planner step '${operation}' does not support target scope '${scope}' in the runtime capability manifest.`,
    );
  }

  return {};
}
