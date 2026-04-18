import { executeWithFailurePolicy } from "../failure-policy.js";
import type {
  FailurePolicy,
  IterationResult,
  OrchestrationDependencies,
  PlanAndApplyResult,
  WorkflowTraceEntry,
} from "../types.js";
import { planAndApply } from "./plan-and-apply.js";

export async function planApplyComparePass(options: {
  workspaceRoot: string;
  iteration: number;
  userRequest: string;
  version: IterationResult["inputVersion"];
  analysisReport: IterationResult["inputAnalysis"];
  dependencies: Pick<
    OrchestrationDependencies,
    | "analyzeAudioVersion"
    | "buildSemanticProfile"
    | "planEdits"
    | "applyEditPlan"
    | "compareVersions"
  >;
  analysisOptions?: Parameters<OrchestrationDependencies["analyzeAudioVersion"]>[1];
  failurePolicy?: FailurePolicy | undefined;
  trace: WorkflowTraceEntry[];
}): Promise<IterationResult> {
  const planResult = await planAndApply({
    workspaceRoot: options.workspaceRoot,
    userRequest: options.userRequest,
    version: options.version,
    analysisReport: options.analysisReport,
    dependencies: options.dependencies,
    failurePolicy: options.failurePolicy,
    pass: options.iteration,
  });
  options.trace.push(...planResult.trace);

  const outputAnalysis = await executeWithFailurePolicy({
    stage: "analyze_output",
    operation: () =>
      options.dependencies.analyzeAudioVersion(planResult.outputVersion, {
        workspaceRoot: options.workspaceRoot,
        ...options.analysisOptions,
      }),
    failurePolicy: options.failurePolicy,
    getPartialResult: () => buildIterationPartial(options.iteration, planResult),
    pass: options.iteration,
    trace: options.trace,
  });

  const comparisonReport = await executeWithFailurePolicy({
    stage: "compare",
    operation: () =>
      Promise.resolve(
        options.dependencies.compareVersions({
          baselineVersion: options.version,
          candidateVersion: planResult.outputVersion,
          baselineAnalysis: options.analysisReport,
          candidateAnalysis: outputAnalysis,
          editPlan: planResult.editPlan,
        }),
      ),
    failurePolicy: options.failurePolicy,
    getPartialResult: () => ({
      ...buildIterationPartial(options.iteration, planResult),
      outputAnalysis,
    }),
    pass: options.iteration,
    trace: options.trace,
  });

  return {
    iteration: options.iteration,
    inputVersion: options.version,
    outputVersion: planResult.outputVersion,
    inputAnalysis: options.analysisReport,
    outputAnalysis,
    editPlan: planResult.editPlan,
    comparisonReport,
    transformResult: planResult.transformResult,
    ...(planResult.semanticProfile === undefined
      ? {}
      : { semanticProfile: planResult.semanticProfile }),
  };
}

function buildIterationPartial(iteration: number, planResult: PlanAndApplyResult) {
  return {
    iteration,
    ...(planResult.semanticProfile === undefined
      ? {}
      : { semanticProfile: planResult.semanticProfile }),
    editPlan: planResult.editPlan,
    transformResult: planResult.transformResult,
    outputVersion: planResult.outputVersion,
  };
}
