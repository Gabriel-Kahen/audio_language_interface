import { createSessionId } from "@audio-language-interface/core";
import {
  clearPendingClarification,
  getPendingClarification,
  setPendingClarification,
} from "@audio-language-interface/history";
import { executeWithFailurePolicy, OrchestrationStageError } from "./failure-policy.js";
import { importAndAnalyze } from "./flows/import-and-analyze.js";
import { planApplyComparePass } from "./flows/plan-apply-compare.js";
import { renderAndCompare } from "./flows/render-and-compare.js";
import { resolveFollowUpRequest } from "./follow-up-request.js";
import type {
  ApplyTransformsResult,
  AudioAsset,
  AudioVersion,
  ClarificationRequiredRequestCycleResult,
  ComparisonReport,
  EditPlan,
  FollowUpResolution,
  IntentInterpretation,
  IterationResult,
  RenderArtifact,
  RequestCycleResult,
  RevisionDecision,
  RunRequestCycleOptions,
  SemanticProfile,
} from "./types.js";

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
  const iterations: IterationResult[] = [];
  let revision: RevisionDecision | undefined;
  let resolvedUserRequest = options.userRequest;
  let activeBranchId = options.branchId;
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
        sessionGraph,
        asset: importedAsset,
        version: importedVersion,
        sessionId: options.sessionId,
        branchId: activeBranchId,
        dependencies: options.dependencies,
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
      sessionGraph,
      asset,
      version: inputVersion,
      sessionId: options.sessionId,
      branchId: activeBranchId,
      dependencies: options.dependencies,
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
    sessionGraph,
    asset,
    version: inputVersion,
    sessionId: options.sessionId,
    branchId: activeBranchId,
    dependencies: options.dependencies,
  });
  if (!sessionGraph) {
    throw new Error("Request cycle could not initialize a session graph.");
  }
  let initializedSessionGraph = sessionGraph;

  if (options.input.kind === "existing") {
    sessionGraph = options.dependencies.recordAnalysisReport(
      initializedSessionGraph,
      inputAnalysis,
    );
  }

  if (options.input.kind === "existing") {
    const resolvedExistingInputVersion = inputVersion;
    const pendingClarification = getPendingClarification(initializedSessionGraph);
    const followUp = await executeWithFailurePolicy({
      stage: "resolve_follow_up",
      operation: async () => {
        const followUpInput = {
          userRequest: options.userRequest,
          versionId: resolvedExistingInputVersion.version_id,
          sessionGraph: initializedSessionGraph,
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
      if (pendingClarification !== undefined) {
        sessionGraph = clearPendingClarification(sessionGraph, new Date().toISOString());
      }
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
    if (pendingClarification !== undefined && followUp.source === "direct_request") {
      followUpResolution = {
        ...followUp,
        source: "clarification_answer",
      };
    }

    if (followUp.inputVersionId && followUp.inputVersionId !== inputVersion.version_id) {
      const followUpInputVersionId = followUp.inputVersionId;
      const currentSessionGraph = sessionGraph;
      inputVersion = await executeWithFailurePolicy({
        stage: "load_follow_up_input",
        operation: () =>
          loadSessionVersion({
            options,
            asset,
            sessionGraph: currentSessionGraph,
            versionId: followUpInputVersionId,
          }),
        failurePolicy: options.failurePolicy,
        getPartialResult: () => ({
          asset,
          inputVersion,
          inputAnalysis,
          sessionGraph,
          followUpResolution: followUpResolution,
        }),
        trace,
      });

      sessionGraph = initializeSessionGraph({
        sessionGraph,
        asset,
        version: inputVersion,
        sessionId: options.sessionId,
        branchId: activeBranchId,
        dependencies: options.dependencies,
      });

      inputAnalysis = await executeWithFailurePolicy({
        stage: "analyze_input",
        operation: () => {
          const loadedInputVersion = inputVersion;
          if (!loadedInputVersion) {
            throw new Error("Expected a materialized follow-up input version before analysis.");
          }

          return options.dependencies.analyzeAudioVersion(loadedInputVersion, {
            workspaceRoot: options.workspaceRoot,
            ...options.analysisOptions,
          });
        },
        failurePolicy: options.failurePolicy,
        getPartialResult: () => ({
          asset,
          inputVersion,
          sessionGraph,
          followUpResolution: followUpResolution,
        }),
        trace,
      });
      sessionGraph = options.dependencies.recordAnalysisReport(sessionGraph, inputAnalysis);
    }

    initializedSessionGraph = sessionGraph;

    if (followUp.source === "try_another_version") {
      const currentSessionGraph = sessionGraph;
      const followUpBaseVersion = inputVersion;
      const branchId = await executeWithFailurePolicy({
        stage: "prepare_follow_up_branch",
        operation: async () => {
          const nextBranchId =
            followUp.branchId ?? createAlternateBranchId(currentSessionGraph, followUpBaseVersion);
          sessionGraph = options.dependencies.createBranch(currentSessionGraph, {
            branch_id: nextBranchId,
            source_version_id: followUpBaseVersion.version_id,
            created_at: new Date().toISOString(),
            label: `alternate for ${followUpBaseVersion.version_id}`,
          });
          return nextBranchId;
        },
        failurePolicy: options.failurePolicy,
        getPartialResult: () => ({
          asset,
          inputVersion,
          inputAnalysis,
          sessionGraph,
          followUpResolution: followUpResolution,
        }),
        trace,
      });
      activeBranchId = branchId;
      followUpResolution = {
        ...followUp,
        branchId,
      };
    }
  }

  if (options.input.kind === "import") {
    sessionGraph = options.dependencies.recordAnalysisReport(sessionGraph, inputAnalysis);
  }

  let currentVersion = inputVersion;
  let currentAnalysis = inputAnalysis;
  const activePendingClarification = getPendingClarification(sessionGraph);

  try {
    const firstIteration = await planApplyComparePass({
      workspaceRoot: options.workspaceRoot,
      iteration: 1,
      userRequest: resolvedUserRequest,
      originalUserRequest: options.userRequest,
      version: currentVersion,
      analysisReport: currentAnalysis,
      analysisOptions: options.analysisOptions,
      ...(activePendingClarification === undefined
        ? {}
        : {
            interpretationSessionContext: {
              pending_clarification: {
                original_user_request: activePendingClarification.original_user_request,
                clarification_question: activePendingClarification.clarification_question,
                source_version_id: activePendingClarification.source_version_id,
                ...(activePendingClarification.source_interpretation_id === undefined
                  ? {}
                  : {
                      source_interpretation_id: activePendingClarification.source_interpretation_id,
                    }),
              },
            },
          }),
      ...(options.interpretation === undefined
        ? {}
        : { requestInterpretation: options.interpretation }),
      ...(options.planningPolicy === undefined ? {} : { planningPolicy: options.planningPolicy }),
      sessionGraph,
      dependencies: options.dependencies,
      failurePolicy: options.failurePolicy,
      trace,
    });
    iterations.push(firstIteration);
    sessionGraph = recordAppliedIterationArtifacts(
      options.dependencies,
      sessionGraph,
      firstIteration,
      activeBranchId,
    );
    currentVersion = firstIteration.outputVersion;
    currentAnalysis = firstIteration.outputAnalysis;
    revision = await decideRevision(options, firstIteration, iterations);

    if (revision.shouldRevise) {
      const secondIteration = await planApplyComparePass({
        workspaceRoot: options.workspaceRoot,
        iteration: 2,
        userRequest: resolvedUserRequest,
        originalUserRequest: options.userRequest,
        version: currentVersion,
        analysisReport: currentAnalysis,
        analysisOptions: options.analysisOptions,
        ...(activePendingClarification === undefined
          ? {}
          : {
              interpretationSessionContext: {
                pending_clarification: {
                  original_user_request: activePendingClarification.original_user_request,
                  clarification_question: activePendingClarification.clarification_question,
                  source_version_id: activePendingClarification.source_version_id,
                  ...(activePendingClarification.source_interpretation_id === undefined
                    ? {}
                    : {
                        source_interpretation_id:
                          activePendingClarification.source_interpretation_id,
                      }),
                },
              },
            }),
        ...(options.interpretation === undefined
          ? {}
          : { requestInterpretation: options.interpretation }),
        ...(options.planningPolicy === undefined ? {} : { planningPolicy: options.planningPolicy }),
        sessionGraph,
        dependencies: options.dependencies,
        failurePolicy: options.failurePolicy,
        trace,
      });
      iterations.push(secondIteration);
      sessionGraph = recordAppliedIterationArtifacts(
        options.dependencies,
        sessionGraph,
        secondIteration,
        activeBranchId,
      );
      currentVersion = secondIteration.outputVersion;
      currentAnalysis = secondIteration.outputAnalysis;
    }
  } catch (error) {
    if (!(error instanceof OrchestrationStageError)) {
      throw error;
    }

    const clarificationResult = buildClarificationResult({
      error,
      asset,
      inputVersion,
      inputAnalysis,
      followUpResolution,
      sessionGraph,
      trace,
      dependencies: options.dependencies,
    });
    if (clarificationResult !== undefined) {
      return clarificationResult;
    }

    sessionGraph = recordAppliedIterationPartial(
      options.dependencies,
      sessionGraph,
      error.partialResult,
      activeBranchId,
    );

    throw rethrowStageError(error, {
      asset,
      inputVersion,
      inputAnalysis,
      ...(iterations.length === 0 ? {} : { iterations: [...iterations] }),
      ...(revision === undefined ? {} : { revision }),
      sessionGraph,
      ...error.partialResult,
    });
  }

  const finalIteration = iterations.at(-1);
  if (!finalIteration) {
    throw new Error("Request cycle did not produce an applied iteration.");
  }

  const exposeTopLevelIterationArtifacts = iterations.length === 1;
  const semanticProfile = exposeTopLevelIterationArtifacts
    ? finalIteration.semanticProfile
    : undefined;
  const intentInterpretation = exposeTopLevelIterationArtifacts
    ? finalIteration.intentInterpretation
    : undefined;
  const editPlan = exposeTopLevelIterationArtifacts ? finalIteration.editPlan : undefined;
  const transformResult = exposeTopLevelIterationArtifacts
    ? finalIteration.transformResult
    : undefined;
  const outputVersion = finalIteration.outputVersion;
  const outputAnalysis = finalIteration.outputAnalysis;
  const versionComparisonReport = finalIteration.comparisonReport;
  const cycleEditPlan = iterations[0]?.editPlan;

  let baselineRender: RenderArtifact | undefined;
  let candidateRender: RenderArtifact | undefined;
  let renderComparisonReport: ComparisonReport | undefined;

  try {
    const renderCompareResult = await renderAndCompare({
      workspaceRoot: options.workspaceRoot,
      baselineVersion: inputVersion,
      candidateVersion: outputVersion,
      baselineAnalysis: inputAnalysis,
      candidateAnalysis: outputAnalysis,
      ...(cycleEditPlan !== undefined && cycleEditPlan.version_id === inputVersion.version_id
        ? { editPlan: cycleEditPlan }
        : {}),
      renderKind: options.renderKind,
      dependencies: options.dependencies,
      failurePolicy: options.failurePolicy,
    });
    trace.push(...renderCompareResult.trace);

    baselineRender = renderCompareResult.baselineRender;
    candidateRender = renderCompareResult.candidateRender;
    renderComparisonReport = renderCompareResult.comparisonReport;
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
      ...(semanticProfile === undefined ? {} : { semanticProfile }),
      ...(intentInterpretation === undefined ? {} : { intentInterpretation }),
      ...(editPlan === undefined ? {} : { editPlan }),
      ...(transformResult === undefined ? {} : { transformResult }),
      outputVersion,
      outputAnalysis,
      versionComparisonReport,
      iterations,
      ...(revision === undefined ? {} : { revision }),
      sessionGraph,
      ...error.partialResult,
    });
  }

  if (!baselineRender || !candidateRender || !renderComparisonReport) {
    throw new Error("Render comparison did not produce the expected artifacts and report.");
  }

  sessionGraph = options.dependencies.recordRenderArtifact(sessionGraph, baselineRender);
  sessionGraph = options.dependencies.recordRenderArtifact(sessionGraph, candidateRender);
  sessionGraph = options.dependencies.recordComparisonReport(sessionGraph, renderComparisonReport);
  sessionGraph = clearPendingClarification(sessionGraph, new Date().toISOString());

  return {
    result_kind: "applied",
    asset,
    inputVersion,
    inputAnalysis,
    followUpResolution,
    iterations,
    ...(revision === undefined ? {} : { revision }),
    ...(semanticProfile === undefined ? {} : { semanticProfile }),
    ...(intentInterpretation === undefined ? {} : { intentInterpretation }),
    ...(editPlan === undefined ? {} : { editPlan }),
    outputVersion,
    ...(transformResult === undefined ? {} : { transformResult }),
    outputAnalysis,
    versionComparisonReport,
    baselineRender,
    candidateRender,
    renderComparisonReport,
    comparisonReport: renderComparisonReport,
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
  sessionGraph = clearPendingClarification(sessionGraph, new Date().toISOString());

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

  const versionComparisonReport = await executeWithFailurePolicy({
    stage: "compare",
    operation: () =>
      Promise.resolve(
        input.options.dependencies.compareVersions({
          baselineVersion: input.inputVersion,
          candidateVersion: targetVersion,
          baselineAnalysis: input.inputAnalysis,
          candidateAnalysis: outputAnalysis,
        }),
      ),
    failurePolicy: input.options.failurePolicy,
    getPartialResult: () => ({
      asset: input.asset,
      inputVersion: input.inputVersion,
      inputAnalysis: input.inputAnalysis,
      outputVersion: targetVersion,
      outputAnalysis,
      sessionGraph,
      followUpResolution: input.followUp,
    }),
    trace: input.trace,
  });
  sessionGraph = input.options.dependencies.recordComparisonReport(
    sessionGraph,
    versionComparisonReport,
  );

  let baselineRender: RenderArtifact | undefined;
  let candidateRender: RenderArtifact | undefined;
  let renderComparisonReport: ComparisonReport | undefined;

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
    renderComparisonReport = renderCompareResult.comparisonReport;
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
      versionComparisonReport,
      sessionGraph,
      followUpResolution: input.followUp,
      ...error.partialResult,
    });
  }

  if (!baselineRender || !candidateRender || !renderComparisonReport) {
    throw new Error("Render comparison did not produce the expected artifacts and report.");
  }

  sessionGraph = input.options.dependencies.recordRenderArtifact(sessionGraph, baselineRender);
  sessionGraph = input.options.dependencies.recordRenderArtifact(sessionGraph, candidateRender);
  sessionGraph = input.options.dependencies.recordComparisonReport(
    sessionGraph,
    renderComparisonReport,
  );

  return {
    result_kind: "reverted",
    asset: input.asset,
    inputVersion: input.inputVersion,
    inputAnalysis: input.inputAnalysis,
    followUpResolution: input.followUp,
    outputVersion: targetVersion,
    outputAnalysis,
    versionComparisonReport,
    baselineRender,
    candidateRender,
    renderComparisonReport,
    comparisonReport: renderComparisonReport,
    sessionGraph,
    trace: input.trace,
  };
}

function buildClarificationResult(input: {
  error: OrchestrationStageError<Record<string, unknown>>;
  asset: AudioAsset;
  inputVersion: AudioVersion;
  inputAnalysis: RequestCycleResult["inputAnalysis"];
  followUpResolution: FollowUpResolution;
  sessionGraph: RequestCycleResult["sessionGraph"];
  trace: RequestCycleResult["trace"];
  dependencies: RunRequestCycleOptions["dependencies"];
}): ClarificationRequiredRequestCycleResult | undefined {
  if (input.error.stage !== "plan") {
    return undefined;
  }

  const partialResult = input.error.partialResult;
  if (!partialResult) {
    return undefined;
  }

  const semanticProfile =
    "semanticProfile" in partialResult
      ? (partialResult.semanticProfile as SemanticProfile | undefined)
      : undefined;
  const intentInterpretation =
    "intentInterpretation" in partialResult
      ? (partialResult.intentInterpretation as IntentInterpretation | undefined)
      : undefined;

  if (!semanticProfile || !intentInterpretation || intentInterpretation.next_action !== "clarify") {
    return undefined;
  }

  const clarificationQuestion =
    intentInterpretation.clarification_question ??
    "Please clarify the intended supported direction before planning continues.";
  const clarificationCreatedAt = new Date().toISOString();
  const pendingClarification = {
    original_user_request: intentInterpretation.user_request,
    clarification_question: clarificationQuestion,
    source_version_id: input.inputVersion.version_id,
    created_at: clarificationCreatedAt,
    ...(intentInterpretation.interpretation_id === undefined
      ? {}
      : { source_interpretation_id: intentInterpretation.interpretation_id }),
  };

  let sessionGraph = recordPlanningArtifacts(
    input.dependencies,
    input.sessionGraph,
    semanticProfile,
    undefined,
  );
  sessionGraph = setPendingClarification(sessionGraph, pendingClarification);

  return {
    result_kind: "clarification_required",
    asset: input.asset,
    inputVersion: input.inputVersion,
    inputAnalysis: input.inputAnalysis,
    followUpResolution: input.followUpResolution,
    semanticProfile,
    intentInterpretation,
    clarification: {
      question: clarificationQuestion,
      pendingClarification,
    },
    sessionGraph,
    trace: input.trace,
  };
}

function initializeSessionGraph(input: {
  sessionGraph: RequestCycleResult["sessionGraph"] | undefined;
  asset: AudioAsset;
  version: AudioVersion;
  sessionId: string | undefined;
  branchId: string | undefined;
  dependencies: RunRequestCycleOptions["dependencies"];
}): RequestCycleResult["sessionGraph"] {
  let sessionGraph =
    input.sessionGraph ??
    input.dependencies.createSessionGraph({
      session_id: input.sessionId ?? createSessionId(),
      created_at: input.version.lineage.created_at,
      active_refs: {
        asset_id: input.asset.asset_id,
        version_id: input.version.version_id,
        ...(input.branchId === undefined ? {} : { branch_id: input.branchId }),
      },
    });

  sessionGraph = input.dependencies.recordAudioAsset(sessionGraph, input.asset);
  sessionGraph = input.dependencies.recordAudioVersion(sessionGraph, input.version, {
    ...(input.branchId === undefined ? {} : { branch_id: input.branchId }),
  });

  return sessionGraph;
}

function recordPlanningArtifacts(
  dependencies: RunRequestCycleOptions["dependencies"],
  sessionGraph: RequestCycleResult["sessionGraph"],
  semanticProfile: SemanticProfile | undefined,
  editPlan: EditPlan | undefined,
): RequestCycleResult["sessionGraph"] {
  let nextGraph = sessionGraph;

  if (semanticProfile) {
    nextGraph = dependencies.recordSemanticProfile(nextGraph, semanticProfile);
  }

  if (editPlan) {
    nextGraph = dependencies.recordEditPlan(nextGraph, editPlan);
  }

  return nextGraph;
}

function recordAppliedIterationArtifacts(
  dependencies: RunRequestCycleOptions["dependencies"],
  sessionGraph: RequestCycleResult["sessionGraph"],
  iteration: IterationResult,
  branchId?: string,
): RequestCycleResult["sessionGraph"] {
  let nextGraph = recordPlanningArtifacts(
    dependencies,
    sessionGraph,
    iteration.semanticProfile,
    iteration.editPlan,
  );
  nextGraph = dependencies.recordAudioVersion(nextGraph, iteration.outputVersion, {
    ...(branchId === undefined ? {} : { branch_id: branchId }),
  });
  nextGraph = dependencies.recordTransformRecord(
    nextGraph,
    iteration.transformResult.transformRecord,
  );
  nextGraph = dependencies.recordAnalysisReport(nextGraph, iteration.outputAnalysis);
  nextGraph = dependencies.recordComparisonReport(nextGraph, iteration.comparisonReport);
  return nextGraph;
}

function recordAppliedIterationPartial(
  dependencies: RunRequestCycleOptions["dependencies"],
  sessionGraph: RequestCycleResult["sessionGraph"],
  partialResult: Record<string, unknown> | undefined,
  branchId?: string,
): RequestCycleResult["sessionGraph"] {
  if (!partialResult) {
    return sessionGraph;
  }

  let nextGraph = recordPlanningArtifacts(
    dependencies,
    sessionGraph,
    "semanticProfile" in partialResult
      ? (partialResult.semanticProfile as SemanticProfile | undefined)
      : undefined,
    "editPlan" in partialResult ? (partialResult.editPlan as EditPlan | undefined) : undefined,
  );

  if ("outputVersion" in partialResult && partialResult.outputVersion) {
    nextGraph = dependencies.recordAudioVersion(
      nextGraph,
      partialResult.outputVersion as AudioVersion,
      {
        ...(branchId === undefined ? {} : { branch_id: branchId }),
      },
    );
  }

  if ("transformResult" in partialResult && partialResult.transformResult) {
    const transformResult = partialResult.transformResult as ApplyTransformsResult | undefined;
    if (transformResult) {
      nextGraph = dependencies.recordTransformRecord(nextGraph, transformResult.transformRecord);
    }
  }

  if ("outputAnalysis" in partialResult && partialResult.outputAnalysis) {
    nextGraph = dependencies.recordAnalysisReport(
      nextGraph,
      partialResult.outputAnalysis as RequestCycleResult["inputAnalysis"],
    );
  }

  if ("comparisonReport" in partialResult && partialResult.comparisonReport) {
    nextGraph = dependencies.recordComparisonReport(
      nextGraph,
      partialResult.comparisonReport as ComparisonReport,
    );
  }

  return nextGraph;
}

async function loadSessionVersion(input: {
  options: RunRequestCycleOptions;
  asset: AudioAsset;
  sessionGraph: RequestCycleResult["sessionGraph"];
  versionId: string;
}): Promise<AudioVersion> {
  const loadVersion = input.options.dependencies.getAudioVersionById;
  if (!loadVersion) {
    throw new Error(
      "Follow-up requests that target a prior baseline version require a getAudioVersionById dependency so orchestration can materialize that AudioVersion artifact.",
    );
  }

  const resolvedVersion = await loadVersion({
    asset: input.asset,
    sessionGraph: input.sessionGraph,
    versionId: input.versionId,
  });

  if (!resolvedVersion) {
    throw new Error(`Could not load AudioVersion '${input.versionId}' for follow-up execution.`);
  }

  const recordedAssetId = input.sessionGraph.metadata?.provenance?.[input.versionId]?.asset_id;
  if (resolvedVersion.version_id !== input.versionId) {
    throw new Error(
      `Loaded AudioVersion '${resolvedVersion.version_id}' does not match requested follow-up source version '${input.versionId}'.`,
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
}

function createAlternateBranchId(
  sessionGraph: RequestCycleResult["sessionGraph"],
  version: AudioVersion,
): string {
  const existingBranchIds = new Set(
    sessionGraph.metadata?.branches?.map((branch) => branch.branch_id) ?? [],
  );
  const baseSlug = `branch_alt_${sanitizeBranchFragment(version.version_id)}`;
  let index = 1;

  while (existingBranchIds.has(`${baseSlug}_${index}`)) {
    index += 1;
  }

  return `${baseSlug}_${index}`;
}

function sanitizeBranchFragment(value: string): string {
  return value
    .replace(/[^A-Za-z0-9]+/g, "")
    .slice(-24)
    .toLowerCase();
}

async function decideRevision(
  options: RunRequestCycleOptions,
  iteration: IterationResult,
  history: IterationResult[],
): Promise<RevisionDecision> {
  if (!options.revision?.enabled) {
    return {
      shouldRevise: false,
      rationale: "Revision loop disabled for this request cycle.",
      source: "disabled",
    };
  }

  const callerDecision = options.revision.shouldRevise;
  if (callerDecision) {
    const rawDecision = await callerDecision({ iteration, history });
    if (typeof rawDecision === "boolean") {
      return {
        shouldRevise: rawDecision,
        rationale: rawDecision
          ? "Caller revision policy requested one additional pass."
          : "Caller revision policy declined an additional pass.",
        source: "caller",
      };
    }

    return {
      shouldRevise: rawDecision.shouldRevise,
      rationale:
        rawDecision.rationale ??
        (rawDecision.shouldRevise
          ? "Caller revision policy requested one additional pass."
          : "Caller revision policy declined an additional pass."),
      source: "caller",
    };
  }

  const verificationResults = iteration.comparisonReport.verification_results ?? [];
  const hasStructuredVerification = verificationResults.length > 0;
  const hasUnmetStructuredVerification = verificationResults.some(
    (target) => target.status === "not_met",
  );
  const goalStatuses = iteration.comparisonReport.goal_alignment ?? [];
  const hasUnmetGoal = goalStatuses.some((goal) => goal.status === "not_met");
  const severeRegression = (iteration.comparisonReport.regressions ?? []).some(
    (regression) => regression.severity >= 0.7,
  );

  if (!hasStructuredVerification && goalStatuses.length === 0) {
    return {
      shouldRevise: false,
      rationale:
        "Revision loop enabled, but the first pass did not produce goal-alignment evidence to justify an automatic follow-up pass.",
      source: "default_policy",
    };
  }

  if (severeRegression) {
    return {
      shouldRevise: false,
      rationale:
        "Revision loop enabled, but the first pass introduced a severe regression, so orchestration stopped instead of compounding the edit.",
      source: "default_policy",
    };
  }

  if (hasStructuredVerification && hasUnmetStructuredVerification) {
    return {
      shouldRevise: true,
      rationale:
        "Revision loop enabled, and structured verification still shows at least one requested check as not met without a severe regression, so orchestration will attempt one more explicit pass.",
      source: "default_policy",
    };
  }

  if (!hasStructuredVerification && hasUnmetGoal) {
    return {
      shouldRevise: true,
      rationale:
        "Revision loop enabled, and the first pass left at least one requested goal unmet without triggering a severe regression, so orchestration will attempt one more explicit pass.",
      source: "default_policy",
    };
  }

  return {
    shouldRevise: false,
    rationale: hasStructuredVerification
      ? "Revision loop enabled, but structured verification already met or mostly met the requested checks, so orchestration stopped after one pass."
      : "Revision loop enabled, but the first pass already met or mostly met the requested goals, so orchestration stopped after one pass.",
    source: "default_policy",
  };
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
