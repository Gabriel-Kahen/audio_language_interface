import type { IterationResult, IterativeRefineOptions, IterativeRefineResult } from "../types.js";
import { planApplyComparePass } from "./plan-apply-compare.js";

/** Repeats plan, apply, analyze, and compare steps until a stop condition is met. */
export async function iterativeRefine(
  options: IterativeRefineOptions,
): Promise<IterativeRefineResult> {
  const trace = [] as IterativeRefineResult["trace"];
  const iterations: IterationResult[] = [];
  let currentVersion = options.version;
  let currentAnalysis = options.analysisReport;

  for (let iterationNumber = 1; iterationNumber <= options.maxIterations; iterationNumber += 1) {
    const iteration = await planApplyComparePass({
      workspaceRoot: options.workspaceRoot,
      iteration: iterationNumber,
      userRequest: options.userRequest,
      ...(options.originalUserRequest === undefined
        ? {}
        : { originalUserRequest: options.originalUserRequest }),
      version: currentVersion,
      analysisReport: currentAnalysis,
      analysisOptions: options.analysisOptions,
      ...(options.requestInterpretation === undefined
        ? {}
        : { requestInterpretation: options.requestInterpretation }),
      ...(options.sessionGraph === undefined ? {} : { sessionGraph: options.sessionGraph }),
      dependencies: options.dependencies,
      failurePolicy: options.failurePolicy,
      trace,
    });
    iterations.push(iteration);

    const shouldContinue =
      iterationNumber < options.maxIterations &&
      (await options.shouldContinue?.({ iteration, history: iterations }));

    currentVersion = iteration.outputVersion;
    currentAnalysis = iteration.outputAnalysis;

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
