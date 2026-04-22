import { getVersionFollowUpRequest } from "@audio-language-interface/history";

import { executeWithFailurePolicy } from "../failure-policy.js";
import { resolveRequestInterpretation } from "../request-interpretation.js";
import type {
  AudioVersion,
  PlanAndApplyOptions,
  PlanAndApplyResult,
  SemanticProfile,
} from "../types.js";

/** Builds an optional semantic profile, plans edits, and applies the resulting plan. */
export async function planAndApply(options: PlanAndApplyOptions): Promise<PlanAndApplyResult> {
  const trace = [] as PlanAndApplyResult["trace"];
  let semanticProfile = options.semanticProfile;
  let intentInterpretation = options.requestInterpretation
    ? undefined
    : (undefined as PlanAndApplyResult["intentInterpretation"]);
  let editPlan: PlanAndApplyResult["editPlan"] | undefined;
  const buildSemanticProfile = options.dependencies.buildSemanticProfile;

  if (!semanticProfile && buildSemanticProfile) {
    semanticProfile = await executeWithFailurePolicy<
      SemanticProfile,
      { editPlan?: typeof editPlan }
    >({
      stage: "semantic_profile",
      operation: () => Promise.resolve(buildSemanticProfile(options.analysisReport)),
      failurePolicy: options.failurePolicy,
      getPartialResult: () => ({ editPlan }),
      pass: options.pass,
      trace,
    });
  }

  if (!semanticProfile) {
    throw new Error(
      "planAndApply requires either a SemanticProfile or a buildSemanticProfile dependency.",
    );
  }

  const planStageResult = await executeWithFailurePolicy({
    stage: "plan",
    operation: async () => {
      const previousRequest =
        options.sessionGraph === undefined
          ? undefined
          : getVersionFollowUpRequest(options.sessionGraph, options.version.version_id);
      const sessionContext = {
        ...(options.interpretationSessionContext ?? {}),
        current_version_id: options.version.version_id,
        ...(previousRequest === undefined ? {} : { previous_request: previousRequest }),
        ...(options.originalUserRequest === undefined
          ? {}
          : { original_user_request: options.originalUserRequest }),
      };

      intentInterpretation =
        options.requestInterpretation === undefined
          ? undefined
          : await resolveRequestInterpretation({
              userRequest: options.userRequest,
              audioVersion: options.version,
              analysisReport: options.analysisReport,
              semanticProfile,
              ...(options.originalUserRequest === undefined
                ? {}
                : { originalUserRequest: options.originalUserRequest }),
              interpretation: options.requestInterpretation,
              ...(Object.keys(sessionContext).length === 0 ? {} : { sessionContext }),
              interpretRequest: options.dependencies.interpretRequest,
            });

      editPlan = await Promise.resolve(
        options.dependencies.planEdits({
          userRequest: options.userRequest,
          audioVersion: options.version,
          analysisReport: options.analysisReport,
          semanticProfile,
          ...(intentInterpretation === undefined
            ? {}
            : {
                intentInterpretation: {
                  interpretationId: intentInterpretation.interpretation_id,
                  normalizedRequest: intentInterpretation.normalized_request,
                  requestClassification: intentInterpretation.request_classification,
                  ...(intentInterpretation.ambiguities === undefined
                    ? {}
                    : { ambiguities: intentInterpretation.ambiguities }),
                  ...(intentInterpretation.unsupported_phrases === undefined
                    ? {}
                    : { unsupportedPhrases: intentInterpretation.unsupported_phrases }),
                  ...(intentInterpretation.clarification_question === undefined
                    ? {}
                    : { clarificationQuestion: intentInterpretation.clarification_question }),
                  ...(intentInterpretation.next_action === undefined
                    ? {}
                    : { nextAction: intentInterpretation.next_action }),
                  ...(intentInterpretation.constraints === undefined
                    ? {}
                    : { constraints: intentInterpretation.constraints }),
                  ...(intentInterpretation.region_intents === undefined
                    ? {}
                    : { regionIntents: intentInterpretation.region_intents }),
                  ...(intentInterpretation.descriptor_hypotheses === undefined
                    ? {}
                    : {
                        descriptorHypotheses: intentInterpretation.descriptor_hypotheses.map(
                          (hypothesis) => ({
                            label: hypothesis.label,
                            status: hypothesis.status,
                            ...(hypothesis.supported_by === undefined
                              ? {}
                              : { supportedBy: hypothesis.supported_by }),
                            ...(hypothesis.contradicted_by === undefined
                              ? {}
                              : { contradictedBy: hypothesis.contradicted_by }),
                            ...(hypothesis.needs_more_evidence === undefined
                              ? {}
                              : { needsMoreEvidence: hypothesis.needs_more_evidence }),
                            ...(hypothesis.rationale === undefined
                              ? {}
                              : { rationale: hypothesis.rationale }),
                          }),
                        ),
                      }),
                  ...(intentInterpretation.candidate_interpretations === undefined
                    ? {}
                    : {
                        candidateInterpretations:
                          intentInterpretation.candidate_interpretations.map((candidate) => ({
                            normalizedRequest: candidate.normalized_request,
                            requestClassification: candidate.request_classification,
                            nextAction: candidate.next_action,
                            confidence: candidate.confidence,
                          })),
                      }),
                  ...(intentInterpretation.follow_up_intent === undefined
                    ? {}
                    : { followUpIntent: intentInterpretation.follow_up_intent }),
                  ...(intentInterpretation.grounding_notes === undefined
                    ? {}
                    : { groundingNotes: intentInterpretation.grounding_notes }),
                },
              }),
          workspaceRoot: options.workspaceRoot,
        }),
      );

      return {
        editPlan,
        ...(intentInterpretation === undefined ? {} : { intentInterpretation }),
      };
    },
    failurePolicy: options.failurePolicy,
    getPartialResult: () => ({
      ...(semanticProfile === undefined ? {} : { semanticProfile }),
      ...(intentInterpretation === undefined ? {} : { intentInterpretation }),
    }),
    pass: options.pass,
    trace,
  });
  editPlan = planStageResult.editPlan;
  intentInterpretation = planStageResult.intentInterpretation;

  if (!editPlan) {
    throw new Error("Planning did not produce an EditPlan.");
  }
  const finalizedEditPlan = editPlan;

  const transformResult = await executeWithFailurePolicy({
    stage: "apply",
    operation: () =>
      options.dependencies.applyEditPlan({
        workspaceRoot: options.workspaceRoot,
        version: options.version,
        plan: finalizedEditPlan,
        ...(options.outputDir === undefined ? {} : { outputDir: options.outputDir }),
        ...(options.outputVersionId === undefined
          ? {}
          : { outputVersionId: options.outputVersionId }),
        ...(options.recordId === undefined ? {} : { recordId: options.recordId }),
        ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
        ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
      }),
    failurePolicy: options.failurePolicy,
    getPartialResult: () => ({
      semanticProfile,
      ...(intentInterpretation === undefined ? {} : { intentInterpretation }),
      editPlan: finalizedEditPlan,
    }),
    pass: options.pass,
    trace,
  });

  return {
    editPlan,
    outputVersion: transformResult.outputVersion as AudioVersion,
    transformResult,
    trace,
    ...(semanticProfile === undefined ? {} : { semanticProfile }),
    ...(intentInterpretation === undefined ? {} : { intentInterpretation }),
  };
}
