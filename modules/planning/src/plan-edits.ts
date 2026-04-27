import { createHash } from "node:crypto";

import {
  assertValidAnalysisReport,
  estimatePitchCenter,
  type PitchCenterEstimate,
} from "@audio-language-interface/analysis";
import {
  defaultRuntimeCapabilityManifest,
  plannerSupportedRuntimeOperations,
} from "@audio-language-interface/capabilities";
import { assertValidAudioVersion } from "@audio-language-interface/core";
import { assertValidSemanticProfile } from "@audio-language-interface/semantics";

import { createPlanningFailure } from "./failures.js";
import { parseUserRequest } from "./parse-request.js";
import { buildPlannedSteps } from "./step-builders.js";
import type { EditPlan, PlanEditsOptions, RegionTarget } from "./types.js";
import { CONTRACT_SCHEMA_VERSION } from "./types.js";
import { assertValidEditPlan } from "./utils/schema.js";
import { buildVerificationTargets } from "./verification-targets.js";

/**
 * Builds a deterministic baseline edit plan from natural-language intent and
 * current analysis and semantic evidence.
 */
export function planEdits(options: PlanEditsOptions): EditPlan {
  assertValidAudioVersion(options.audioVersion);
  assertValidAnalysisReport(options.analysisReport);
  assertValidSemanticProfile(options.semanticProfile);

  if (options.analysisReport.asset_id !== options.audioVersion.asset_id) {
    throw new Error("AnalysisReport asset_id must match the provided AudioVersion asset_id.");
  }

  if (options.analysisReport.version_id !== options.audioVersion.version_id) {
    throw new Error("AnalysisReport version_id must match the provided AudioVersion version_id.");
  }

  if (options.semanticProfile.analysis_report_id !== options.analysisReport.report_id) {
    throw new Error(
      "SemanticProfile analysis_report_id must match the provided AnalysisReport report_id.",
    );
  }

  if (options.semanticProfile.asset_id !== options.analysisReport.asset_id) {
    throw new Error("SemanticProfile asset_id must match the provided AnalysisReport asset_id.");
  }

  if (options.semanticProfile.version_id !== options.analysisReport.version_id) {
    throw new Error(
      "SemanticProfile version_id must match the provided AnalysisReport version_id.",
    );
  }

  const planningRequest = options.intentInterpretation?.normalizedRequest ?? options.userRequest;
  const objectives = resolvePlannerObjectives(
    parseUserRequest(planningRequest),
    options.audioVersion,
    options.analysisReport,
    options.semanticProfile,
    options.intentInterpretation,
  );
  const steps = buildPlannedSteps({
    objectives,
    audioVersion: options.audioVersion,
    analysisReport: options.analysisReport,
    semanticProfile: options.semanticProfile,
  });

  if (steps.length === 0) {
    throw createPlanningFailure(
      "supported_but_underspecified",
      "The baseline planner could not derive an executable plan from the request without guessing unsupported behavior.",
    );
  }

  const goals = buildGoals(objectives);
  const verificationTargets = buildVerificationTargets(
    objectives,
    options.analysisReport,
    options.semanticProfile,
    resolvePitchEstimate(options, objectives),
    options.audioVersion,
  );
  const constraints = buildConstraints(
    objectives,
    options.constraints,
    options.intentInterpretation,
  );
  const plan: EditPlan = {
    schema_version: CONTRACT_SCHEMA_VERSION,
    plan_id: createPlanId(options, objectives.normalized_request),
    capability_manifest_id: defaultRuntimeCapabilityManifest.manifest_id,
    asset_id: options.audioVersion.asset_id,
    version_id: options.audioVersion.version_id,
    user_request: options.userRequest,
    goals,
    steps,
    created_at: options.generatedAt ?? options.semanticProfile.generated_at,
    rationale: buildRationale(goals, steps.length),
  };

  if (options.intentInterpretation?.normalizedRequest !== undefined) {
    if (options.intentInterpretation.normalizedRequest !== options.userRequest) {
      plan.interpreted_user_request = options.intentInterpretation.normalizedRequest;
    }

    if (options.intentInterpretation.interpretationId !== undefined) {
      plan.intent_interpretation_id = options.intentInterpretation.interpretationId;
    }
  }

  if (constraints.length > 0) {
    plan.constraints = constraints;
  }

  if (verificationTargets.length > 0) {
    plan.verification_targets = verificationTargets;
  }

  assertValidEditPlan(plan);
  return plan;
}

function resolvePlannerObjectives(
  objectives: ReturnType<typeof parseUserRequest>,
  audioVersion: PlanEditsOptions["audioVersion"],
  analysisReport: PlanEditsOptions["analysisReport"],
  semanticProfile: PlanEditsOptions["semanticProfile"],
  intentInterpretation?: PlanEditsOptions["intentInterpretation"],
): ReturnType<typeof parseUserRequest> {
  if (intentInterpretation?.requestClassification) {
    if (
      intentInterpretation.requestClassification !== "supported" ||
      intentInterpretation.nextAction === "clarify" ||
      intentInterpretation.nextAction === "refuse"
    ) {
      const failureClass =
        intentInterpretation.requestClassification === "supported" &&
        intentInterpretation.nextAction === "clarify"
          ? "supported_but_underspecified"
          : intentInterpretation.requestClassification === "supported" &&
              intentInterpretation.nextAction === "refuse"
            ? "unsupported"
            : (intentInterpretation.requestClassification as
                | "supported_but_underspecified"
                | "unsupported"
                | "supported_runtime_only_but_not_planner_enabled");

      throw createPlanningFailure(
        failureClass,
        buildInterpretationFailureMessage(intentInterpretation),
        {
          ...(intentInterpretation.unsupportedPhrases === undefined
            ? {}
            : { matched_requests: intentInterpretation.unsupportedPhrases }),
          ...(intentInterpretation.requestClassification ===
          "supported_runtime_only_but_not_planner_enabled"
            ? { capability_manifest_id: defaultRuntimeCapabilityManifest.manifest_id }
            : {}),
        },
      );
    }
  }

  if (hasVagueRegionRequest(objectives.supported_but_underspecified_requests)) {
    throw createPlanningFailure(
      "supported_but_underspecified",
      "The request uses vague region wording. Please restate the edit with an explicit time range such as `the first 0.5 seconds`, `the last 0.5 seconds`, or `from 0.2s to 0.7s`.",
      {
        matched_requests: objectives.supported_but_underspecified_requests,
      },
    );
  }

  if (objectives.wants_speed_up && objectives.wants_slow_down) {
    throw createPlanningFailure(
      "supported_but_underspecified",
      "The request asks for both faster and slower timing moves. Please choose one direction.",
    );
  }

  if (
    objectives.wants_pitch_shift &&
    objectives.pitch_shift_semitones !== undefined &&
    objectives.pitch_shift_semitones === 0
  ) {
    throw createPlanningFailure(
      "supported_but_underspecified",
      "The request asks for a zero-semitone pitch shift, which would not materially change the audio.",
    );
  }

  if (objectives.supported_but_underspecified_requests.length > 0) {
    throw createPlanningFailure(
      "supported_but_underspecified",
      `The request includes underspecified phrasing ${formatQuotedList(objectives.supported_but_underspecified_requests)}. Please clarify with a supported direction such as darker, less harsh, more controlled dynamics, or peak limiting.`,
      {
        matched_requests: objectives.supported_but_underspecified_requests,
      },
    );
  }

  if (objectives.unsupported_requests.length > 0) {
    throw createPlanningFailure(
      "unsupported",
      `The baseline planner does not support ${formatQuotedList(objectives.unsupported_requests)}. Planner-supported runtime operations in manifest ${defaultRuntimeCapabilityManifest.manifest_id} are ${formatQuotedList(plannerSupportedRuntimeOperations)}.`,
      {
        matched_requests: objectives.unsupported_requests,
      },
    );
  }

  if (objectives.supported_runtime_only_but_not_planner_enabled_requests.length > 0) {
    throw createPlanningFailure(
      "supported_runtime_only_but_not_planner_enabled",
      `The request asks for ${formatQuotedList(objectives.supported_runtime_only_but_not_planner_enabled_requests)}, which is available in runtime manifest ${defaultRuntimeCapabilityManifest.manifest_id} but not planner-enabled in the baseline planner.`,
      {
        matched_requests: objectives.supported_runtime_only_but_not_planner_enabled_requests,
        runtime_only_operations: objectives.runtime_only_operations_requested,
      },
    );
  }

  if (objectives.wants_darker && objectives.wants_brighter) {
    throw createPlanningFailure(
      "supported_but_underspecified",
      "The request asks for both darker and brighter tonal moves. Please choose one tonal direction.",
    );
  }

  if (objectives.wants_louder && objectives.wants_quieter) {
    throw createPlanningFailure(
      "supported_but_underspecified",
      "The request asks for both louder and quieter level changes. Please choose one level direction.",
    );
  }

  if (objectives.wants_more_even_level && objectives.wants_quieter) {
    throw createPlanningFailure(
      "supported_but_underspecified",
      "The request asks for both quieter output and loudness normalization. Please choose whether the priority is lower level or explicit normalization.",
    );
  }

  if (objectives.wants_tame_sibilance && (objectives.wants_brighter || objectives.wants_more_air)) {
    throw createPlanningFailure(
      "supported_but_underspecified",
      "The request combines upper-band brightening with sibilance reduction. The baseline planner does not yet sequence added air or brightness against de-essing safely in one pass, so please prioritize either brighter air or less sibilance.",
    );
  }

  if (objectives.wants_denoise && (objectives.wants_brighter || objectives.wants_more_air)) {
    throw createPlanningFailure(
      "supported_but_underspecified",
      "The request combines broadband denoise with upper-band brightening. The baseline planner refuses that combination because post-denoise brightening can exaggerate cleanup artifacts in one conservative pass.",
    );
  }

  if (objectives.wants_remove_hum && objectives.wants_more_warmth) {
    throw createPlanningFailure(
      "supported_but_underspecified",
      "The request combines hum removal with added warmth. The baseline planner does not yet combine narrow low-frequency cleanup with low-shelf boosting safely in one pass, so please prioritize either hum removal or warmth first.",
    );
  }

  if (objectives.trim_range && objectives.wants_trim_silence) {
    throw createPlanningFailure(
      "supported_but_underspecified",
      "The request combines explicit time-range trimming with automatic silence trimming. Please choose either explicit trim points or silence trimming so the planner does not guess which boundaries should move first.",
    );
  }

  if (
    objectives.wants_louder &&
    objectives.wants_peak_control &&
    !objectives.wants_more_even_level
  ) {
    throw createPlanningFailure(
      "supported_but_underspecified",
      "The request combines louder output with peak control but does not ask for explicit normalization. The baseline planner refuses that combination instead of applying post-limiter gain that could undermine the peak-control move.",
    );
  }

  if (objectives.wants_remove_hum && objectives.hum_frequency_hz === undefined) {
    throw createPlanningFailure(
      "supported_but_underspecified",
      "The baseline planner only supports dehum when the request specifies a 50 Hz or 60 Hz mains frequency explicitly.",
    );
  }

  if (objectives.wants_wider && objectives.wants_narrower) {
    throw createPlanningFailure(
      "supported_but_underspecified",
      "The request asks for both wider and narrower stereo moves. Please choose one stereo direction.",
    );
  }

  if (objectives.wants_more_warmth && objectives.wants_less_muddy) {
    throw createPlanningFailure(
      "supported_but_underspecified",
      "The request asks for both more warmth and less muddiness. The baseline planner does not yet combine those opposing low-band shelf directions safely in one pass.",
    );
  }

  const effectiveObjectives = { ...objectives };
  applyInterpretationObjectiveHints(effectiveObjectives, intentInterpretation);
  const regionTarget = resolveRegionTarget(effectiveObjectives, audioVersion, intentInterpretation);
  if (regionTarget !== undefined) {
    effectiveObjectives.region_target = regionTarget;
  }
  const semanticLabels = new Set(
    semanticProfile.descriptors
      .filter((descriptor) => descriptor.confidence >= 0.6)
      .map((descriptor) => descriptor.label),
  );
  const hasHarshnessEvidence =
    analysisReport.annotations?.some((annotation) => annotation.kind === "harshness") === true ||
    semanticLabels.has("harsh") ||
    semanticLabels.has("slightly_harsh");
  const hasMudEvidence = semanticLabels.has("muddy") || semanticLabels.has("slightly_muddy");

  if (objectives.wants_pitch_shift && analysisReport.source_character?.pitched !== true) {
    throw createPlanningFailure(
      "supported_but_underspecified",
      "The baseline planner only enables conservative pitch shifting when the current source reads as pitched material.",
    );
  }

  if (objectives.wants_denoise) {
    const strongestNoiseSeverity = Math.max(
      0,
      ...(analysisReport.annotations
        ?.filter((annotation) => annotation.kind === "noise")
        .map((annotation) => annotation.severity) ?? []),
    );
    const hasNoiseEvidence =
      semanticLabels.has("noisy") ||
      (strongestNoiseSeverity >= 0.45 &&
        analysisReport.measurements.artifacts.noise_floor_dbfs >= -56);

    if (!hasNoiseEvidence) {
      throw createPlanningFailure(
        "supported_but_underspecified",
        "The request asks for noise reduction, but the baseline planner only supports conservative denoise when analysis indicates steady noise. Please use a more specific supported direction or inspect the noise evidence first.",
      );
    }
  }

  if (objectives.wants_wider || objectives.wants_narrower) {
    const stereo = analysisReport.measurements.stereo;
    const strongestStereoAmbiguitySeverity = Math.max(
      0,
      ...(analysisReport.annotations
        ?.filter((annotation) => annotation.kind === "stereo_ambiguity")
        .map((annotation) => annotation.severity) ?? []),
    );

    if (audioVersion.audio.channels < 2) {
      throw createPlanningFailure(
        "supported_but_underspecified",
        "The baseline planner only supports stereo-width changes for audio that already has at least two channels.",
      );
    }

    if (
      Math.abs(stereo.balance_db) >= 4.5 ||
      stereo.correlation < 0.1 ||
      strongestStereoAmbiguitySeverity >= 0.3
    ) {
      throw createPlanningFailure(
        "supported_but_underspecified",
        "The current stereo image is too imbalanced or ambiguous for a conservative stereo-width edit.",
      );
    }

    if (objectives.wants_wider && (semanticLabels.has("wide") || stereo.width >= 0.35)) {
      throw createPlanningFailure(
        "supported_but_underspecified",
        "The request asks for more width, but the current audio already reads as materially wide. The baseline planner will not widen it further without clearer constraints.",
      );
    }

    if (objectives.wants_wider && stereo.width <= 0.05) {
      throw createPlanningFailure(
        "supported_but_underspecified",
        "The current audio reads effectively mono, so the baseline planner will not invent stereo width from near-mono material.",
      );
    }

    if (objectives.wants_narrower && stereo.width <= 0.12) {
      throw createPlanningFailure(
        "supported_but_underspecified",
        "The current audio is already narrow, so the baseline planner will not collapse it further without a clearer technical target.",
      );
    }

    if (objectives.wants_narrower && objectives.wants_more_centered && stereo.width < 0.22) {
      throw createPlanningFailure(
        "supported_but_underspecified",
        "The request combines narrowing with stereo recentering on a source that is not wide enough for both moves conservatively. Please prioritize either centering or narrowing first.",
      );
    }
  }

  if (objectives.wants_more_centered) {
    const stereo = analysisReport.measurements.stereo;
    const absoluteBalanceDb = Math.abs(stereo.balance_db ?? 0);

    if (audioVersion.audio.channels < 2) {
      throw createPlanningFailure(
        "supported_but_underspecified",
        "The baseline planner only supports stereo-balance correction for audio that already has at least two channels.",
      );
    }

    if (absoluteBalanceDb < 1.25) {
      throw createPlanningFailure(
        "supported_but_underspecified",
        "The current stereo image already reads close to center, so the baseline planner will not apply a balance-correction step without clearer imbalance evidence.",
      );
    }

    if (absoluteBalanceDb > 7) {
      throw createPlanningFailure(
        "supported_but_underspecified",
        "The current stereo imbalance is too extreme for the baseline planner to correct conservatively in one pass.",
      );
    }
  }

  if (!objectives.wants_cleaner) {
    return effectiveObjectives;
  }

  function resolveRegionTarget(
    objectives: ReturnType<typeof parseUserRequest>,
    audioVersion: PlanEditsOptions["audioVersion"],
    interpretation?: PlanEditsOptions["intentInterpretation"],
  ): RegionTarget | undefined {
    const interpretedRegionIntents = interpretation?.regionIntents ?? [];
    const timeRangeIntents = interpretedRegionIntents.filter((item) => item.scope === "time_range");

    if (interpretedRegionIntents.some((item) => item.scope === "segment_reference")) {
      throw createPlanningFailure(
        "supported_but_underspecified",
        "The request points at a named segment like `intro` or `ending`, but the baseline planner only grounds explicit numeric time ranges today.",
      );
    }

    if (timeRangeIntents.length > 1) {
      throw createPlanningFailure(
        "supported_but_underspecified",
        "The interpretation proposes multiple time ranges, but the baseline planner only supports one explicit region per request today.",
      );
    }

    if (timeRangeIntents.length === 1) {
      const interpretedRange = timeRangeIntents[0];
      if (
        interpretedRange?.start_seconds === undefined ||
        interpretedRange.end_seconds === undefined
      ) {
        throw createPlanningFailure(
          "supported_but_underspecified",
          "The interpreted region is missing explicit start or end seconds.",
        );
      }

      return validateRegionTarget(
        {
          scope: "time_range",
          start_seconds: interpretedRange.start_seconds,
          end_seconds: interpretedRange.end_seconds,
        },
        audioVersion.audio.duration_seconds,
      );
    }

    const hint = objectives.region_target_hint;
    if (hint === undefined) {
      return undefined;
    }

    switch (hint.kind) {
      case "absolute_range":
        return validateRegionTarget(
          {
            scope: "time_range",
            start_seconds: hint.start_seconds,
            end_seconds: hint.end_seconds,
          },
          audioVersion.audio.duration_seconds,
        );
      case "leading_window":
        return validateRegionTarget(
          {
            scope: "time_range",
            start_seconds: 0,
            end_seconds: hint.duration_seconds,
          },
          audioVersion.audio.duration_seconds,
        );
      case "trailing_window":
        return validateRegionTarget(
          {
            scope: "time_range",
            start_seconds: Number(
              Math.max(0, audioVersion.audio.duration_seconds - hint.duration_seconds).toFixed(6),
            ),
            end_seconds: audioVersion.audio.duration_seconds,
          },
          audioVersion.audio.duration_seconds,
        );
    }
  }

  function validateRegionTarget(regionTarget: RegionTarget, durationSeconds: number): RegionTarget {
    if (regionTarget.end_seconds <= regionTarget.start_seconds) {
      throw createPlanningFailure(
        "supported_but_underspecified",
        "The requested edit region must end after it starts.",
      );
    }

    if (regionTarget.start_seconds < 0 || regionTarget.end_seconds > durationSeconds) {
      throw createPlanningFailure(
        "supported_but_underspecified",
        "The requested edit region must stay inside the current audio duration.",
      );
    }

    return {
      scope: "time_range",
      start_seconds: Number(regionTarget.start_seconds.toFixed(6)),
      end_seconds: Number(regionTarget.end_seconds.toFixed(6)),
    };
  }

  if (
    effectiveObjectives.wants_remove_clicks ||
    effectiveObjectives.wants_remove_hum ||
    effectiveObjectives.wants_tame_sibilance ||
    effectiveObjectives.wants_denoise
  ) {
    return effectiveObjectives;
  }

  if (hasHarshnessEvidence) {
    effectiveObjectives.wants_less_harsh = true;
  }

  if (hasMudEvidence) {
    effectiveObjectives.wants_less_muddy = true;
  }

  if (effectiveObjectives.wants_less_harsh || effectiveObjectives.wants_less_muddy) {
    return effectiveObjectives;
  }

  if (effectiveObjectives.wants_denoise) {
    return effectiveObjectives;
  }

  throw createPlanningFailure(
    "supported_but_underspecified",
    "The request asks to clean up the audio, but the baseline planner only supports conservative tonal cleanup when analysis or semantics point to harshness or muddiness, or conservative denoise when analysis indicates steady noise. Please ask for a supported direction such as less harsh, darker, less muddy, rumble removal, or explicit noise reduction.",
  );
}

function buildInterpretationFailureMessage(
  interpretation: NonNullable<PlanEditsOptions["intentInterpretation"]>,
): string {
  if (
    interpretation.nextAction === "clarify" &&
    interpretation.requestClassification === "supported"
  ) {
    const clarification = interpretation.clarificationQuestion
      ? ` ${interpretation.clarificationQuestion}`
      : "";
    return `The interpreted request still needs clarification before deterministic planning.${clarification}`.trim();
  }

  if (
    interpretation.nextAction === "refuse" &&
    interpretation.requestClassification === "supported"
  ) {
    const unsupported = interpretation.unsupportedPhrases?.length
      ? ` Unsupported phrases: ${interpretation.unsupportedPhrases.join(", ")}.`
      : "";
    return `The interpreted request should be refused rather than planned conservatively.${unsupported}`.trim();
  }

  if (interpretation.requestClassification === "supported_but_underspecified") {
    const ambiguities = interpretation.ambiguities?.length
      ? ` Ambiguities: ${interpretation.ambiguities.join("; ")}.`
      : "";
    const clarification = interpretation.clarificationQuestion
      ? ` ${interpretation.clarificationQuestion}`
      : "";
    return `The interpreted request still needs clarification before deterministic planning.${ambiguities}${clarification}`.trim();
  }

  if (interpretation.requestClassification === "supported_runtime_only_but_not_planner_enabled") {
    const unsupported = interpretation.unsupportedPhrases?.length
      ? ` Runtime-only phrases: ${interpretation.unsupportedPhrases.join(", ")}.`
      : "";
    return `The interpreted request maps to runtime-only behavior that the baseline planner does not currently choose automatically.${unsupported}`.trim();
  }

  const unsupported = interpretation.unsupportedPhrases?.length
    ? ` Unsupported phrases: ${interpretation.unsupportedPhrases.join(", ")}.`
    : "";
  return `The interpreted request still falls outside the current supported planner surface.${unsupported}`.trim();
}

function applyInterpretationObjectiveHints(
  objectives: ReturnType<typeof parseUserRequest>,
  interpretation?: PlanEditsOptions["intentInterpretation"],
): void {
  if (!interpretation) {
    return;
  }

  for (const objective of interpretation.normalizedObjectives ?? []) {
    const parsedObjective = parseUserRequest(objective);

    if (parsedObjective.wants_pitch_shift) {
      objectives.wants_pitch_shift = true;
      if (parsedObjective.pitch_shift_semitones !== undefined) {
        objectives.pitch_shift_semitones = parsedObjective.pitch_shift_semitones;
      }
    }
  }

  for (const constraint of interpretation.constraints ?? []) {
    if (constraint.kind === "intensity") {
      if (
        constraint.value === "subtle" ||
        constraint.value === "default" ||
        constraint.value === "strong"
      ) {
        objectives.intensity = constraint.value;
      }
    }

    if (
      constraint.kind === "preserve" &&
      (constraint.label === "preserve_punch" || constraint.label === "preserve punch")
    ) {
      objectives.preserve_punch = true;
    }
  }
}

function hasVagueRegionRequest(requests: string[]): boolean {
  return requests.some((request) =>
    [
      "intro",
      "outro",
      "beginning",
      "at the start",
      "at the end",
      "ending word",
      "middle section",
      "middle part",
    ].includes(request),
  );
}

function createPlanId(options: PlanEditsOptions, normalizedRequest: string): string {
  const digest = createHash("sha256")
    .update(options.audioVersion.version_id)
    .update("|")
    .update(options.analysisReport.report_id)
    .update("|")
    .update(options.semanticProfile.profile_id)
    .update("|")
    .update(normalizedRequest)
    .digest("hex")
    .slice(0, 24)
    .toUpperCase();

  return `plan_${digest}`;
}

function buildGoals(objectives: ReturnType<typeof parseUserRequest>): string[] {
  const goals: string[] = [];

  if (objectives.wants_trim_silence) {
    goals.push("trim leading and trailing boundary silence conservatively");
  }
  if (objectives.trim_range) {
    goals.push("trim the file to the explicitly requested time range");
  }
  if (objectives.fade_in_seconds !== undefined || objectives.fade_out_seconds !== undefined) {
    goals.push("smooth file boundaries with explicit fades");
  }
  if (objectives.wants_less_harsh) {
    goals.push("reduce upper-mid harshness");
  }
  if (objectives.wants_darker) {
    goals.push("tilt the overall balance slightly darker");
  }
  if (objectives.wants_brighter) {
    goals.push("tilt the overall balance slightly brighter");
  }
  if (objectives.wants_more_air) {
    goals.push("add a little upper-band air");
  }
  if (objectives.wants_less_muddy) {
    goals.push("trim excess low-mid weight");
  }
  if (objectives.wants_more_warmth) {
    goals.push("add a little low-band warmth");
  }
  if (objectives.wants_remove_rumble) {
    goals.push("reduce sub-bass rumble");
  }
  if (objectives.wants_more_controlled_dynamics) {
    goals.push("make dynamics more controlled without over-compressing");
  }
  if (objectives.wants_denoise) {
    goals.push("reduce steady background noise conservatively");
  }
  if (objectives.wants_tame_sibilance) {
    goals.push("tame sibilant bursts conservatively");
  }
  if (objectives.wants_remove_clicks) {
    goals.push("repair short clicks and pops conservatively");
  }
  if (objectives.wants_remove_hum) {
    goals.push("reduce mains hum and harmonic buzz conservatively");
  }
  if (objectives.wants_peak_control) {
    goals.push("control peak excursions conservatively");
  }
  if (objectives.wants_speed_up) {
    goals.push("shorten the clip duration while preserving pitch");
  }
  if (objectives.wants_slow_down) {
    goals.push("lengthen the clip duration while preserving pitch");
  }
  if (objectives.wants_pitch_shift && objectives.pitch_shift_semitones !== undefined) {
    goals.push(
      `${objectives.pitch_shift_semitones > 0 ? "raise" : "lower"} the pitch by ${Math.abs(
        objectives.pitch_shift_semitones,
      )} semitones`,
    );
  }
  if (objectives.wants_wider) {
    goals.push("slightly increase stereo width");
  }
  if (objectives.wants_narrower) {
    goals.push("slightly reduce stereo width");
  }
  if (objectives.wants_more_centered) {
    goals.push("reduce left-right stereo imbalance conservatively");
  }
  if (objectives.wants_louder) {
    goals.push("increase output level conservatively");
  }
  if (objectives.wants_more_even_level) {
    goals.push("normalize overall loudness conservatively");
  }
  if (objectives.wants_quieter) {
    goals.push("reduce output level conservatively");
  }
  if (objectives.preserve_punch) {
    goals.push("preserve transient impact");
  }

  return dedupe(goals);
}

function buildConstraints(
  objectives: ReturnType<typeof parseUserRequest>,
  input: string[] | undefined,
  interpretation: PlanEditsOptions["intentInterpretation"],
): string[] {
  const constraints = [...(input ?? [])];

  if (objectives.preserve_punch) {
    constraints.push("avoid reducing transient attack more than necessary");
  }

  if (objectives.wants_more_controlled_dynamics) {
    constraints.push("avoid obvious pumping or over-compression");
  }

  if (
    objectives.wants_louder &&
    objectives.wants_more_controlled_dynamics &&
    !objectives.wants_more_even_level &&
    !objectives.wants_peak_control
  ) {
    constraints.push("prefer measured loudness staging over raw post-compression gain boosts");
  }

  if (objectives.wants_peak_control) {
    constraints.push("keep output ceiling conservative and avoid audible limiting artifacts");
  }

  if (objectives.wants_denoise) {
    constraints.push("avoid obvious denoise artifacts or transient smearing");
  }

  if (objectives.wants_tame_sibilance) {
    constraints.push("avoid turning the full top end dull");
  }

  if (objectives.wants_remove_clicks) {
    constraints.push("avoid blunting intentional transient attacks");
  }

  if (objectives.wants_remove_hum) {
    constraints.push("avoid thinning wanted low-frequency body");
  }

  if (objectives.wants_trim_silence) {
    constraints.push("remove only boundary silence and avoid cutting into clearly active material");
  }

  if (objectives.wants_speed_up || objectives.wants_slow_down) {
    constraints.push("preserve pitch while changing duration");
  }

  if (objectives.wants_pitch_shift) {
    constraints.push("keep duration close to the original after pitch shifting");
  }

  if (objectives.wants_wider || objectives.wants_narrower) {
    constraints.push("keep width changes subtle and preserve mono compatibility");
  }

  if (objectives.wants_more_centered) {
    constraints.push("center the image conservatively without collapsing stereo width");
  }

  if (objectives.wants_more_centered && (objectives.wants_wider || objectives.wants_narrower)) {
    constraints.push("keep stereo rebalance and width changes modest so the image stays stable");
  }

  if (objectives.wants_louder) {
    constraints.push("respect measured peak headroom");
  }

  if (objectives.wants_more_even_level) {
    constraints.push("keep the true-peak ceiling at or below -1 dBTP");
  }

  if (objectives.region_target) {
    constraints.push(
      `apply supported edits only within ${objectives.region_target.start_seconds}s to ${objectives.region_target.end_seconds}s`,
    );
  }

  for (const interpretationConstraint of interpretation?.constraints ?? []) {
    const suffix =
      interpretationConstraint.value === undefined ? "" : ` (${interpretationConstraint.value})`;
    constraints.push(
      `${interpretationConstraint.kind}: ${interpretationConstraint.label}${suffix}`.trim(),
    );
  }

  for (const note of interpretation?.groundingNotes ?? []) {
    constraints.push(`grounding note: ${note}`);
  }

  return dedupe(constraints);
}

function buildRationale(goals: string[], stepCount: number): string {
  const goalSummary = goals.slice(0, 3).join(", ");
  return `The baseline planner mapped the request to ${stepCount} explicit step${stepCount === 1 ? "" : "s"} focused on ${goalSummary}.`;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function formatQuotedList(values: string[]): string {
  return values.map((value) => `\`${value}\``).join(", ");
}

function resolvePitchEstimate(
  options: PlanEditsOptions,
  objectives: ReturnType<typeof parseUserRequest>,
): PitchCenterEstimate | undefined {
  if (!objectives.wants_pitch_shift && !objectives.wants_speed_up && !objectives.wants_slow_down) {
    return undefined;
  }

  if (options.workspaceRoot === undefined) {
    return undefined;
  }

  const estimate = estimatePitchCenter(options.audioVersion, {
    workspaceRoot: options.workspaceRoot,
  });

  if (estimate.voicing === "unvoiced" || estimate.frequency_hz === undefined) {
    return undefined;
  }

  return estimate;
}
