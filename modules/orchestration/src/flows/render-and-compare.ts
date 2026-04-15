import { executeWithFailurePolicy } from "../failure-policy.js";
import type { RenderAndCompareOptions, RenderAndCompareResult, RenderResult } from "../types.js";

/** Renders baseline and candidate versions, then compares the two renders. */
export async function renderAndCompare(
  options: RenderAndCompareOptions,
): Promise<RenderAndCompareResult> {
  const trace = [] as RenderAndCompareResult["trace"];
  let baselineRenderResult: RenderResult | undefined;
  let candidateRenderResult: RenderResult | undefined;

  baselineRenderResult = await executeWithFailurePolicy({
    stage: "render_baseline",
    operation: () => renderVersion(options, "baseline"),
    failurePolicy: options.failurePolicy,
    getPartialResult: () => ({ baselineRenderResult, candidateRenderResult }),
    trace,
  });

  candidateRenderResult = await executeWithFailurePolicy({
    stage: "render_candidate",
    operation: () => renderVersion(options, "candidate"),
    failurePolicy: options.failurePolicy,
    getPartialResult: () => ({ baselineRenderResult, candidateRenderResult }),
    trace,
  });

  const comparisonReport = await executeWithFailurePolicy({
    stage: "compare",
    operation: () =>
      Promise.resolve(
        options.dependencies.compareRenders({
          baselineRender: baselineRenderResult.artifact,
          candidateRender: candidateRenderResult.artifact,
          baselineAnalysis: options.baselineAnalysis,
          candidateAnalysis: options.candidateAnalysis,
          ...(options.editPlan === undefined ? {} : { editPlan: options.editPlan }),
          ...(options.compareGeneratedAt === undefined
            ? {}
            : { generatedAt: options.compareGeneratedAt }),
        }),
      ),
    failurePolicy: options.failurePolicy,
    getPartialResult: () => ({ baselineRenderResult, candidateRenderResult }),
    trace,
  });

  return {
    baselineRender: baselineRenderResult.artifact,
    candidateRender: candidateRenderResult.artifact,
    comparisonReport,
    trace,
  };
}

function renderVersion(
  options: RenderAndCompareOptions,
  role: "baseline" | "candidate",
): Promise<RenderResult> {
  const version = role === "baseline" ? options.baselineVersion : options.candidateVersion;
  const renderOptions =
    role === "baseline" ? options.baselineRenderOptions : options.candidateRenderOptions;

  if (options.renderKind === "final") {
    return options.dependencies.renderExport({
      workspaceRoot: options.workspaceRoot,
      version,
      ...renderOptions,
    });
  }

  return options.dependencies.renderPreview({
    workspaceRoot: options.workspaceRoot,
    version,
    ...renderOptions,
  });
}
