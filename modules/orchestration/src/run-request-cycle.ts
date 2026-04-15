import { createSessionId } from "@audio-language-interface/core";
import { executeWithFailurePolicy, OrchestrationStageError } from "./failure-policy.js";
import { importAndAnalyze } from "./flows/import-and-analyze.js";
import { planAndApply } from "./flows/plan-and-apply.js";
import { renderAndCompare } from "./flows/render-and-compare.js";
import { resolveFollowUpRequest } from "./follow-up-request.js";
import type { FollowUpResolution, RequestCycleResult, RunRequestCycleOptions } from "./types.js";

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
  let resolvedUserRequest = options.userRequest;
  let followUpResolution: FollowUpResolution = {
    kind: "apply",
    resolvedUserRequest: options.userRequest,
    source: "direct_request",
  };

  if (options.input.kind === "import") {
    try {
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
    } catch (error) {
      if (!(error instanceof OrchestrationStageError)) {
        throw error;
      }

      const partialImportResult = error.partialResult?.importResult;
      if (!partialImportResult) {
        throw error;
      }

      const importedAsset = partialImportResult.asset;
      const importedVersion = partialImportResult.version;
      asset = importedAsset;
      inputVersion = importedVersion;
      sessionGraph = initializeSessionGraph({
        options,
        sessionGraph,
        asset: importedAsset,
        version: importedVersion,
      });

      throw rethrowStageError(error, {
        ...error.partialResult,
        asset,
        inputVersion,
        sessionGraph,
      });
    }
  } else {
    if (!inputVersion) {
      throw new Error("Existing request cycle input is missing a version.");
    }

    if (!asset) {
      throw new Error("Existing request cycle input is missing an asset.");
    }

    sessionGraph = initializeSessionGraph({
      options,
      sessionGraph,
      asset,
      version: inputVersion,
    });

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

  sessionGraph = initializeSessionGraph({
    options,
    sessionGraph,
    asset,
    version: inputVersion,
  });

  if (options.input.kind === "existing") {
    sessionGraph = options.dependencies.recordAnalysisReport(sessionGraph, inputAnalysis);
  }

  if (options.input.kind === "existing") {
    const followUp = await executeWithFailurePolicy({
      stage: "resolve_follow_up",
      operation: async () => {
        const followUpInput = {
          userRequest: options.userRequest,
          versionId: inputVersion.version_id,
          ...(sessionGraph === undefined ? {} : { sessionGraph }),
        };

        return resolveFollowUpRequest(followUpInput);
      },
      failurePolicy: options.failurePolicy,
      getPartialResult: () => ({
        asset,
        inputVersion,
        inputAnalysis,
        sessionGraph,
      }),
      trace,
    });

    followUpResolution = followUp;

    if (followUp.kind === "revert") {
      return runRevertRequestCycle({
        options,
        asset,
        inputVersion,
        inputAnalysis,
        sessionGraph,
        followUp,
        trace,
      });
    }

    resolvedUserRequest = followUp.resolvedUserRequest;
  }

  if (options.input.kind === "import") {
    sessionGraph = options.dependencies.recordAnalysisReport(sessionGraph, inputAnalysis);
  }

  try {
    const planResult = await planAndApply({
      workspaceRoot: options.workspaceRoot,
      userRequest: resolvedUserRequest,
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
  } catch (error) {
    if (!(error instanceof OrchestrationStageError)) {
      throw error;
    }

    sessionGraph = recordPlanningArtifacts(
      options,
      sessionGraph,
      error.partialResult?.semanticProfile,
      error.partialResult?.editPlan,
    );

    throw rethrowStageError(error, {
      asset,
      inputVersion,
      inputAnalysis,
      sessionGraph,
      ...error.partialResult,
    });
  }

  sessionGraph = recordPlanningArtifacts(options, sessionGraph, semanticProfile, editPlan);
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

  let baselineRender: RequestCycleResult["baselineRender"] | undefined;
  let candidateRender: RequestCycleResult["candidateRender"] | undefined;
  let comparisonReport: RequestCycleResult["comparisonReport"] | undefined;

  try {
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

    baselineRender = renderCompareResult.baselineRender;
    candidateRender = renderCompareResult.candidateRender;
    comparisonReport = renderCompareResult.comparisonReport;
  } catch (error) {
    if (!(error instanceof OrchestrationStageError)) {
      throw error;
    }

    const partialBaselineRender = error.partialResult?.baselineRenderResult?.artifact;
    const partialCandidateRender = error.partialResult?.candidateRenderResult?.artifact;

    if (partialBaselineRender) {
      sessionGraph = options.dependencies.recordRenderArtifact(sessionGraph, partialBaselineRender);
    }
    if (partialCandidateRender) {
      sessionGraph = options.dependencies.recordRenderArtifact(
        sessionGraph,
        partialCandidateRender,
      );
    }

    throw rethrowStageError(error, {
      asset,
      inputVersion,
      inputAnalysis,
      semanticProfile,
      editPlan,
      transformResult,
      outputVersion,
      outputAnalysis,
      sessionGraph,
      ...error.partialResult,
    });
  }

  sessionGraph = options.dependencies.recordRenderArtifact(sessionGraph, baselineRender);
  sessionGraph = options.dependencies.recordRenderArtifact(sessionGraph, candidateRender);
  sessionGraph = options.dependencies.recordComparisonReport(sessionGraph, comparisonReport);

  return {
    result_kind: "applied",
    asset,
    inputVersion,
    inputAnalysis,
    followUpResolution,
    ...(semanticProfile === undefined ? {} : { semanticProfile }),
    ...(editPlan === undefined ? {} : { editPlan }),
    outputVersion,
    ...(transformResult === undefined ? {} : { transformResult }),
    outputAnalysis,
    baselineRender,
    candidateRender,
    comparisonReport,
    sessionGraph,
    trace,
  };
}

async function runRevertRequestCycle(input: {
  options: RunRequestCycleOptions;
  asset: RequestCycleResult["asset"];
  inputVersion: RequestCycleResult["inputVersion"];
  inputAnalysis: RequestCycleResult["inputAnalysis"];
  sessionGraph: RequestCycleResult["sessionGraph"];
  followUp: Extract<FollowUpResolution, { kind: "revert" }>;
  trace: RequestCycleResult["trace"];
}): Promise<RequestCycleResult> {
  const targetVersion = await executeWithFailurePolicy({
    stage: "load_revert_target",
    operation: async () => {
      const loadVersion = input.options.dependencies.getAudioVersionById;
      if (!loadVersion) {
        throw new Error(
          "Revert-style follow-up requests require a getAudioVersionById dependency so orchestration can materialize the target AudioVersion artifact.",
        );
      }

      const resolvedVersion = await loadVersion({
        asset: input.asset,
        sessionGraph: input.sessionGraph,
        versionId: input.followUp.targetVersionId,
      });
      if (!resolvedVersion) {
        throw new Error(
          `Could not load AudioVersion '${input.followUp.targetVersionId}' for revert execution.`,
        );
      }

      const recordedAssetId =
        input.sessionGraph.metadata?.provenance?.[input.followUp.targetVersionId]?.asset_id;

      if (resolvedVersion.version_id !== input.followUp.targetVersionId) {
        throw new Error(
          `Loaded AudioVersion '${resolvedVersion.version_id}' does not match requested revert target '${input.followUp.targetVersionId}'.`,
        );
      }

      if (resolvedVersion.asset_id !== input.asset.asset_id) {
        throw new Error(
          `Loaded AudioVersion '${resolvedVersion.version_id}' belongs to asset '${resolvedVersion.asset_id}', but the current session asset is '${input.asset.asset_id}'.`,
        );
      }

      if (recordedAssetId && resolvedVersion.asset_id !== recordedAssetId) {
        throw new Error(
          `Loaded AudioVersion '${resolvedVersion.version_id}' does not match the recorded session provenance for asset '${recordedAssetId}'.`,
        );
      }

      return resolvedVersion;
    },
    failurePolicy: input.options.failurePolicy,
    getPartialResult: () => ({
      asset: input.asset,
      inputVersion: input.inputVersion,
      inputAnalysis: input.inputAnalysis,
      sessionGraph: input.sessionGraph,
      followUpResolution: input.followUp,
    }),
    trace: input.trace,
  });

  let sessionGraph = input.options.dependencies.revertToVersion(
    input.sessionGraph,
    targetVersion.version_id,
    new Date().toISOString(),
    `follow_up_${input.followUp.source}`,
  );

  const outputAnalysis = await executeWithFailurePolicy({
    stage: "analyze_output",
    operation: () =>
      input.options.dependencies.analyzeAudioVersion(targetVersion, {
        workspaceRoot: input.options.workspaceRoot,
        ...input.options.analysisOptions,
      }),
    failurePolicy: input.options.failurePolicy,
    getPartialResult: () => ({
      asset: input.asset,
      inputVersion: input.inputVersion,
      inputAnalysis: input.inputAnalysis,
      outputVersion: targetVersion,
      sessionGraph,
      followUpResolution: input.followUp,
    }),
    trace: input.trace,
  });
  sessionGraph = input.options.dependencies.recordAnalysisReport(sessionGraph, outputAnalysis);

  let baselineRender: RequestCycleResult["baselineRender"] | undefined;
  let candidateRender: RequestCycleResult["candidateRender"] | undefined;
  let comparisonReport: RequestCycleResult["comparisonReport"] | undefined;

  try {
    const renderCompareResult = await renderAndCompare({
      workspaceRoot: input.options.workspaceRoot,
      baselineVersion: input.inputVersion,
      candidateVersion: targetVersion,
      baselineAnalysis: input.inputAnalysis,
      candidateAnalysis: outputAnalysis,
      renderKind: input.options.renderKind,
      dependencies: input.options.dependencies,
      failurePolicy: input.options.failurePolicy,
    });
    input.trace.push(...renderCompareResult.trace);

    baselineRender = renderCompareResult.baselineRender;
    candidateRender = renderCompareResult.candidateRender;
    comparisonReport = renderCompareResult.comparisonReport;
  } catch (error) {
    if (!(error instanceof OrchestrationStageError)) {
      throw error;
    }

    const partialBaselineRender = error.partialResult?.baselineRenderResult?.artifact;
    const partialCandidateRender = error.partialResult?.candidateRenderResult?.artifact;

    if (partialBaselineRender) {
      sessionGraph = input.options.dependencies.recordRenderArtifact(
        sessionGraph,
        partialBaselineRender,
      );
    }
    if (partialCandidateRender) {
      sessionGraph = input.options.dependencies.recordRenderArtifact(
        sessionGraph,
        partialCandidateRender,
      );
    }

    throw rethrowStageError(error, {
      asset: input.asset,
      inputVersion: input.inputVersion,
      inputAnalysis: input.inputAnalysis,
      outputVersion: targetVersion,
      outputAnalysis,
      sessionGraph,
      followUpResolution: input.followUp,
      ...error.partialResult,
    });
  }

  sessionGraph = input.options.dependencies.recordRenderArtifact(sessionGraph, baselineRender);
  sessionGraph = input.options.dependencies.recordRenderArtifact(sessionGraph, candidateRender);
  sessionGraph = input.options.dependencies.recordComparisonReport(sessionGraph, comparisonReport);

  return {
    result_kind: "reverted",
    asset: input.asset,
    inputVersion: input.inputVersion,
    inputAnalysis: input.inputAnalysis,
    followUpResolution: input.followUp,
    outputVersion: targetVersion,
    outputAnalysis,
    baselineRender,
    candidateRender,
    comparisonReport,
    sessionGraph,
    trace: input.trace,
  };
}

function initializeSessionGraph(input: {
  options: RunRequestCycleOptions;
  sessionGraph: RequestCycleResult["sessionGraph"] | undefined;
  asset: RequestCycleResult["asset"];
  version: RequestCycleResult["inputVersion"];
}): RequestCycleResult["sessionGraph"] {
  let sessionGraph =
    input.sessionGraph ??
    input.options.dependencies.createSessionGraph({
      session_id: input.options.sessionId ?? createSessionId(),
      created_at: input.version.lineage.created_at,
      active_refs: {
        asset_id: input.asset.asset_id,
        version_id: input.version.version_id,
        ...(input.options.branchId === undefined ? {} : { branch_id: input.options.branchId }),
      },
    });

  sessionGraph = input.options.dependencies.recordAudioAsset(sessionGraph, input.asset);
  sessionGraph = input.options.dependencies.recordAudioVersion(sessionGraph, input.version, {
    ...(input.options.branchId === undefined ? {} : { branch_id: input.options.branchId }),
  });

  return sessionGraph;
}

function recordPlanningArtifacts(
  options: RunRequestCycleOptions,
  sessionGraph: RequestCycleResult["sessionGraph"],
  semanticProfile: RequestCycleResult["semanticProfile"] | undefined,
  editPlan: RequestCycleResult["editPlan"] | undefined,
): RequestCycleResult["sessionGraph"] {
  let nextGraph = sessionGraph;

  if (semanticProfile) {
    nextGraph = options.dependencies.recordSemanticProfile(nextGraph, semanticProfile);
  }

  if (editPlan) {
    nextGraph = options.dependencies.recordEditPlan(nextGraph, editPlan);
  }

  return nextGraph;
}

function rethrowStageError<TPartial>(
  error: OrchestrationStageError<TPartial>,
  partialResult: TPartial,
): never {
  const cause = error.cause instanceof Error ? error.cause : new Error(error.message);

  throw new OrchestrationStageError({
    stage: error.stage,
    error: cause,
    attempts: error.attempts,
    partialResult,
  });
}
