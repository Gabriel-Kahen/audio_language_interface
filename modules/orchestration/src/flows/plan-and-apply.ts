import { executeWithFailurePolicy } from "../failure-policy.js";
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
      trace,
    });
  }

  if (!semanticProfile) {
    throw new Error(
      "planAndApply requires either a SemanticProfile or a buildSemanticProfile dependency.",
    );
  }

  editPlan = await executeWithFailurePolicy({
    stage: "plan",
    operation: () =>
      Promise.resolve(
        options.dependencies.planEdits({
          userRequest: options.userRequest,
          audioVersion: options.version,
          analysisReport: options.analysisReport,
          semanticProfile,
        }),
      ),
    failurePolicy: options.failurePolicy,
    getPartialResult: () => ({ semanticProfile }),
    trace,
  });

  const transformResult = await executeWithFailurePolicy({
    stage: "apply",
    operation: () =>
      options.dependencies.applyEditPlan({
        workspaceRoot: options.workspaceRoot,
        version: options.version,
        plan: editPlan,
        ...(options.outputDir === undefined ? {} : { outputDir: options.outputDir }),
        ...(options.outputVersionId === undefined
          ? {}
          : { outputVersionId: options.outputVersionId }),
        ...(options.recordId === undefined ? {} : { recordId: options.recordId }),
        ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
        ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
      }),
    failurePolicy: options.failurePolicy,
    getPartialResult: () => ({ semanticProfile, editPlan }),
    trace,
  });

  return {
    editPlan,
    outputVersion: transformResult.outputVersion as AudioVersion,
    transformResult,
    trace,
    ...(semanticProfile === undefined ? {} : { semanticProfile }),
  };
}
