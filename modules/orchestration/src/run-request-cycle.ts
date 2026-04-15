import { createSessionId } from "@audio-language-interface/core";
import { executeWithFailurePolicy } from "./failure-policy.js";
import { importAndAnalyze } from "./flows/import-and-analyze.js";
import { planAndApply } from "./flows/plan-and-apply.js";
import { renderAndCompare } from "./flows/render-and-compare.js";
import type { RequestCycleResult, RunRequestCycleOptions } from "./types.js";

/** Runs one explicit request cycle from import or current version through comparison. */
export async function runRequestCycle(
  options: RunRequestCycleOptions,
): Promise<RequestCycleResult> {
  const trace = [] as RequestCycleResult["trace"];
  let sessionGraph =
    options.input.kind === "existing" && options.input.sessionGraph
      ? options.input.sessionGraph
      : undefined;
  let asset = options.input.kind === "existing" ? options.input.asset : undefined;
  let inputVersion = options.input.kind === "existing" ? options.input.version : undefined;
  let inputAnalysis: RequestCycleResult["inputAnalysis"] | undefined;
  let semanticProfile: RequestCycleResult["semanticProfile"];
  let editPlan: RequestCycleResult["editPlan"] | undefined;
  let transformResult: RequestCycleResult["transformResult"] | undefined;
  let outputVersion: RequestCycleResult["outputVersion"] | undefined;

  if (options.input.kind === "import") {
    const importResult = await importAndAnalyze({
      inputPath: options.input.inputPath,
      importOptions: {
        ...options.input.importOptions,
        workspaceRoot: options.workspaceRoot,
      },
      analysisOptions: {
        workspaceRoot: options.workspaceRoot,
        ...options.analysisOptions,
      },
      dependencies: options.dependencies,
      failurePolicy: options.failurePolicy,
    });

    trace.push(...importResult.trace);
    asset = importResult.asset;
    inputVersion = importResult.version;
    inputAnalysis = importResult.analysisReport;
  } else {
    if (!inputVersion) {
      throw new Error("Existing request cycle input is missing a version.");
    }

    const existingInputVersion = inputVersion;

    inputAnalysis = await executeWithFailurePolicy({
      stage: "analyze_input",
      operation: () =>
        options.dependencies.analyzeAudioVersion(existingInputVersion, {
          workspaceRoot: options.workspaceRoot,
          ...options.analysisOptions,
        }),
      failurePolicy: options.failurePolicy,
      getPartialResult: () => ({ asset, inputVersion, sessionGraph }),
      trace,
    });
  }

  if (!asset || !inputVersion || !inputAnalysis) {
    throw new Error("Request cycle could not establish an input asset, version, and analysis.");
  }

  sessionGraph ??= options.dependencies.createSessionGraph({
    session_id: options.sessionId ?? createSessionId(),
    created_at: inputVersion.lineage.created_at,
    active_refs: {
      asset_id: asset.asset_id,
      version_id: inputVersion.version_id,
      ...(options.branchId === undefined ? {} : { branch_id: options.branchId }),
    },
  });
  sessionGraph = options.dependencies.recordAudioAsset(sessionGraph, asset);
  sessionGraph = options.dependencies.recordAudioVersion(sessionGraph, inputVersion, {
    ...(options.branchId === undefined ? {} : { branch_id: options.branchId }),
  });
  sessionGraph = options.dependencies.recordAnalysisReport(sessionGraph, inputAnalysis);

  const planResult = await planAndApply({
    workspaceRoot: options.workspaceRoot,
    userRequest: options.userRequest,
    version: inputVersion,
    analysisReport: inputAnalysis,
    dependencies: options.dependencies,
    failurePolicy: options.failurePolicy,
  });
  trace.push(...planResult.trace);

  semanticProfile = planResult.semanticProfile;
  editPlan = planResult.editPlan;
  transformResult = planResult.transformResult;
  outputVersion = planResult.outputVersion;

  if (semanticProfile) {
    sessionGraph = options.dependencies.recordSemanticProfile(sessionGraph, semanticProfile);
  }
  sessionGraph = options.dependencies.recordEditPlan(sessionGraph, editPlan);
  sessionGraph = options.dependencies.recordAudioVersion(sessionGraph, outputVersion, {
    ...(options.branchId === undefined ? {} : { branch_id: options.branchId }),
  });
  sessionGraph = options.dependencies.recordTransformRecord(
    sessionGraph,
    transformResult.transformRecord,
  );

  const outputAnalysis = await executeWithFailurePolicy({
    stage: "analyze_output",
    operation: () =>
      options.dependencies.analyzeAudioVersion(outputVersion, {
        workspaceRoot: options.workspaceRoot,
        ...options.analysisOptions,
      }),
    failurePolicy: options.failurePolicy,
    getPartialResult: () => ({
      asset,
      inputVersion,
      inputAnalysis,
      semanticProfile,
      editPlan,
      transformResult,
      outputVersion,
      sessionGraph,
    }),
    trace,
  });
  sessionGraph = options.dependencies.recordAnalysisReport(sessionGraph, outputAnalysis);

  const renderCompareResult = await renderAndCompare({
    workspaceRoot: options.workspaceRoot,
    baselineVersion: inputVersion,
    candidateVersion: outputVersion,
    baselineAnalysis: inputAnalysis,
    candidateAnalysis: outputAnalysis,
    editPlan,
    renderKind: options.renderKind,
    dependencies: options.dependencies,
    failurePolicy: options.failurePolicy,
  });
  trace.push(...renderCompareResult.trace);

  const { baselineRender, candidateRender, comparisonReport } = renderCompareResult;

  sessionGraph = options.dependencies.recordRenderArtifact(sessionGraph, baselineRender);
  sessionGraph = options.dependencies.recordRenderArtifact(sessionGraph, candidateRender);
  sessionGraph = options.dependencies.recordComparisonReport(sessionGraph, comparisonReport);

  return {
    asset,
    inputVersion,
    inputAnalysis,
    ...(semanticProfile === undefined ? {} : { semanticProfile }),
    editPlan,
    outputVersion,
    transformResult,
    outputAnalysis,
    baselineRender,
    candidateRender,
    comparisonReport,
    sessionGraph,
    trace,
  };
}
