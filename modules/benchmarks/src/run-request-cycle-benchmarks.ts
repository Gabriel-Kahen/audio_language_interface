import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  type AudioVersion,
  defaultOrchestrationDependencies,
  type OrchestrationDependencies,
  OrchestrationStageError,
  type RequestCycleResult,
  runRequestCycle,
} from "@audio-language-interface/orchestration";

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
  const workspaceRoot = await createBenchmarkWorkspaceRoot(
    benchmarkCase.caseId,
    options.workspaceRoot,
  );
  const versionStore = new Map<string, AudioVersion>();
  const dependencies = createBenchmarkDependencies(versionStore, options.dependencies);

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
        const cycleResult = await runRequestCycle({
          workspaceRoot,
          userRequest: setupPrompt,
          input:
            priorResult === undefined
              ? {
                  kind: "import",
                  inputPath: materialized.inputPath,
                  importOptions: {
                    ...(options.importOptions ?? {}),
                    importedAt: options.importedAt ?? startedAtIso,
                    notes: options.importOptions?.notes ?? buildDefaultImportNotes(benchmarkCase),
                  },
                }
              : {
                  kind: "existing",
                  asset: priorResult.asset,
                  version: priorResult.outputVersion,
                  sessionGraph: priorResult.sessionGraph,
                },
          ...(options.analysisOptions === undefined
            ? {}
            : { analysisOptions: options.analysisOptions }),
          ...(options.renderKind === undefined ? {} : { renderKind: options.renderKind }),
          ...(options.revision === undefined ? {} : { revision: options.revision }),
          ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
          ...(options.branchId === undefined ? {} : { branchId: options.branchId }),
          dependencies,
        });

        setupResults.push(cycleResult);
        priorResult = cycleResult;
      }

      const finalInput = priorResult;
      if (!finalInput) {
        throw new Error("Expected a setup result before running the final benchmark prompt.");
      }

      requestCycleResult = await runRequestCycle({
        workspaceRoot,
        userRequest: benchmarkCase.prompt,
        input: {
          kind: "existing",
          asset: finalInput.asset,
          version: finalInput.outputVersion,
          sessionGraph: finalInput.sessionGraph,
        },
        ...(options.analysisOptions === undefined
          ? {}
          : { analysisOptions: options.analysisOptions }),
        ...(options.renderKind === undefined ? {} : { renderKind: options.renderKind }),
        ...(options.revision === undefined ? {} : { revision: options.revision }),
        ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
        ...(options.branchId === undefined ? {} : { branchId: options.branchId }),
        dependencies,
      });
    } else {
      requestCycleResult = await runRequestCycle({
        workspaceRoot,
        userRequest: benchmarkCase.prompt,
        input: {
          kind: "import",
          inputPath: materialized.inputPath,
          importOptions: {
            ...(options.importOptions ?? {}),
            importedAt: options.importedAt ?? startedAtIso,
            notes: options.importOptions?.notes ?? buildDefaultImportNotes(benchmarkCase),
          },
        },
        ...(options.analysisOptions === undefined
          ? {}
          : { analysisOptions: options.analysisOptions }),
        ...(options.renderKind === undefined ? {} : { renderKind: options.renderKind }),
        ...(options.revision === undefined ? {} : { revision: options.revision }),
        ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
        ...(options.branchId === undefined ? {} : { branchId: options.branchId }),
        dependencies,
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
    status: "error",
    artifacts,
    expectation: benchmarkCase.expectation,
    ...(setupResults === undefined ? {} : { setupResults }),
    ...(error === undefined ? {} : { error }),
    ...scoreResult,
  };
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

function serializeBenchmarkError(error: unknown): RequestCycleBenchmarkFailure {
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
