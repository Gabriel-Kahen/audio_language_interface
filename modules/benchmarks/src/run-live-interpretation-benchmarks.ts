import {
  interpretRequest as defaultInterpretRequest,
  type IntentInterpretation,
} from "@audio-language-interface/interpretation";

import {
  LIVE_INTERPRETATION_CORPUS_ID,
  liveInterpretationBenchmarkCorpus,
} from "./prompt-suite.js";
import { scoreLiveInterpretationBenchmarkProviderResult } from "./scoring.js";
import type {
  LiveInterpretationBenchmarkCase,
  LiveInterpretationBenchmarkCaseResult,
  LiveInterpretationBenchmarkCorpus,
  LiveInterpretationBenchmarkError,
  LiveInterpretationBenchmarkProviderResult,
  LiveInterpretationBenchmarkProviderTarget,
  LiveInterpretationBenchmarkRunResult,
  LiveInterpretationProviderSummary,
  RunLiveInterpretationBenchmarksOptions,
} from "./types.js";

export async function runLiveInterpretationBenchmarks(
  benchmarkInput:
    | LiveInterpretationBenchmarkCorpus
    | LiveInterpretationBenchmarkCase[] = liveInterpretationBenchmarkCorpus,
  options: RunLiveInterpretationBenchmarksOptions,
): Promise<LiveInterpretationBenchmarkRunResult> {
  const benchmarkCases = Array.isArray(benchmarkInput) ? benchmarkInput : benchmarkInput.cases;
  const filteredCases =
    options.caseFilter === undefined ? benchmarkCases : benchmarkCases.filter(options.caseFilter);
  const interpret = options.interpretRequest ?? defaultInterpretRequest;
  const runStartedAt = Date.now();
  const caseResults: LiveInterpretationBenchmarkCaseResult[] = [];

  for (const benchmarkCase of filteredCases) {
    const providerResults: LiveInterpretationBenchmarkProviderResult[] = [];
    const allowedProviders = new Set(benchmarkCase.providerAllowlist ?? []);

    for (const providerTarget of options.providerTargets) {
      if (allowedProviders.size > 0 && !allowedProviders.has(providerTarget.kind)) {
        continue;
      }

      const startedAt = new Date().toISOString();
      const startedMs = Date.now();

      try {
        const interpretation = await interpret({
          userRequest: benchmarkCase.prompt,
          audioVersion: benchmarkCase.input.audioVersion,
          analysisReport: benchmarkCase.input.analysisReport,
          semanticProfile: benchmarkCase.input.semanticProfile,
          provider: providerTarget,
          policy: benchmarkCase.input.policy,
          ...(benchmarkCase.input.capabilityManifest === undefined
            ? {}
            : { capabilityManifest: benchmarkCase.input.capabilityManifest }),
          ...(benchmarkCase.input.sessionContext === undefined
            ? {}
            : { sessionContext: benchmarkCase.input.sessionContext }),
          ...(benchmarkCase.input.promptVersion === undefined
            ? {}
            : { promptVersion: benchmarkCase.input.promptVersion }),
          ...(options.generatedAt === undefined ? {} : { generatedAt: options.generatedAt }),
          ...(options.cacheStore === undefined ? {} : { cacheStore: options.cacheStore }),
        });
        const finishedAt = new Date().toISOString();
        const durationMs = Date.now() - startedMs;
        providerResults.push(
          buildProviderResult({
            benchmarkCase,
            providerTarget,
            interpretation,
            startedAt,
            finishedAt,
            durationMs,
          }),
        );
      } catch (error) {
        const finishedAt = new Date().toISOString();
        const durationMs = Date.now() - startedMs;
        const providerResult = buildProviderErrorResult({
          benchmarkCase,
          providerTarget,
          error: normalizeLiveInterpretationError(error),
          startedAt,
          finishedAt,
          durationMs,
        });
        providerResults.push(providerResult);

        if (options.continueOnProviderError === false) {
          throw error;
        }
      }
    }

    const totalPassedChecks = providerResults.reduce((sum, item) => sum + item.passedChecks, 0);
    const totalChecks = providerResults.reduce((sum, item) => sum + item.totalChecks, 0);

    caseResults.push({
      caseId: benchmarkCase.caseId,
      prompt: benchmarkCase.prompt,
      description: benchmarkCase.description,
      providerResults,
      totalPassedChecks,
      totalChecks,
      score: totalChecks === 0 ? 1 : roundScore(totalPassedChecks / totalChecks),
    });
  }

  const totalProviderRuns = caseResults.reduce(
    (sum, caseResult) => sum + caseResult.providerResults.length,
    0,
  );
  const succeededProviderRuns = caseResults.reduce(
    (sum, caseResult) =>
      sum + caseResult.providerResults.filter((item) => item.status === "ok").length,
    0,
  );
  const failedProviderRuns = totalProviderRuns - succeededProviderRuns;
  const totalPassedChecks = caseResults.reduce((sum, item) => sum + item.totalPassedChecks, 0);
  const totalChecks = caseResults.reduce((sum, item) => sum + item.totalChecks, 0);
  const totalDurationMs = caseResults.reduce(
    (sum, caseResult) =>
      sum + caseResult.providerResults.reduce((inner, item) => inner + item.durationMs, 0),
    0,
  );

  return {
    benchmarkMode: "live_interpretation",
    suiteId: Array.isArray(benchmarkInput)
      ? (filteredCases[0]?.family ?? "live_intent_interpretation")
      : benchmarkInput.suiteId,
    corpusId: Array.isArray(benchmarkInput)
      ? LIVE_INTERPRETATION_CORPUS_ID
      : benchmarkInput.corpusId,
    caseResults,
    providerSummaries: summarizeProviders(caseResults),
    totalCases: caseResults.length,
    totalProviderRuns,
    succeededProviderRuns,
    failedProviderRuns,
    totalPassedChecks,
    totalChecks,
    overallScore: totalChecks === 0 ? 1 : roundScore(totalPassedChecks / totalChecks),
    totalDurationMs: totalDurationMs > 0 ? totalDurationMs : Date.now() - runStartedAt,
  };
}

function buildProviderResult(input: {
  benchmarkCase: LiveInterpretationBenchmarkCase;
  providerTarget: LiveInterpretationBenchmarkProviderTarget;
  interpretation: IntentInterpretation;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}): LiveInterpretationBenchmarkProviderResult {
  const scored = scoreLiveInterpretationBenchmarkProviderResult(input.benchmarkCase, {
    status: "ok",
    interpretation: input.interpretation,
  });

  return {
    provider: input.providerTarget.kind,
    model: getProviderTargetModelLabel(input.providerTarget),
    ...(input.providerTarget.label === undefined ? {} : { label: input.providerTarget.label }),
    policy: input.benchmarkCase.input.policy,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationMs: input.durationMs,
    status: "ok",
    cached: input.interpretation.provider.cached ?? false,
    interpretation: input.interpretation,
    ...scored,
  };
}

function buildProviderErrorResult(input: {
  benchmarkCase: LiveInterpretationBenchmarkCase;
  providerTarget: LiveInterpretationBenchmarkProviderTarget;
  error: LiveInterpretationBenchmarkError;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}): LiveInterpretationBenchmarkProviderResult {
  const scored = scoreLiveInterpretationBenchmarkProviderResult(input.benchmarkCase, {
    status: "error",
    error: input.error,
  });

  return {
    provider: input.providerTarget.kind,
    model: getProviderTargetModelLabel(input.providerTarget),
    ...(input.providerTarget.label === undefined ? {} : { label: input.providerTarget.label }),
    policy: input.benchmarkCase.input.policy,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationMs: input.durationMs,
    status: "error",
    cached: false,
    error: input.error,
    ...scored,
  };
}

function getProviderTargetModelLabel(providerTarget: LiveInterpretationBenchmarkProviderTarget) {
  if (providerTarget.kind === "codex_cli") {
    return providerTarget.model ?? providerTarget.profile ?? "codex-cli-default";
  }

  return providerTarget.model;
}

function summarizeProviders(
  caseResults: LiveInterpretationBenchmarkCaseResult[],
): LiveInterpretationProviderSummary[] {
  const summaries = new Map<string, LiveInterpretationProviderSummary>();

  for (const caseResult of caseResults) {
    for (const providerResult of caseResult.providerResults) {
      const key = `${providerResult.provider}:${providerResult.model}:${providerResult.label ?? ""}`;
      const existing = summaries.get(key);
      if (existing !== undefined) {
        existing.totalRuns += 1;
        existing.succeededRuns += providerResult.status === "ok" ? 1 : 0;
        existing.failedRuns += providerResult.status === "error" ? 1 : 0;
        existing.totalPassedChecks += providerResult.passedChecks;
        existing.totalChecks += providerResult.totalChecks;
        existing.averageDurationMs += providerResult.durationMs;
        continue;
      }

      summaries.set(key, {
        provider: providerResult.provider,
        model: providerResult.model,
        ...(providerResult.label === undefined ? {} : { label: providerResult.label }),
        totalRuns: 1,
        succeededRuns: providerResult.status === "ok" ? 1 : 0,
        failedRuns: providerResult.status === "error" ? 1 : 0,
        totalPassedChecks: providerResult.passedChecks,
        totalChecks: providerResult.totalChecks,
        overallScore:
          providerResult.totalChecks === 0
            ? 1
            : roundScore(providerResult.passedChecks / providerResult.totalChecks),
        averageDurationMs: providerResult.durationMs,
      });
    }
  }

  return [...summaries.values()]
    .map((summary) => ({
      ...summary,
      overallScore:
        summary.totalChecks === 0 ? 1 : roundScore(summary.totalPassedChecks / summary.totalChecks),
      averageDurationMs: Math.round(summary.averageDurationMs / summary.totalRuns),
    }))
    .sort(
      (left, right) =>
        left.provider.localeCompare(right.provider) ||
        left.model.localeCompare(right.model) ||
        (left.label ?? "").localeCompare(right.label ?? ""),
    );
}

function normalizeLiveInterpretationError(error: unknown): LiveInterpretationBenchmarkError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
      failureClass: classifyInterpretationError(error),
    };
  }

  return {
    name: "Error",
    message: String(error),
    failureClass: "provider_error",
  };
}

function classifyInterpretationError(
  error: Error,
): LiveInterpretationBenchmarkError["failureClass"] {
  if (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    /timed out|timeout/i.test(error.message)
  ) {
    return "timeout";
  }

  if (
    /schema validation failed|structured content|Failed to parse interpretation candidate JSON|Interpretation candidate validation failed/i.test(
      error.message,
    )
  ) {
    return "schema_invalid";
  }

  if (/AudioVersion|AnalysisReport|SemanticProfile|capability manifest/i.test(error.message)) {
    return "validation_error";
  }

  return "provider_error";
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
