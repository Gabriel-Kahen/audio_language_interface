import { executeWithFailurePolicy } from "../failure-policy.js";
import type { IterationResult, IterativeRefineOptions, IterativeRefineResult } from "../types.js";
import { planAndApply } from "./plan-and-apply.js";

/** Repeats plan, apply, analyze, and compare steps until a stop condition is met. */
export async function iterativeRefine(
  options: IterativeRefineOptions,
): Promise<IterativeRefineResult> {
  const trace = [] as IterativeRefineResult["trace"];
  const iterations: IterationResult[] = [];
  let currentVersion = options.version;
  let currentAnalysis = options.analysisReport;

  for (let iterationNumber = 1; iterationNumber <= options.maxIterations; iterationNumber += 1) {
    const planResult = await planAndApply({
      workspaceRoot: options.workspaceRoot,
      userRequest: options.userRequest,
      version: currentVersion,
      analysisReport: currentAnalysis,
      dependencies: options.dependencies,
      failurePolicy: options.failurePolicy,
    });
    trace.push(...planResult.trace);

    const outputAnalysis = await executeWithFailurePolicy({
      stage: "analyze_output",
      operation: () =>
        options.dependencies.analyzeAudioVersion(planResult.outputVersion, {
          workspaceRoot: options.workspaceRoot,
          ...options.analysisOptions,
        }),
      failurePolicy: options.failurePolicy,
      getPartialResult: () => ({ iterations }),
      trace,
    });

    const comparisonReport = await executeWithFailurePolicy({
      stage: "compare",
      operation: () =>
        Promise.resolve(
          options.dependencies.compareVersions({
            baselineVersion: currentVersion,
            candidateVersion: planResult.outputVersion,
            baselineAnalysis: currentAnalysis,
            candidateAnalysis: outputAnalysis,
            editPlan: planResult.editPlan,
          }),
        ),
      failurePolicy: options.failurePolicy,
      getPartialResult: () => ({ iterations }),
      trace,
    });

    const iteration: IterationResult = {
      iteration: iterationNumber,
      inputVersion: currentVersion,
      outputVersion: planResult.outputVersion,
      inputAnalysis: currentAnalysis,
      outputAnalysis,
      editPlan: planResult.editPlan,
      comparisonReport,
      transformResult: planResult.transformResult,
      ...(planResult.semanticProfile === undefined
        ? {}
        : { semanticProfile: planResult.semanticProfile }),
    };
    iterations.push(iteration);

    const shouldContinue =
      iterationNumber < options.maxIterations &&
      (await options.shouldContinue?.({ iteration, history: iterations }));

    currentVersion = planResult.outputVersion;
    currentAnalysis = outputAnalysis;

    if (!shouldContinue) {
      break;
    }
  }

  return {
    iterations,
    finalVersion: currentVersion,
    finalAnalysis: currentAnalysis,
    trace,
  };
}
