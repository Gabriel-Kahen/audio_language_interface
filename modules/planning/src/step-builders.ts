import {
  getRuntimeOperationCapability,
  type RuntimeOperationName,
  type RuntimeTargetScope,
} from "@audio-language-interface/capabilities";

import {
  assertValidFadeSpans,
  buildCompressorSafetyLimits,
  buildDenoiseSafetyLimits,
  buildEqSafetyLimits,
  buildFadeSafetyLimits,
  buildFilterSafetyLimits,
  buildGainSafetyLimits,
  buildLimiterSafetyLimits,
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

  const denoiseStep = buildDenoiseStep(context.objectives, context.analysisReport);
  if (denoiseStep) {
    steps.push(denoiseStep);
  }

  const filterStep = buildRumbleStep(context.objectives);
  if (filterStep) {
    steps.push(filterStep);
  }

  const eqStep = buildEqStep(context);
  if (eqStep) {
    steps.push(eqStep);
  }

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

function buildEqStep({
  objectives,
  analysisReport,
  semanticProfile,
}: StepBuildContext): EditPlanStep | undefined {
  const bands: Array<Record<string, unknown>> = [];
  const expectedEffects: string[] = [];
  const harshnessAnnotation = analysisReport.annotations?.find(
    (annotation) => annotation.kind === "harshness",
  );
  const semanticLabels = new Set(
    semanticProfile.descriptors
      .filter((descriptor) => descriptor.confidence >= 0.6)
      .map((descriptor) => descriptor.label),
  );

  if (
    objectives.wants_less_harsh &&
    (semanticLabels.has("slightly_harsh") ||
      semanticLabels.has("harsh") ||
      harshnessAnnotation !== undefined)
  ) {
    const harshBand = harshnessAnnotation?.bands_hz ?? [3000, 4500];
    bands.push({
      type: "bell",
      frequency_hz: midpoint(harshBand[0], harshBand[1]),
      gain_db: resolveEqGainDb(objectives, "cut"),
      q: 1.2,
    });
    expectedEffects.push("reduce upper-mid harshness");
  }

  if (objectives.wants_darker) {
    bands.push({
      type: "bell",
      frequency_hz: 6500,
      gain_db: resolveBrightnessCutGainDb(objectives),
      q: 0.8,
    });
    expectedEffects.push("slightly reduce perceived brightness");
  }

  if (objectives.wants_brighter) {
    bands.push({
      type: "bell",
      frequency_hz: 5000,
      gain_db: resolveEqGainDb(objectives, "boost") * 0.75,
      q: 0.8,
    });
    expectedEffects.push("slightly increase upper-band presence");
  }

  if (objectives.wants_less_muddy) {
    bands.push({
      type: "bell",
      frequency_hz: 280,
      gain_db: resolveEqGainDb(objectives, "cut") * 0.75,
      q: 1,
    });
    expectedEffects.push("reduce low-mid mud");
  }

  if (objectives.wants_more_warmth) {
    bands.push({
      type: "bell",
      frequency_hz: 180,
      gain_db: resolveEqGainDb(objectives, "boost") * 0.75,
      q: 0.9,
    });
    expectedEffects.push("slightly increase warmth");
  }

  if (bands.length === 0) {
    return undefined;
  }

  return {
    ...assertPlannerStepSupport("parametric_eq", "full_file"),
    step_id: "step_eq_1",
    operation: "parametric_eq",
    target: { scope: "full_file" },
    parameters: { bands: bands.map(roundBandValues) },
    expected_effects: expectedEffects,
    safety_limits: buildEqSafetyLimits(objectives),
  };
}

function resolveBrightnessCutGainDb(objectives: ParsedEditObjectives): number {
  const baseCut = resolveEqGainDb(objectives, "cut") * 0.75;

  if (objectives.preserve_punch) {
    return Math.min(-1, Number((baseCut * 0.9).toFixed(2)));
  }

  return baseCut;
}

function buildGainStep(
  objectives: ParsedEditObjectives,
  analysisReport: AnalysisReport,
): EditPlanStep | undefined {
  if (objectives.wants_louder === objectives.wants_quieter) {
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

function roundBandValues(band: Record<string, unknown>): Record<string, unknown> {
  return {
    ...band,
    frequency_hz:
      typeof band.frequency_hz === "number"
        ? Number(band.frequency_hz.toFixed(2))
        : band.frequency_hz,
    gain_db: typeof band.gain_db === "number" ? Number(band.gain_db.toFixed(2)) : band.gain_db,
    q: typeof band.q === "number" ? Number(band.q.toFixed(2)) : band.q,
  };
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
