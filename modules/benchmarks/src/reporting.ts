import type { RequestCycleResult } from "@audio-language-interface/orchestration";

import type {
  ComparisonBenchmarkCaseResult,
  ComparisonBenchmarkRunResult,
  InterpretationBenchmarkCaseResult,
  InterpretationBenchmarkRunResult,
  LiveInterpretationBenchmarkCaseResult,
  LiveInterpretationBenchmarkRunResult,
  RequestCycleBenchmarkCaseResult,
  RequestCycleBenchmarkCategory,
  RequestCycleBenchmarkRunResult,
  RequestCycleFailureBucket,
  RequestCycleScoreBreakdown,
} from "./types.js";

function getRequestCyclePlannedOperations(result: RequestCycleResult | undefined): string[] {
  if (result === undefined || result.result_kind === "clarification_required") {
    return [];
  }

  return (
    result.editPlan?.steps
      .map((step) => step.operation)
      .filter((operation) => operation.length > 0) ?? []
  );
}

export function formatBenchmarkMarkdownReport(
  result:
    | ComparisonBenchmarkRunResult
    | InterpretationBenchmarkRunResult
    | LiveInterpretationBenchmarkRunResult
    | RequestCycleBenchmarkRunResult,
): string {
  switch (result.benchmarkMode) {
    case "comparison":
      return formatComparisonMarkdownReport(result);
    case "interpretation":
      return formatInterpretationMarkdownReport(result);
    case "live_interpretation":
      return formatLiveInterpretationMarkdownReport(result);
    case "request_cycle":
      return formatRequestCycleMarkdownReport(result);
  }
}

function formatComparisonMarkdownReport(result: ComparisonBenchmarkRunResult): string {
  const lines = [
    `# Benchmark Report: ${result.suiteId}`,
    "",
    `Fixture corpus: ${result.corpusId}`,
    "",
    `Overall score: ${result.overallScore.toFixed(3)} (${result.totalPassedChecks}/${result.totalChecks} checks passed)`,
    "",
    "## Cases",
  ];

  for (const caseResult of result.caseResults) {
    lines.push(...formatComparisonCase(caseResult));
  }

  const failedChecks = result.caseResults.flatMap((caseResult) =>
    caseResult.checks
      .filter((check) => !check.passed)
      .map((check) => `${check.checkId} (${caseResult.caseId})`),
  );
  if (failedChecks.length > 0) {
    lines.push("", "## Failure Buckets", ...failedChecks.map((failure) => `- ${failure}`));
  }

  return lines.join("\n");
}

function formatComparisonCase(caseResult: ComparisonBenchmarkCaseResult): string[] {
  return [
    `- ${caseResult.caseId}: ${caseResult.score.toFixed(3)} (${caseResult.passedChecks}/${caseResult.totalChecks})`,
    `  prompt: ${caseResult.prompt}`,
    `  fixtures: ${caseResult.fixtures.baselineFixtureId} -> ${caseResult.fixtures.candidateFixtureId}`,
    `  summary: ${caseResult.report.summary.plain_text}`,
    ...caseResult.checks.map(
      (check) =>
        `  [${check.passed ? "pass" : "fail"}] ${check.checkId} expected=${check.expected} actual=${check.actual}`,
    ),
  ];
}

function formatRequestCycleMarkdownReport(result: RequestCycleBenchmarkRunResult): string {
  const failureBuckets = aggregateFailureBuckets(result.caseResults);
  const breakdown = averageScoreBreakdown(result.caseResults);
  const lines = [
    `# Benchmark Report: ${result.suiteId}`,
    "",
    "Benchmark mode: request-cycle",
    "",
    `Fixture corpus: ${result.corpusId}`,
    "",
    `Overall score: ${result.overallScore.toFixed(3)} (${result.totalPassedChecks}/${result.totalChecks} checks passed)`,
    `Planner correctness: ${formatCategoryScoreLine(breakdown.plannerCorrectness)}`,
    `Outcome verification: ${formatCategoryScoreLine(breakdown.outcomeVerification)}`,
    `Regression avoidance: ${formatCategoryScoreLine(breakdown.regressionAvoidance)}`,
    `Session provenance: ${formatCategoryScoreLine(breakdown.sessionProvenance)}`,
    "",
    "## Failure Buckets",
    ...formatFailureBucketSection("planner_correctness", failureBuckets),
    ...formatFailureBucketSection("outcome_verification", failureBuckets),
    ...formatFailureBucketSection("regression_avoidance", failureBuckets),
    ...formatFailureBucketSection("session_provenance", failureBuckets),
    "",
    "## Cases",
  ];

  for (const caseResult of result.caseResults) {
    lines.push(...formatRequestCycleCase(caseResult));
  }

  return lines.join("\n");
}

function formatInterpretationMarkdownReport(result: InterpretationBenchmarkRunResult): string {
  const failedChecks = result.caseResults.flatMap((caseResult) =>
    caseResult.checks
      .filter((check) => !check.passed)
      .map((check) => `${check.checkId} (${caseResult.caseId})`),
  );
  const lines = [
    `# Benchmark Report: ${result.suiteId}`,
    "",
    "Benchmark mode: interpretation",
    "",
    `Corpus: ${result.corpusId}`,
    "",
    `Overall score: ${result.overallScore.toFixed(3)} (${result.totalPassedChecks}/${result.totalChecks} checks passed)`,
    "",
    "## Cases",
  ];

  for (const caseResult of result.caseResults) {
    lines.push(...formatInterpretationCase(caseResult));
  }

  if (failedChecks.length > 0) {
    lines.push("", "## Failure Buckets", ...failedChecks.map((failure) => `- ${failure}`));
  }

  return lines.join("\n");
}

function formatLiveInterpretationMarkdownReport(
  result: LiveInterpretationBenchmarkRunResult,
): string {
  const lines = [
    `# Benchmark Report: ${result.suiteId}`,
    "",
    "Benchmark mode: live-interpretation",
    "",
    `Corpus: ${result.corpusId}`,
    "",
    `Overall score: ${result.overallScore.toFixed(3)} (${result.totalPassedChecks}/${result.totalChecks} checks passed)`,
    `Provider runs: ${result.succeededProviderRuns}/${result.totalProviderRuns} succeeded`,
    `Total duration: ${result.totalDurationMs} ms`,
    "",
    "## Providers",
    ...result.providerSummaries.map(
      (summary) =>
        `- ${summary.provider}/${summary.model}${summary.label === undefined ? "" : ` (${summary.label})`}: ${summary.overallScore.toFixed(3)} (${summary.totalPassedChecks}/${summary.totalChecks}), avg ${summary.averageDurationMs} ms, failures ${summary.failedRuns}/${summary.totalRuns}`,
    ),
    "",
    "## Cases",
  ];

  for (const caseResult of result.caseResults) {
    lines.push(...formatLiveInterpretationCase(caseResult));
  }

  return lines.join("\n");
}

function formatFailureBucketSection(
  category: RequestCycleBenchmarkCategory,
  failureBuckets: RequestCycleFailureBucket[],
): string[] {
  const title = categoryTitle(category);
  const matchingBuckets = failureBuckets.filter((bucket) => bucket.category === category);

  if (matchingBuckets.length === 0) {
    return [`### ${title}`, "- no failures"];
  }

  return [
    `### ${title}`,
    ...matchingBuckets.map(
      (bucket) =>
        `- ${bucket.label}: ${bucket.failedChecks} failed check${bucket.failedChecks === 1 ? "" : "s"}`,
    ),
  ];
}

function formatRequestCycleCase(caseResult: RequestCycleBenchmarkCaseResult): string[] {
  const requestCycleResult = caseResult.requestCycleResult;
  const lines = [
    `### ${caseResult.caseId}`,
    "",
    `- score: ${caseResult.score.toFixed(3)} (${caseResult.passedChecks}/${caseResult.totalChecks})`,
    `- prompt: ${caseResult.prompt}`,
    `- status: ${caseResult.status}`,
    `- fixture: ${caseResult.fixtureId}`,
    `- result kind: ${requestCycleResult?.result_kind ?? "missing"}`,
    `- planner correctness: ${formatCategoryScoreLine(caseResult.scoreBreakdown.plannerCorrectness)}`,
    `- outcome verification: ${formatCategoryScoreLine(caseResult.scoreBreakdown.outcomeVerification)}`,
    `- regression avoidance: ${formatCategoryScoreLine(caseResult.scoreBreakdown.regressionAvoidance)}`,
    `- session provenance: ${formatCategoryScoreLine(caseResult.scoreBreakdown.sessionProvenance)}`,
  ];

  if (caseResult.error !== undefined) {
    lines.push(`- error stage: ${caseResult.error.stage ?? "missing"}`);
    if (caseResult.error.failureClass !== undefined) {
      lines.push(`- failure class: ${caseResult.error.failureClass}`);
    }
    lines.push(`- error: ${caseResult.error.message}`);
  }

  const plannedOperations = getRequestCyclePlannedOperations(requestCycleResult);
  lines.push(
    `- planned operations: ${plannedOperations.length === 0 ? "none" : plannedOperations.join(", ")}`,
  );

  const outcomeSignal = describeOutcomeSignal(caseResult);
  if (outcomeSignal !== undefined) {
    lines.push(`- outcome signal: ${outcomeSignal}`);
  }

  if (requestCycleResult?.result_kind === "clarification_required") {
    lines.push(`- clarification question: ${requestCycleResult.clarification.question}`);
  }

  const regressionSummary = describeRegressionSummary(caseResult);
  lines.push(`- regressions: ${regressionSummary}`);

  const failedChecks = caseResult.checks.filter((check) => !check.passed);
  if (failedChecks.length === 0) {
    lines.push("- failures: none");
    lines.push("");
    return lines;
  }

  lines.push("- failures:");
  lines.push(
    ...failedChecks.map(
      (check) =>
        `  - [${categoryTitle(check.category)}] ${check.checkId} expected=${check.expected} actual=${check.actual}`,
    ),
  );
  lines.push("");
  return lines;
}

function formatInterpretationCase(caseResult: InterpretationBenchmarkCaseResult): string[] {
  return [
    `- ${caseResult.caseId}: ${caseResult.score.toFixed(3)} (${caseResult.passedChecks}/${caseResult.totalChecks})`,
    `  prompt: ${caseResult.prompt}`,
    `  interpretation policy: ${caseResult.interpretation.interpretation_policy}`,
    `  normalized request: ${caseResult.interpretation.normalized_request}`,
    `  request classification: ${caseResult.interpretation.request_classification}`,
    `  next action: ${caseResult.interpretation.next_action}`,
    ...caseResult.checks.map(
      (check) =>
        `  [${check.passed ? "pass" : "fail"}] ${check.checkId} expected=${check.expected} actual=${check.actual}`,
    ),
  ];
}

function formatLiveInterpretationCase(caseResult: LiveInterpretationBenchmarkCaseResult): string[] {
  const lines = [
    `### ${caseResult.caseId}`,
    "",
    `- score: ${caseResult.score.toFixed(3)} (${caseResult.totalPassedChecks}/${caseResult.totalChecks})`,
    `- prompt: ${caseResult.prompt}`,
  ];

  for (const providerResult of caseResult.providerResults) {
    lines.push(
      `- ${providerResult.provider}/${providerResult.model}${providerResult.label === undefined ? "" : ` (${providerResult.label})`}: ${providerResult.status} ${providerResult.score.toFixed(3)} (${providerResult.passedChecks}/${providerResult.totalChecks}), ${providerResult.durationMs} ms${providerResult.cached ? ", cached" : ""}`,
    );

    if (providerResult.interpretation !== undefined) {
      lines.push(`  normalized request: ${providerResult.interpretation.normalized_request}`);
      lines.push(`  next action: ${providerResult.interpretation.next_action}`);
      lines.push(
        `  request classification: ${providerResult.interpretation.request_classification}`,
      );
    }

    if (providerResult.error !== undefined) {
      lines.push(`  error: ${providerResult.error.failureClass} ${providerResult.error.message}`);
    }

    lines.push(
      ...providerResult.checks.map(
        (check) =>
          `  [${check.passed ? "pass" : "fail"}] ${check.checkId} expected=${check.expected} actual=${check.actual}`,
      ),
    );
  }

  lines.push("");
  return lines;
}

function aggregateFailureBuckets(
  caseResults: RequestCycleBenchmarkCaseResult[],
): RequestCycleFailureBucket[] {
  const buckets = new Map<string, RequestCycleFailureBucket>();

  for (const caseResult of caseResults) {
    for (const bucket of caseResult.failureBuckets) {
      const existing = buckets.get(bucket.bucketId);
      if (existing !== undefined) {
        existing.failedChecks += bucket.failedChecks;
        continue;
      }

      buckets.set(bucket.bucketId, { ...bucket });
    }
  }

  return [...buckets.values()].sort(
    (left, right) =>
      right.failedChecks - left.failedChecks || left.label.localeCompare(right.label),
  );
}

function averageScoreBreakdown(
  caseResults: RequestCycleBenchmarkCaseResult[],
): RequestCycleScoreBreakdown {
  if (caseResults.length === 0) {
    return {
      plannerCorrectness: { passedChecks: 0, totalChecks: 0, score: 1 },
      outcomeVerification: { passedChecks: 0, totalChecks: 0, score: 1 },
      regressionAvoidance: { passedChecks: 0, totalChecks: 0, score: 1 },
      sessionProvenance: { passedChecks: 0, totalChecks: 0, score: 1 },
    };
  }

  const plannerCorrectness = sumCategory(caseResults, "plannerCorrectness");
  const outcomeVerification = sumCategory(caseResults, "outcomeVerification");
  const regressionAvoidance = sumCategory(caseResults, "regressionAvoidance");
  const sessionProvenance = sumCategory(caseResults, "sessionProvenance");

  return {
    plannerCorrectness,
    outcomeVerification,
    regressionAvoidance,
    sessionProvenance,
  };
}

function sumCategory(
  caseResults: RequestCycleBenchmarkCaseResult[],
  key: keyof RequestCycleScoreBreakdown,
) {
  const passedChecks = caseResults.reduce(
    (sum, caseResult) => sum + caseResult.scoreBreakdown[key].passedChecks,
    0,
  );
  const totalChecks = caseResults.reduce(
    (sum, caseResult) => sum + caseResult.scoreBreakdown[key].totalChecks,
    0,
  );

  return {
    passedChecks,
    totalChecks,
    score: totalChecks === 0 ? 1 : Math.round((passedChecks / totalChecks) * 1000) / 1000,
  };
}

function formatCategoryScoreLine(value: {
  passedChecks: number;
  totalChecks: number;
  score: number;
}): string {
  return `${value.score.toFixed(3)} (${value.passedChecks}/${value.totalChecks})`;
}

function describeOutcomeSignal(caseResult: RequestCycleBenchmarkCaseResult): string | undefined {
  const requestCycleResult = caseResult.requestCycleResult;
  if (requestCycleResult === undefined) {
    return undefined;
  }

  if (requestCycleResult.result_kind === "clarification_required") {
    return undefined;
  }

  const versionBasis = requestCycleResult.versionComparisonReport?.evaluation_basis;
  if (versionBasis !== undefined) {
    return `${versionBasis.goal_evaluation_source} via version comparison (${versionBasis.authoritative_signal})`;
  }

  const renderBasis =
    requestCycleResult.renderComparisonReport?.evaluation_basis ??
    requestCycleResult.comparisonReport?.evaluation_basis;
  if (renderBasis !== undefined) {
    return `${renderBasis.goal_evaluation_source} via render comparison (${renderBasis.authoritative_signal})`;
  }

  return undefined;
}

function describeRegressionSummary(caseResult: RequestCycleBenchmarkCaseResult): string {
  const requestCycleResult = caseResult.requestCycleResult;
  if (
    requestCycleResult === undefined ||
    requestCycleResult.result_kind === "clarification_required"
  ) {
    return "none";
  }

  const regressionKinds = [
    ...(requestCycleResult.versionComparisonReport?.regressions ?? []).map((item) => item.kind),
    ...(
      requestCycleResult.renderComparisonReport?.regressions ??
      requestCycleResult.comparisonReport?.regressions ??
      []
    ).map((item) => item.kind),
  ];

  return regressionKinds.length === 0 ? "none" : [...new Set(regressionKinds)].join(", ");
}

function categoryTitle(category: RequestCycleBenchmarkCategory): string {
  switch (category) {
    case "planner_correctness":
      return "Planner Correctness";
    case "outcome_verification":
      return "Outcome Verification";
    case "regression_avoidance":
      return "Regression Avoidance";
    case "session_provenance":
      return "Session Provenance";
  }
}
