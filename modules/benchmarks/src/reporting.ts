import type { ComparisonBenchmarkCaseResult, ComparisonBenchmarkRunResult } from "./types.js";

export function formatBenchmarkMarkdownReport(result: ComparisonBenchmarkRunResult): string {
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
    lines.push(...formatCase(caseResult));
  }

  return lines.join("\n");
}

function formatCase(caseResult: ComparisonBenchmarkCaseResult): string[] {
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
