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
      intentInterpretation =
        options.requestInterpretation === undefined
          ? undefined
          : await resolveRequestInterpretation({
              userRequest: options.userRequest,
              audioVersion: options.version,
              analysisReport: options.analysisReport,
              semanticProfile,
              interpretation: options.requestInterpretation,
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
    getPartialResult: () => ({ semanticProfile }),
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
