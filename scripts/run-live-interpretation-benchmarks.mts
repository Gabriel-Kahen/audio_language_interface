import {
  formatBenchmarkMarkdownReport,
  liveInterpretationBenchmarkCorpus,
  runLiveInterpretationBenchmarks,
} from "../modules/benchmarks/src/index.ts";

function readProviderTargets() {
  const requestedProviders = new Set(
    (process.env.LIVE_INTERPRETATION_PROVIDERS ?? "openai,google")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
  const providerTargets = [];

  if (requestedProviders.has("openai")) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      providerTargets.push({
        kind: "openai" as const,
        model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
        apiKey,
        ...(process.env.OPENAI_BASE_URL === undefined
          ? {}
          : { baseUrl: process.env.OPENAI_BASE_URL }),
      });
    }
  }

  if (requestedProviders.has("google")) {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (apiKey) {
      providerTargets.push({
        kind: "google" as const,
        model: process.env.GOOGLE_MODEL ?? "gemini-2.5-flash",
        apiKey,
        ...(process.env.GOOGLE_BASE_URL === undefined
          ? {}
          : { baseUrl: process.env.GOOGLE_BASE_URL }),
      });
    }
  }

  if (requestedProviders.has("codex_cli")) {
    providerTargets.push({
      kind: "codex_cli" as const,
      ...(process.env.CODEX_CLI_MODEL === undefined ? {} : { model: process.env.CODEX_CLI_MODEL }),
      ...(process.env.CODEX_CLI_PATH === undefined
        ? {}
        : { codexPath: process.env.CODEX_CLI_PATH }),
      ...(process.env.CODEX_CLI_PROFILE === undefined
        ? {}
        : { profile: process.env.CODEX_CLI_PROFILE }),
      ...(process.env.CODEX_CLI_TIMEOUT_MS === undefined
        ? {}
        : { timeoutMs: Number(process.env.CODEX_CLI_TIMEOUT_MS) }),
      ...(process.env.CODEX_CLI_MAX_RETRIES === undefined
        ? {}
        : { maxRetries: Number(process.env.CODEX_CLI_MAX_RETRIES) }),
    });
  }

  if (providerTargets.length === 0) {
    throw new Error(
      "No live interpretation providers configured. Set OPENAI_API_KEY, GOOGLE_API_KEY, and/or enable codex_cli with local Codex auth.",
    );
  }

  return providerTargets;
}

async function main() {
  const requestedCaseIds = new Set(
    (process.env.LIVE_INTERPRETATION_CASES ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );

  const result = await runLiveInterpretationBenchmarks(liveInterpretationBenchmarkCorpus, {
    providerTargets: readProviderTargets(),
    continueOnProviderError: true,
    ...(requestedCaseIds.size === 0
      ? {}
      : {
          caseFilter: (benchmarkCase) => requestedCaseIds.has(benchmarkCase.caseId),
        }),
  });

  process.stdout.write(`${formatBenchmarkMarkdownReport(result)}\n`);

  if (result.failedProviderRuns > 0 || result.totalPassedChecks !== result.totalChecks) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
