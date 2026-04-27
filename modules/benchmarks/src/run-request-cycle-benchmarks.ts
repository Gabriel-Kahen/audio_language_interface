import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  type AppliedOrRevertedRequestCycleResult,
  type AudioVersion,
  type ClarificationRequiredRequestCycleResult,
  defaultOrchestrationDependencies,
  isAppliedOrRevertedRequestCycleResult,
  type OrchestrationDependencies,
  OrchestrationStageError,
  type RequestCycleResult,
  runRequestCycle,
} from "@audio-language-interface/orchestration";
import {
  executeToolRequest,
  type ToolRequest,
  type ToolsRuntime,
} from "@audio-language-interface/tools";

import {
  DEFAULT_AUDIO_FIXTURE_MANIFEST_PATH,
  loadAudioFixtureManifest,
  materializeAudioFixture,
  resolveAudioFixture,
} from "./fixture-loader.js";
import { firstPromptFamilyRequestCycleCorpus } from "./prompt-suite.js";
import { scoreRequestCycleBenchmarkCase } from "./scoring.js";
import type {
  AudioFixtureManifestEntry,
  RequestCycleBenchmarkCase,
  RequestCycleBenchmarkCaseResult,
  RequestCycleBenchmarkCorpus,
  RequestCycleBenchmarkExecutionSurface,
  RequestCycleBenchmarkFailure,
  RequestCycleBenchmarkRunResult,
  RunRequestCycleBenchmarkCaseOptions,
  RunRequestCycleBenchmarksOptions,
} from "./types.js";

const REQUEST_CYCLE_BENCHMARK_CORPUS_ID = "request_cycle_ad_hoc";

export async function runRequestCycleBenchmarks(
  benchmarkInput:
    | RequestCycleBenchmarkCorpus
    | RequestCycleBenchmarkCase[] = firstPromptFamilyRequestCycleCorpus,
  options: RunRequestCycleBenchmarksOptions = {},
): Promise<RequestCycleBenchmarkRunResult> {
  const runStartedAt = new Date();
  const benchmarkCases = Array.isArray(benchmarkInput) ? benchmarkInput : benchmarkInput.cases;
  const manifestPath =
    options.fixtureManifestPath ??
    (Array.isArray(benchmarkInput)
      ? DEFAULT_AUDIO_FIXTURE_MANIFEST_PATH
      : benchmarkInput.fixtureManifestPath);
  const fixtureManifest = options.fixtureManifest ?? (await loadAudioFixtureManifest(manifestPath));

  const caseResults: RequestCycleBenchmarkCaseResult[] = [];
  for (const benchmarkCase of benchmarkCases) {
    caseResults.push(
      await runRequestCycleBenchmarkCase(benchmarkCase, {
        ...options,
        fixtureManifest,
        fixtureManifestPath: manifestPath,
      }),
    );
  }

  const totalDurationMs = caseResults.reduce((sum, item) => sum + item.durationMs, 0);
  const succeededCases = caseResults.filter((item) => item.status === "ok").length;
  const failedCases = caseResults.length - succeededCases;
  const totalPassedChecks = caseResults.reduce((sum, item) => sum + item.passedChecks, 0);
  const totalChecks = caseResults.reduce((sum, item) => sum + item.totalChecks, 0);

  return {
    benchmarkMode: "request_cycle",
    suiteId: Array.isArray(benchmarkInput)
      ? (benchmarkCases[0]?.family ?? "request_cycle_fixture")
      : benchmarkInput.suiteId,
    corpusId: Array.isArray(benchmarkInput)
      ? REQUEST_CYCLE_BENCHMARK_CORPUS_ID
      : benchmarkInput.corpusId,
    fixtureManifestPath: manifestPath,
    caseResults,
    totalCases: caseResults.length,
    succeededCases,
    failedCases,
    totalPassedChecks,
    totalChecks,
    overallScore:
      totalChecks === 0 ? 1 : Math.round((totalPassedChecks / totalChecks) * 1000) / 1000,
    totalDurationMs: totalDurationMs > 0 ? totalDurationMs : Date.now() - runStartedAt.getTime(),
  };
}

export async function runRequestCycleBenchmarkCase(
  benchmarkCase: RequestCycleBenchmarkCase,
  options: RunRequestCycleBenchmarkCaseOptions = {},
): Promise<RequestCycleBenchmarkCaseResult> {
  const startedAt = new Date();
  const startedAtIso = startedAt.toISOString();
  const executionSurface = options.executionSurface ?? "orchestration";
  const workspaceRoot = await createBenchmarkWorkspaceRoot(
    benchmarkCase.caseId,
    options.workspaceRoot,
  );
  const versionStore = new Map<string, AudioVersion>();
  const dependencies =
    executionSurface === "orchestration"
      ? createBenchmarkDependencies(versionStore, options.dependencies)
      : undefined;

  let fixtureManifestPath = options.fixtureManifestPath ?? DEFAULT_AUDIO_FIXTURE_MANIFEST_PATH;
  let fixture: AudioFixtureManifestEntry | undefined;
  let inputPath: string | undefined;
  let sourceFixturePath: string | undefined;
  let requestCycleResult: RequestCycleBenchmarkCaseResult["requestCycleResult"];
  let setupResults: RequestCycleBenchmarkCaseResult["setupResults"];
  let error: RequestCycleBenchmarkFailure | undefined;

  try {
    fixtureManifestPath = options.fixtureManifestPath ?? DEFAULT_AUDIO_FIXTURE_MANIFEST_PATH;
    fixture = resolveAudioFixture(
      options.fixtureManifest ?? (await loadAudioFixtureManifest(fixtureManifestPath)),
      benchmarkCase.fixtureId,
    );
    const materialized = await materializeAudioFixture(fixture, workspaceRoot);
    inputPath = materialized.inputPath;
    sourceFixturePath = materialized.sourceFixturePath;

    const setupSequence = benchmarkCase.setup_sequence ?? [];
    if (setupSequence.length > 0) {
      setupResults = [];
      let priorResult: RequestCycleResult | undefined;

      for (const setupPrompt of setupSequence) {
        const cycleResult = await executeBenchmarkCycle({
          benchmarkCase,
          executionSurface,
          dependencies,
          toolRuntime: options.toolRuntime,
          prompt: setupPrompt,
          inputPath: materialized.inputPath,
          priorResult,
          startedAtIso,
          versionStore,
          workspaceRoot,
          options,
        });

        setupResults.push(cycleResult);
        priorResult = cycleResult;
      }

      const finalInput = priorResult;
      if (!finalInput) {
        throw new Error("Expected a setup result before running the final benchmark prompt.");
      }

      requestCycleResult = await executeBenchmarkCycle({
        benchmarkCase,
        executionSurface,
        dependencies,
        toolRuntime: options.toolRuntime,
        prompt: benchmarkCase.prompt,
        inputPath: materialized.inputPath,
        priorResult: finalInput,
        startedAtIso,
        versionStore,
        workspaceRoot,
        options,
      });
    } else {
      requestCycleResult = await executeBenchmarkCycle({
        benchmarkCase,
        executionSurface,
        dependencies,
        toolRuntime: options.toolRuntime,
        prompt: benchmarkCase.prompt,
        inputPath: materialized.inputPath,
        priorResult: undefined,
        startedAtIso,
        versionStore,
        workspaceRoot,
        options,
      });
    }
  } catch (caughtError) {
    error = serializeBenchmarkError(caughtError);
  } finally {
    if (!options.preserveWorkspace) {
      await rm(workspaceRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  const finishedAt = new Date();
  const artifacts = {
    fixtureManifestPath,
    workspaceRoot,
    ...(sourceFixturePath === undefined ? {} : { sourceFixturePath }),
    ...(inputPath === undefined ? {} : { inputPath }),
    ...(fixture === undefined ? {} : { fixture }),
  };
  const scoreResult = scoreRequestCycleBenchmarkCase(
    benchmarkCase,
    requestCycleResult,
    error,
    setupResults,
  );

  if (requestCycleResult) {
    return {
      caseId: benchmarkCase.caseId,
      family: benchmarkCase.family,
      prompt: benchmarkCase.prompt,
      description: benchmarkCase.description,
      fixtureId: benchmarkCase.fixtureId,
      startedAt: startedAtIso,
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      executionSurface,
      status: "ok",
      artifacts,
      expectation: benchmarkCase.expectation,
      ...(setupResults === undefined ? {} : { setupResults }),
      requestCycleResult,
      ...scoreResult,
    };
  }

  return {
    caseId: benchmarkCase.caseId,
    family: benchmarkCase.family,
    prompt: benchmarkCase.prompt,
    description: benchmarkCase.description,
    fixtureId: benchmarkCase.fixtureId,
    startedAt: startedAtIso,
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    executionSurface,
    status: "error",
    artifacts,
    expectation: benchmarkCase.expectation,
    ...(setupResults === undefined ? {} : { setupResults }),
    ...(error === undefined ? {} : { error }),
    ...scoreResult,
  };
}

async function executeBenchmarkCycle(input: {
  benchmarkCase: RequestCycleBenchmarkCase;
  executionSurface: RequestCycleBenchmarkExecutionSurface;
  dependencies: OrchestrationDependencies | undefined;
  toolRuntime: ToolsRuntime | Partial<ToolsRuntime> | undefined;
  prompt: string;
  inputPath: string;
  priorResult: RequestCycleResult | undefined;
  startedAtIso: string;
  versionStore: Map<string, AudioVersion>;
  workspaceRoot: string;
  options: RunRequestCycleBenchmarkCaseOptions;
}): Promise<RequestCycleResult> {
  const interpretation = input.benchmarkCase.interpretation ?? input.options.interpretation;

  if (input.executionSurface === "tool") {
    return executeToolSurfaceCycle(input);
  }

  if (!input.dependencies) {
    throw new Error("Expected orchestration dependencies for orchestration benchmark execution.");
  }

  const cycleResult = await runRequestCycle({
    workspaceRoot: input.workspaceRoot,
    userRequest: input.prompt,
    input:
      input.priorResult === undefined
        ? {
            kind: "import",
            inputPath: input.inputPath,
            importOptions: {
              ...(input.options.importOptions ?? {}),
              importedAt: input.options.importedAt ?? input.startedAtIso,
              notes:
                input.options.importOptions?.notes ?? buildDefaultImportNotes(input.benchmarkCase),
            },
          }
        : {
            kind: "existing",
            asset: input.priorResult.asset,
            version: getRequestCycleActiveVersion(input.priorResult),
            sessionGraph: input.priorResult.sessionGraph,
          },
    ...(input.options.analysisOptions === undefined
      ? {}
      : { analysisOptions: input.options.analysisOptions }),
    ...(input.options.renderKind === undefined ? {} : { renderKind: input.options.renderKind }),
    ...(interpretation === undefined ? {} : { interpretation }),
    ...(input.options.revision === undefined ? {} : { revision: input.options.revision }),
    ...(input.options.sessionId === undefined ? {} : { sessionId: input.options.sessionId }),
    ...(input.options.branchId === undefined ? {} : { branchId: input.options.branchId }),
    dependencies: input.dependencies,
  });

  rememberRequestCycleVersions(cycleResult, input.versionStore);
  return cycleResult;
}

async function executeToolSurfaceCycle(input: {
  benchmarkCase: RequestCycleBenchmarkCase;
  toolRuntime: ToolsRuntime | Partial<ToolsRuntime> | undefined;
  prompt: string;
  inputPath: string;
  priorResult: RequestCycleResult | undefined;
  startedAtIso: string;
  versionStore: Map<string, AudioVersion>;
  workspaceRoot: string;
  options: RunRequestCycleBenchmarkCaseOptions;
}): Promise<RequestCycleResult> {
  const interpretation = input.benchmarkCase.interpretation ?? input.options.interpretation;
  const request: ToolRequest = {
    schema_version: "1.0.0",
    request_id: createToolRequestId(
      input.benchmarkCase.caseId,
      input.prompt,
      input.versionStore.size,
    ),
    tool_name: "run_request_cycle",
    requested_at: input.startedAtIso,
    ...(input.priorResult === undefined
      ? {}
      : {
          session_id: input.options.sessionId ?? input.priorResult.sessionGraph.session_id,
          asset_id: input.priorResult.asset.asset_id,
          version_id: getRequestCycleActiveVersion(input.priorResult).version_id,
        }),
    arguments: {
      user_request: input.prompt,
      input:
        input.priorResult === undefined
          ? {
              kind: "import",
              input_path: input.inputPath,
              import_options: {
                ...(input.options.importOptions?.outputDirectory === undefined
                  ? {}
                  : { output_directory: input.options.importOptions.outputDirectory }),
                ...(input.options.importOptions?.normalizationTarget === undefined
                  ? {}
                  : {
                      normalization_target: {
                        container_format:
                          input.options.importOptions.normalizationTarget.containerFormat,
                        codec: input.options.importOptions.normalizationTarget.codec,
                        sample_rate_hz:
                          input.options.importOptions.normalizationTarget.sampleRateHz,
                        channels: input.options.importOptions.normalizationTarget.channels,
                      },
                    }),
                ...(input.options.importOptions?.tags === undefined
                  ? {}
                  : { tags: input.options.importOptions.tags }),
                notes:
                  input.options.importOptions?.notes ??
                  buildDefaultImportNotes(input.benchmarkCase),
                imported_at: input.options.importedAt ?? input.startedAtIso,
              },
            }
          : {
              kind: "existing",
              asset: input.priorResult.asset,
              audio_version: getRequestCycleActiveVersion(input.priorResult),
              session_graph: input.priorResult.sessionGraph,
              available_versions: [...input.versionStore.values()],
            },
      ...(input.options.renderKind === undefined ? {} : { render_kind: input.options.renderKind }),
      ...(interpretation === undefined
        ? {}
        : {
            interpretation: {
              mode: "llm_assisted",
              ...(interpretation.apiKey === undefined ? {} : { api_key: interpretation.apiKey }),
              ...(interpretation.policy === undefined ? {} : { policy: interpretation.policy }),
              ...(interpretation.promptVersion === undefined
                ? {}
                : { prompt_version: interpretation.promptVersion }),
              provider:
                interpretation.provider.kind === "codex_cli"
                  ? {
                      kind: "codex_cli",
                      ...(interpretation.provider.model === undefined
                        ? {}
                        : { model: interpretation.provider.model }),
                      ...(interpretation.provider.codexPath === undefined
                        ? {}
                        : { codex_path: interpretation.provider.codexPath }),
                      ...(interpretation.provider.profile === undefined
                        ? {}
                        : { profile: interpretation.provider.profile }),
                      ...(interpretation.provider.timeoutMs === undefined
                        ? {}
                        : { timeout_ms: interpretation.provider.timeoutMs }),
                      ...(interpretation.provider.maxRetries === undefined
                        ? {}
                        : { max_retries: interpretation.provider.maxRetries }),
                    }
                  : {
                      kind: interpretation.provider.kind,
                      model: interpretation.provider.model,
                      ...(interpretation.provider.apiBaseUrl === undefined
                        ? {}
                        : { api_base_url: interpretation.provider.apiBaseUrl }),
                      ...(interpretation.provider.temperature === undefined
                        ? {}
                        : { temperature: interpretation.provider.temperature }),
                      ...(interpretation.provider.timeoutMs === undefined
                        ? {}
                        : { timeout_ms: interpretation.provider.timeoutMs }),
                      ...(interpretation.provider.maxRetries === undefined
                        ? {}
                        : { max_retries: interpretation.provider.maxRetries }),
                    },
            },
          }),
      ...(input.options.revision === undefined
        ? {}
        : { revision: { enabled: input.options.revision.enabled ?? true } }),
    },
  };

  const response = await executeToolRequest(request, {
    workspaceRoot: input.workspaceRoot,
    ...(input.toolRuntime === undefined ? {} : { runtime: input.toolRuntime }),
  });

  if (response.status === "error") {
    const stage =
      typeof response.error?.details?.stage === "string" ? response.error.details.stage : undefined;
    const details =
      response.error?.details && typeof response.error.details === "object"
        ? (response.error.details as Record<string, unknown>)
        : undefined;
    throw new ToolRequestCycleBenchmarkError(
      response.error?.message ?? "run_request_cycle failed.",
      {
        ...(stage === undefined ? {} : { stage }),
        ...(details === undefined ? {} : { details }),
      },
    );
  }

  const normalized = normalizeToolRequestCycleResult(response);
  rememberRequestCycleVersions(normalized, input.versionStore);
  return normalized;
}

function normalizeToolRequestCycleResult(
  response: Awaited<ReturnType<typeof executeToolRequest>>,
): RequestCycleResult {
  const result = response.result as Record<string, unknown>;
  if (result.result_kind === "clarification_required") {
    const followUpResolutionRecord = result.follow_up_resolution as Record<string, unknown>;
    return {
      result_kind: "clarification_required",
      asset: result.asset as RequestCycleResult["asset"],
      inputVersion: result.input_version as RequestCycleResult["inputVersion"],
      inputAnalysis: result.input_analysis as RequestCycleResult["inputAnalysis"],
      followUpResolution: {
        kind: "apply",
        resolvedUserRequest: String(followUpResolutionRecord.resolved_user_request),
        source: followUpResolutionRecord.source as Extract<
          RequestCycleResult["followUpResolution"],
          { kind: "apply" }
        >["source"],
        ...(followUpResolutionRecord.input_version_id === undefined
          ? {}
          : { inputVersionId: String(followUpResolutionRecord.input_version_id) }),
        ...(followUpResolutionRecord.branch_id === undefined
          ? {}
          : { branchId: String(followUpResolutionRecord.branch_id) }),
      },
      ...(result.semantic_profile === undefined
        ? {}
        : {
            semanticProfile: result.semantic_profile as NonNullable<
              RequestCycleResult["semanticProfile"]
            >,
          }),
      ...(result.intent_interpretation === undefined
        ? {}
        : {
            intentInterpretation: result.intent_interpretation as NonNullable<
              RequestCycleResult["intentInterpretation"]
            >,
          }),
      clarification: {
        question: String((result.clarification as Record<string, unknown>).question),
        pendingClarification: (result.clarification as Record<string, unknown>)
          .pending_clarification as unknown as ClarificationRequiredRequestCycleResult["clarification"]["pendingClarification"],
      },
      sessionGraph: result.session_graph as RequestCycleResult["sessionGraph"],
      trace: Array.isArray(result.trace)
        ? result.trace.map((entry) => {
            const traceEntry = entry as Record<string, unknown>;
            return {
              stage: traceEntry.stage as RequestCycleResult["trace"][number]["stage"],
              status: traceEntry.status as RequestCycleResult["trace"][number]["status"],
              started_at: String(traceEntry.started_at),
              completed_at: String(traceEntry.completed_at),
              attempts: Number(traceEntry.attempts),
              ...(traceEntry.pass === undefined ? {} : { pass: Number(traceEntry.pass) }),
              ...(traceEntry.message === undefined ? {} : { message: String(traceEntry.message) }),
            };
          })
        : [],
    };
  }

  const iterations = Array.isArray(result.iterations)
    ? result.iterations.map((iteration) => {
        const iterationRecord = iteration as Record<string, unknown>;
        const commands = Array.isArray(iterationRecord.commands)
          ? iterationRecord.commands.map((command) => {
              const commandRecord = command as Record<string, unknown>;
              return {
                executable: String(commandRecord.executable),
                args: Array.isArray(commandRecord.args)
                  ? commandRecord.args.map((entry) => String(entry))
                  : [],
                outputPath: String(commandRecord.output_path),
              };
            })
          : [];

        return {
          iteration: Number(iterationRecord.iteration),
          inputVersion: iterationRecord.input_version as RequestCycleResult["inputVersion"],
          outputVersion:
            iterationRecord.output_version as AppliedOrRevertedRequestCycleResult["outputVersion"],
          inputAnalysis: iterationRecord.input_analysis as RequestCycleResult["inputAnalysis"],
          outputAnalysis:
            iterationRecord.output_analysis as AppliedOrRevertedRequestCycleResult["outputAnalysis"],
          ...(iterationRecord.semantic_profile === undefined
            ? {}
            : {
                semanticProfile: iterationRecord.semantic_profile as NonNullable<
                  NonNullable<
                    AppliedOrRevertedRequestCycleResult["iterations"]
                  >[number]["semanticProfile"]
                >,
              }),
          editPlan: iterationRecord.edit_plan as NonNullable<
            AppliedOrRevertedRequestCycleResult["iterations"]
          >[number]["editPlan"],
          comparisonReport: iterationRecord.comparison_report as NonNullable<
            AppliedOrRevertedRequestCycleResult["iterations"]
          >[number]["comparisonReport"],
          transformResult: {
            outputVersion:
              iterationRecord.output_version as AppliedOrRevertedRequestCycleResult["outputVersion"],
            transformRecord: iterationRecord.transform_record as NonNullable<
              AppliedOrRevertedRequestCycleResult["iterations"]
            >[number]["transformResult"]["transformRecord"],
            commands,
            warnings: [],
          },
        };
      })
    : undefined;

  const commands = Array.isArray(result.commands)
    ? result.commands.map((command) => {
        const commandRecord = command as Record<string, unknown>;
        return {
          executable: String(commandRecord.executable),
          args: Array.isArray(commandRecord.args)
            ? commandRecord.args.map((entry) => String(entry))
            : [],
          outputPath: String(commandRecord.output_path),
        };
      })
    : [];

  const followUpResolutionRecord = result.follow_up_resolution as Record<string, unknown>;
  const followUpResolution =
    followUpResolutionRecord.kind === "revert"
      ? {
          kind: "revert" as const,
          targetVersionId: String(followUpResolutionRecord.target_version_id),
          source: followUpResolutionRecord.source as Extract<
            RequestCycleResult["followUpResolution"],
            { kind: "revert" }
          >["source"],
        }
      : {
          kind: "apply" as const,
          resolvedUserRequest: String(followUpResolutionRecord.resolved_user_request),
          source: followUpResolutionRecord.source as Extract<
            RequestCycleResult["followUpResolution"],
            { kind: "apply" }
          >["source"],
          ...(followUpResolutionRecord.input_version_id === undefined
            ? {}
            : { inputVersionId: String(followUpResolutionRecord.input_version_id) }),
          ...(followUpResolutionRecord.branch_id === undefined
            ? {}
            : { branchId: String(followUpResolutionRecord.branch_id) }),
        };

  return {
    result_kind: result.result_kind as AppliedOrRevertedRequestCycleResult["result_kind"],
    asset: result.asset as RequestCycleResult["asset"],
    inputVersion: result.input_version as RequestCycleResult["inputVersion"],
    inputAnalysis: result.input_analysis as RequestCycleResult["inputAnalysis"],
    followUpResolution,
    ...(iterations === undefined ? {} : { iterations }),
    ...(result.revision === undefined
      ? {}
      : {
          revision: {
            shouldRevise: Boolean((result.revision as Record<string, unknown>).should_revise),
            rationale: String((result.revision as Record<string, unknown>).rationale),
            source: (result.revision as Record<string, unknown>).source as NonNullable<
              AppliedOrRevertedRequestCycleResult["revision"]
            >["source"],
          },
        }),
    ...(result.semantic_profile === undefined
      ? {}
      : {
          semanticProfile: result.semantic_profile as NonNullable<
            RequestCycleResult["semanticProfile"]
          >,
        }),
    ...(result.edit_plan === undefined
      ? {}
      : {
          editPlan: result.edit_plan as NonNullable<
            AppliedOrRevertedRequestCycleResult["editPlan"]
          >,
        }),
    outputVersion: result.output_version as AppliedOrRevertedRequestCycleResult["outputVersion"],
    ...(result.transform_record === undefined
      ? {}
      : {
          transformResult: {
            outputVersion:
              result.output_version as AppliedOrRevertedRequestCycleResult["outputVersion"],
            transformRecord: result.transform_record as NonNullable<
              AppliedOrRevertedRequestCycleResult["transformResult"]
            >["transformRecord"],
            commands,
            warnings: [],
          },
        }),
    outputAnalysis: result.output_analysis as AppliedOrRevertedRequestCycleResult["outputAnalysis"],
    versionComparisonReport:
      result.version_comparison_report as AppliedOrRevertedRequestCycleResult["versionComparisonReport"],
    baselineRender: result.baseline_render as AppliedOrRevertedRequestCycleResult["baselineRender"],
    candidateRender:
      result.candidate_render as AppliedOrRevertedRequestCycleResult["candidateRender"],
    renderComparisonReport:
      result.render_comparison_report as AppliedOrRevertedRequestCycleResult["renderComparisonReport"],
    comparisonReport:
      result.render_comparison_report as AppliedOrRevertedRequestCycleResult["comparisonReport"],
    sessionGraph: result.session_graph as RequestCycleResult["sessionGraph"],
    trace: Array.isArray(result.trace)
      ? result.trace.map((entry) => {
          const traceEntry = entry as Record<string, unknown>;
          return {
            stage: traceEntry.stage as RequestCycleResult["trace"][number]["stage"],
            status: traceEntry.status as RequestCycleResult["trace"][number]["status"],
            started_at: String(traceEntry.started_at),
            completed_at: String(traceEntry.completed_at),
            attempts: Number(traceEntry.attempts),
            ...(traceEntry.pass === undefined ? {} : { pass: Number(traceEntry.pass) }),
            ...(traceEntry.message === undefined ? {} : { message: String(traceEntry.message) }),
          };
        })
      : [],
  };
}

function rememberRequestCycleVersions(
  result: RequestCycleResult,
  versionStore: Map<string, AudioVersion>,
): void {
  versionStore.set(result.inputVersion.version_id, result.inputVersion);

  if (result.result_kind !== "clarification_required") {
    versionStore.set(result.outputVersion.version_id, result.outputVersion);
  }

  if (!isAppliedOrRevertedRequestCycleResult(result)) {
    return;
  }

  for (const iteration of result.iterations ?? []) {
    versionStore.set(iteration.inputVersion.version_id, iteration.inputVersion);
    versionStore.set(iteration.outputVersion.version_id, iteration.outputVersion);
  }
}

function getRequestCycleActiveVersion(result: RequestCycleResult): AudioVersion {
  return result.result_kind === "clarification_required"
    ? result.inputVersion
    : result.outputVersion;
}

function createBenchmarkDependencies(
  versionStore: Map<string, AudioVersion>,
  overrides: RunRequestCycleBenchmarkCaseOptions["dependencies"] | undefined,
): OrchestrationDependencies {
  const baseDependencies: OrchestrationDependencies = {
    ...defaultOrchestrationDependencies,
    ...(overrides ?? {}),
  };

  const importAudioFromFile = async (
    ...args: Parameters<OrchestrationDependencies["importAudioFromFile"]>
  ) => {
    const result = await baseDependencies.importAudioFromFile(...args);
    versionStore.set(result.version.version_id, result.version as AudioVersion);
    return result;
  };

  const applyEditPlan = async (...args: Parameters<OrchestrationDependencies["applyEditPlan"]>) => {
    const result = await baseDependencies.applyEditPlan(...args);
    versionStore.set(args[0].version.version_id, args[0].version as AudioVersion);
    versionStore.set(result.outputVersion.version_id, result.outputVersion as AudioVersion);
    return result;
  };

  return {
    ...baseDependencies,
    importAudioFromFile,
    applyEditPlan,
    getAudioVersionById: async (input) => {
      const resolvedVersion = await baseDependencies.getAudioVersionById?.(input);
      return resolvedVersion ?? versionStore.get(input.versionId);
    },
  };
}

async function createBenchmarkWorkspaceRoot(
  caseId: string,
  baseWorkspaceRoot: string | undefined,
): Promise<string> {
  const root = path.resolve(baseWorkspaceRoot ?? os.tmpdir());
  await mkdir(root, { recursive: true });
  const prefix = path.join(root, `${slugify(caseId)}-request-cycle-benchmark-`);
  return mkdtemp(prefix);
}

function buildDefaultImportNotes(benchmarkCase: RequestCycleBenchmarkCase): string {
  return `request-cycle benchmark case ${benchmarkCase.caseId} for fixture ${benchmarkCase.fixtureId}`;
}

class ToolRequestCycleBenchmarkError extends Error {
  readonly stage?: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: { stage?: string; details?: Record<string, unknown> }) {
    super(message);
    this.name = "ToolRequestCycleBenchmarkError";
    if (options.stage !== undefined) {
      this.stage = options.stage;
    }
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

function serializeBenchmarkError(error: unknown): RequestCycleBenchmarkFailure {
  if (error instanceof ToolRequestCycleBenchmarkError) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stage === undefined ? {} : { stage: error.stage }),
      ...(error.details === undefined ? {} : { partialResult: error.details }),
      ...(typeof error.details?.failure_class === "string"
        ? { failureClass: error.details.failure_class }
        : {}),
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }

  if (error instanceof OrchestrationStageError) {
    return {
      name: error.name,
      message: error.message,
      stage: error.stage,
      attempts: error.attempts,
      ...(error.partialResult === undefined
        ? {}
        : { partialResult: error.partialResult as Record<string, unknown> }),
      ...(typeof error.cause === "object" &&
      error.cause !== null &&
      "failureClass" in error.cause &&
      typeof (error.cause as { failureClass?: unknown }).failureClass === "string"
        ? { failureClass: (error.cause as { failureClass: string }).failureClass }
        : {}),
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }

  return {
    name: "Error",
    message: String(error),
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function createToolRequestId(caseId: string, prompt: string, versionCount: number): string {
  const payload = `${slugify(caseId)}${slugify(prompt).replace(/-/g, "")}${versionCount}`;
  const compact = payload.replace(/[^a-z0-9]/g, "").slice(0, 24) || "requestcycle";
  return `toolreq_${compact}`;
}
