import {
  getRuntimeOperationCapability,
  type RuntimeOperationName,
  type RuntimeTargetScope,
} from "@audio-language-interface/capabilities";
import { createPlanningFailure } from "./failures.js";
import {
  assertValidFadeSpans,
  buildCompressorSafetyLimits,
  buildDeclickSafetyLimits,
  buildDeclipSafetyLimits,
  buildDeEsserSafetyLimits,
  buildDehumSafetyLimits,
  buildDenoiseSafetyLimits,
  buildEqSafetyLimits,
  buildFadeSafetyLimits,
  buildFilterSafetyLimits,
  buildGainSafetyLimits,
  buildLimiterSafetyLimits,
  buildNormalizeSafetyLimits,
  buildPitchShiftSafetyLimits,
  buildStereoBalanceCorrectionSafetyLimits,
  buildStereoWidthSafetyLimits,
  buildTimeStretchSafetyLimits,
  buildTrimSafetyLimits,
  buildTrimSilenceSafetyLimits,
  resolveEqGainDb,
  resolveGainStepDb,
} from "./safety.js";
import type {
  AnalysisReport,
  AudioVersion,
  EditPlanStep,
  ParsedEditObjectives,
  RegionTarget,
  SemanticProfile,
} from "./types.js";

interface StepBuildContext {
  objectives: ParsedEditObjectives;
  audioVersion: AudioVersion;
  analysisReport: AnalysisReport;
  semanticProfile: SemanticProfile;
}

type PlannerStepPhase =
  | "source_selection"
  | "boundary_cleanup"
  | "duration_shaping"
  | "pitch_shaping"
  | "boundary_envelopes"
  | "restoration"
  | "filters"
  | "tonal_balance"
  | "dynamics"
  | "stereo_image"
  | "loudness";

const REGION_SUPPORTED_PLANNER_OPERATIONS = new Set<RuntimeOperationName>([
  "gain",
  "normalize",
  "parametric_eq",
  "high_pass_filter",
  "low_pass_filter",
  "high_shelf",
  "low_shelf",
  "notch_filter",
  "tilt_eq",
  "denoise",
  "de_esser",
  "declick",
  "dehum",
  "stereo_width",
  "stereo_balance_correction",
]);

export function buildPlannedSteps(context: StepBuildContext): EditPlanStep[] {
  const useControlledLoudnessPath = shouldUseControlledLoudnessPath(context.objectives);
  const phases = [
    {
      phase: "source_selection",
      steps: [buildTrimStep(context.objectives, context.audioVersion)],
    },
    {
      phase: "boundary_cleanup",
      steps: [buildTrimSilenceStep(context.objectives, context.analysisReport)],
    },
    {
      phase: "duration_shaping",
      steps: [buildTimeStretchStep(context.objectives)],
    },
    {
      phase: "pitch_shaping",
      steps: [buildPitchShiftStep(context.objectives)],
    },
    {
      phase: "boundary_envelopes",
      steps: [buildFadeStep(context.objectives, context.audioVersion)],
    },
    {
      phase: "restoration",
      steps: [
        buildDeclipStep(context.objectives),
        buildDeclickStep(context.objectives),
        buildDehumStep(context.objectives),
        buildDenoiseStep(context.objectives, context.analysisReport),
        buildDeEsserStep(context.objectives),
      ],
    },
    {
      phase: "filters",
      steps: [buildRumbleStep(context.objectives), buildLowPassStep(context.objectives)],
    },
    {
      phase: "tonal_balance",
      steps: buildTonalSteps(context),
    },
    {
      phase: "dynamics",
      steps: useControlledLoudnessPath
        ? buildControlledLoudnessSteps(context.objectives, context.analysisReport)
        : [
            buildCompressorStep(context.objectives),
            buildLimiterStep(context.objectives, context.analysisReport),
          ],
    },
    {
      phase: "stereo_image",
      steps: useControlledLoudnessPath
        ? []
        : [
            buildStereoBalanceCorrectionStep(context.objectives, context.analysisReport),
            buildStereoWidthStep(context.objectives),
          ],
    },
    {
      phase: "loudness",
      steps: useControlledLoudnessPath
        ? []
        : [
            buildNormalizeStep(context.objectives, context.analysisReport),
            buildGainStep(context.objectives, context.analysisReport),
          ],
    },
  ] satisfies Array<{ phase: PlannerStepPhase; steps: Array<EditPlanStep | undefined> }>;

  const plannedSteps: EditPlanStep[] = [];

  for (const { steps } of phases) {
    for (const step of steps) {
      if (step !== undefined) {
        plannedSteps.push(applyRegionTargetIfNeeded(step, context.objectives.region_target));
      }
    }
  }

  return plannedSteps;
}

function shouldUseControlledLoudnessPath(objectives: ParsedEditObjectives): boolean {
  return (
    objectives.wants_louder &&
    objectives.wants_more_controlled_dynamics &&
    !objectives.wants_more_even_level &&
    !objectives.wants_peak_control &&
    !objectives.wants_quieter
  );
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

function buildTrimSilenceStep(
  objectives: ParsedEditObjectives,
  analysisReport: AnalysisReport,
): EditPlanStep | undefined {
  if (!objectives.wants_trim_silence) {
    return undefined;
  }

  const thresholdDbfs = Number(
    Math.max(
      -70,
      Math.min(-30, analysisReport.measurements.artifacts.noise_floor_dbfs + 10),
    ).toFixed(1),
  );

  return {
    ...assertPlannerStepSupport("trim_silence", "full_file"),
    step_id: "step_trim_silence_1",
    operation: "trim_silence",
    target: { scope: "full_file" },
    parameters: {
      threshold_dbfs: thresholdDbfs,
      trim_leading: objectives.trim_leading_silence,
      trim_trailing: objectives.trim_trailing_silence,
      window_seconds: 0.02,
    },
    expected_effects: [
      objectives.trim_leading_silence && objectives.trim_trailing_silence
        ? "remove silence from both file boundaries"
        : objectives.trim_leading_silence
          ? "remove silence from the start of the file"
          : "remove silence from the end of the file",
    ],
    safety_limits: buildTrimSilenceSafetyLimits(),
  };
}

function buildTimeStretchStep(objectives: ParsedEditObjectives): EditPlanStep | undefined {
  if (!objectives.wants_speed_up && !objectives.wants_slow_down) {
    return undefined;
  }

  const stretchRatio =
    objectives.stretch_ratio ??
    (objectives.wants_speed_up
      ? objectives.intensity === "subtle"
        ? 0.92
        : objectives.intensity === "strong"
          ? 0.75
          : 0.85
      : objectives.intensity === "subtle"
        ? 1.08
        : objectives.intensity === "strong"
          ? 1.25
          : 1.15);

  return {
    ...assertPlannerStepSupport("time_stretch", "full_file"),
    step_id: "step_time_stretch_1",
    operation: "time_stretch",
    target: { scope: "full_file" },
    parameters: {
      stretch_ratio: Number(stretchRatio.toFixed(6)),
    },
    expected_effects: [
      objectives.wants_speed_up
        ? "shorten the clip duration while preserving pitch"
        : "lengthen the clip duration while preserving pitch",
    ],
    safety_limits: buildTimeStretchSafetyLimits(),
  };
}

function buildPitchShiftStep(objectives: ParsedEditObjectives): EditPlanStep | undefined {
  if (!objectives.wants_pitch_shift || objectives.pitch_shift_semitones === undefined) {
    return undefined;
  }

  return {
    ...assertPlannerStepSupport("pitch_shift", "full_file"),
    step_id: "step_pitch_shift_1",
    operation: "pitch_shift",
    target: { scope: "full_file" },
    parameters: {
      semitones: objectives.pitch_shift_semitones,
    },
    expected_effects: [
      `${objectives.pitch_shift_semitones > 0 ? "raise" : "lower"} pitch by ${Math.abs(
        objectives.pitch_shift_semitones,
      )} semitones while keeping duration close to the original`,
    ],
    safety_limits: buildPitchShiftSafetyLimits(),
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
    parameters: { frequency_hz: 100 },
    expected_effects: ["reduce low-frequency rumble below 100 Hz"],
    safety_limits: buildFilterSafetyLimits(),
  };
}

function buildLowPassStep(objectives: ParsedEditObjectives): EditPlanStep | undefined {
  if (!objectives.wants_low_pass_filter) {
    return undefined;
  }

  return {
    ...assertPlannerStepSupport("low_pass_filter", "full_file"),
    step_id: "step_low_pass_1",
    operation: "low_pass_filter",
    target: { scope: "full_file" },
    parameters: { frequency_hz: 6500 },
    expected_effects: ["roll off high-frequency content above 6500 Hz"],
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

function buildDeclipStep(objectives: ParsedEditObjectives): EditPlanStep | undefined {
  if (!objectives.wants_declip) {
    return undefined;
  }

  return {
    ...assertPlannerStepSupport("declip", "full_file"),
    step_id: "step_declip_1",
    operation: "declip",
    target: { scope: "full_file" },
    parameters: {
      window_ms:
        objectives.intensity === "subtle" ? 45 : objectives.intensity === "strong" ? 65 : 55,
      overlap_percent: 75,
      ar_order: objectives.intensity === "strong" ? 10 : 8,
      threshold:
        objectives.intensity === "subtle" ? 12 : objectives.intensity === "strong" ? 7 : 10,
      histogram_size: 1000,
      method: "add",
    },
    expected_effects: [
      "reconstruct clipped peaks and reduce hard-clipping artifacts conservatively",
    ],
    safety_limits: buildDeclipSafetyLimits(),
  };
}

function buildDehumStep(objectives: ParsedEditObjectives): EditPlanStep | undefined {
  if (!objectives.wants_remove_hum) {
    return undefined;
  }

  if (objectives.hum_frequency_hz === undefined) {
    throw new Error(
      "Planner dehum support requires an explicit 50 Hz or 60 Hz hum frequency in the request.",
    );
  }

  return {
    ...assertPlannerStepSupport("dehum", "full_file"),
    step_id: "step_dehum_1",
    operation: "dehum",
    target: { scope: "full_file" },
    parameters: {
      fundamental_hz: objectives.hum_frequency_hz,
      harmonics: 4,
      q: objectives.intensity === "strong" ? 20 : 18,
      mix: objectives.intensity === "subtle" ? 0.85 : 1,
    },
    expected_effects: [
      `reduce narrowband hum centered around ${objectives.hum_frequency_hz.toFixed(0)} Hz and its harmonics`,
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
        q: objectives.intensity === "subtle" ? 6 : objectives.intensity === "strong" ? 4.5 : 5.5,
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
      ...assertPlannerStepSupport("parametric_eq", "full_file"),
      step_id: "step_parametric_eq_1",
      operation: "parametric_eq",
      target: { scope: "full_file" },
      parameters: {
        bands: [
          {
            type: "bell",
            frequency_hz: 360,
            gain_db: Number((resolveEqGainDb(objectives, "cut") * 1.25).toFixed(2)),
            q: 0.9,
          },
        ],
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
  if (
    objectives.wants_more_even_level ||
    objectives.controlled_loudness_limiter_gain_db !== undefined ||
    objectives.wants_louder === objectives.wants_quieter
  ) {
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

function buildControlledLoudnessSteps(
  objectives: ParsedEditObjectives,
  analysisReport: AnalysisReport,
): EditPlanStep[] {
  const loudnessLiftLufs = resolveControlledLoudnessLiftLufs(objectives);
  const targetIntegratedLufs =
    analysisReport.measurements.levels.integrated_lufs + loudnessLiftLufs;
  const maxTruePeakDbtp =
    objectives.intensity === "subtle" ? -1.6 : objectives.intensity === "strong" ? -1.2 : -1.4;
  const compressorParameters =
    objectives.intensity === "subtle"
      ? {
          threshold_db: -17,
          ratio: 1.45,
          attack_ms: 32,
          release_ms: 125,
          knee_db: 4,
          makeup_gain_db: 0,
        }
      : objectives.intensity === "strong"
        ? {
            threshold_db: -21,
            ratio: 1.85,
            attack_ms: 20,
            release_ms: 145,
            knee_db: 5,
            makeup_gain_db: 0,
          }
        : {
            threshold_db: -19,
            ratio: 1.6,
            attack_ms: 28,
            release_ms: 135,
            knee_db: 4,
            makeup_gain_db: 0,
          };

  return [
    {
      ...assertPlannerStepSupport("compressor", "full_file"),
      step_id: "step_compressor_1",
      operation: "compressor",
      target: { scope: "full_file" },
      parameters: compressorParameters,
      expected_effects: ["gently tighten dynamic swings before conservative loudness staging"],
      safety_limits: buildCompressorSafetyLimits(),
    },
    {
      ...assertPlannerStepSupport("normalize", "full_file"),
      step_id: "step_normalize_1",
      operation: "normalize",
      target: { scope: "full_file" },
      parameters: {
        mode: "integrated_lufs",
        target_integrated_lufs: Number(targetIntegratedLufs.toFixed(1)),
        max_true_peak_dbtp: maxTruePeakDbtp,
      },
      expected_effects: ["raise loudness conservatively while keeping peak behavior controlled"],
      safety_limits: buildNormalizeSafetyLimits(),
    },
  ];
}

function resolveControlledLoudnessLiftLufs(objectives: ParsedEditObjectives): number {
  if (objectives.intensity === "subtle") {
    return 0.8;
  }

  if (objectives.intensity === "strong") {
    return 1.5;
  }

  return 1.1;
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
  if (
    !objectives.wants_peak_control &&
    objectives.controlled_loudness_limiter_gain_db === undefined
  ) {
    return undefined;
  }

  const inputGainDb = objectives.controlled_loudness_limiter_gain_db ?? 0;

  return {
    ...assertPlannerStepSupport("limiter", "full_file"),
    step_id: "step_limiter_1",
    operation: "limiter",
    target: { scope: "full_file" },
    parameters: {
      ceiling_dbtp: -1,
      input_gain_db: inputGainDb,
      release_ms: 80,
      lookahead_ms: 5,
    },
    expected_effects: [
      inputGainDb > 0
        ? "raise level into an explicit peak ceiling without adding compression"
        : "catch short peak excursions without broad loudness maximization",
    ],
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
        ? 1.36
        : 1.24
    : objectives.intensity === "subtle"
      ? 0.9
      : objectives.intensity === "strong"
        ? 0.68
        : 0.78;

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

function buildStereoBalanceCorrectionStep(
  objectives: ParsedEditObjectives,
  analysisReport: AnalysisReport,
): EditPlanStep | undefined {
  if (!objectives.wants_more_centered) {
    return undefined;
  }

  const balanceDb = analysisReport.measurements.stereo.balance_db ?? 0;
  const absoluteBalanceDb = Math.abs(balanceDb);
  const correctionScale =
    objectives.intensity === "subtle" ? 0.65 : objectives.intensity === "strong" ? 1 : 0.85;
  const correctionDb = Number(
    Math.min(6, Math.max(0.5, absoluteBalanceDb * correctionScale)).toFixed(2),
  );

  return {
    ...assertPlannerStepSupport("stereo_balance_correction", "full_file"),
    step_id: "step_stereo_balance_correction_1",
    operation: "stereo_balance_correction",
    target: { scope: "full_file" },
    parameters: {
      target_channel: balanceDb >= 0 ? "left" : "right",
      correction_db: correctionDb,
    },
    expected_effects: [
      `attenuate the ${balanceDb >= 0 ? "left" : "right"} channel to pull the stereo image closer to center`,
    ],
    safety_limits: buildStereoBalanceCorrectionSafetyLimits(),
  };
}

function midpoint(start: number, end: number): number {
  return Number(((start + end) / 2).toFixed(2));
}

function applyRegionTargetIfNeeded(
  step: EditPlanStep,
  regionTarget: RegionTarget | undefined,
): EditPlanStep {
  if (regionTarget === undefined) {
    return step;
  }

  if (!REGION_SUPPORTED_PLANNER_OPERATIONS.has(step.operation)) {
    throw createPlanningFailure(
      "supported_but_underspecified",
      `The request asks for a region-scoped edit, but \`${step.operation}\` is not in the baseline planner's explicit time-range cohort yet.`,
    );
  }

  assertPlannerStepSupport(step.operation, "time_range");

  return {
    ...step,
    target: {
      scope: "time_range",
      start_seconds: regionTarget.start_seconds,
      end_seconds: regionTarget.end_seconds,
    },
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
