import { createHash } from "node:crypto";

import { assertValidAnalysisReport } from "@audio-language-interface/analysis";
import { assertValidAudioVersion } from "@audio-language-interface/core";
import { assertValidSemanticProfile } from "@audio-language-interface/semantics";

import { parseUserRequest } from "./parse-request.js";
import { buildPlannedSteps } from "./step-builders.js";
import type { EditPlan, PlanEditsOptions } from "./types.js";
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

  const objectives = resolvePlannerObjectives(
    parseUserRequest(options.userRequest),
    options.analysisReport,
    options.semanticProfile,
  );
  const steps = buildPlannedSteps({
    objectives,
    audioVersion: options.audioVersion,
    analysisReport: options.analysisReport,
    semanticProfile: options.semanticProfile,
  });

  if (steps.length === 0) {
    throw new Error(
      "The baseline planner could not derive an executable plan from the request without guessing unsupported behavior.",
    );
  }

  const goals = buildGoals(objectives);
  const verificationTargets = buildVerificationTargets(
    objectives,
    options.analysisReport,
    options.semanticProfile,
  );
  const constraints = buildConstraints(objectives, options.constraints);
  const plan: EditPlan = {
    schema_version: CONTRACT_SCHEMA_VERSION,
    plan_id: createPlanId(options, objectives.normalized_request),
    asset_id: options.audioVersion.asset_id,
    version_id: options.audioVersion.version_id,
    user_request: options.userRequest,
    goals,
    steps,
    created_at: options.generatedAt ?? options.semanticProfile.generated_at,
    rationale: buildRationale(goals, steps.length),
  };

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
  analysisReport: PlanEditsOptions["analysisReport"],
  semanticProfile: PlanEditsOptions["semanticProfile"],
): ReturnType<typeof parseUserRequest> {
  if (objectives.ambiguous_requests.length > 0) {
    throw new Error(
      `The request includes ambiguous phrasing ${formatQuotedList(objectives.ambiguous_requests)}. Please clarify with a supported direction such as darker, less harsh, more controlled dynamics, or peak limiting.`,
    );
  }

  if (objectives.unsupported_requests.length > 0) {
    throw new Error(
      `The baseline planner does not support ${formatQuotedList(objectives.unsupported_requests)}. Supported planning is limited to tonal EQ, filtering, trim, fade, gain, conservative compression, and peak limiting.`,
    );
  }

  if (objectives.wants_darker && objectives.wants_brighter) {
    throw new Error(
      "The request asks for both darker and brighter tonal moves. Please choose one tonal direction.",
    );
  }

  if (objectives.wants_louder && objectives.wants_quieter) {
    throw new Error(
      "The request asks for both louder and quieter level changes. Please choose one level direction.",
    );
  }

  if (!objectives.wants_cleaner) {
    return objectives;
  }

  const effectiveObjectives = { ...objectives };
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

  if (hasHarshnessEvidence) {
    effectiveObjectives.wants_less_harsh = true;
  }

  if (hasMudEvidence) {
    effectiveObjectives.wants_less_muddy = true;
  }

  if (effectiveObjectives.wants_less_harsh || effectiveObjectives.wants_less_muddy) {
    return effectiveObjectives;
  }

  throw new Error(
    "The request asks to clean up the audio, but the baseline planner only supports conservative tonal cleanup when analysis or semantics point to harshness or muddiness. Please ask for a supported direction such as less harsh, darker, less muddy, or rumble removal.",
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
    goals.push("slightly reduce perceived brightness");
  }
  if (objectives.wants_brighter) {
    goals.push("slightly increase upper-band presence");
  }
  if (objectives.wants_less_muddy) {
    goals.push("reduce low-mid muddiness");
  }
  if (objectives.wants_more_warmth) {
    goals.push("slightly increase warmth");
  }
  if (objectives.wants_remove_rumble) {
    goals.push("reduce sub-bass rumble");
  }
  if (objectives.wants_more_controlled_dynamics) {
    goals.push("make dynamics more controlled without over-compressing");
  }
  if (objectives.wants_peak_control) {
    goals.push("control peak excursions conservatively");
  }
  if (objectives.wants_louder) {
    goals.push("increase output level conservatively");
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
): string[] {
  const constraints = [...(input ?? [])];

  if (objectives.preserve_punch) {
    constraints.push("avoid reducing transient attack more than necessary");
  }

  if (objectives.wants_more_controlled_dynamics) {
    constraints.push("avoid obvious pumping or over-compression");
  }

  if (objectives.wants_peak_control) {
    constraints.push("keep output ceiling conservative and avoid audible limiting artifacts");
  }

  if (objectives.wants_louder) {
    constraints.push("respect measured peak headroom");
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
