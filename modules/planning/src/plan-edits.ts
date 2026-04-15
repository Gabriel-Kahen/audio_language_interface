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

  const objectives = parseUserRequest(options.userRequest);
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
