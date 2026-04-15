import type { ComparisonReport } from "@audio-language-interface/compare";

import type {
  BenchmarkCheckResult,
  ComparisonBenchmarkCase,
  ComparisonBenchmarkCaseResult,
  ComparisonBenchmarkExpectation,
} from "./types.js";

export function scoreComparisonBenchmarkCase(
  benchmarkCase: ComparisonBenchmarkCase,
  report: ComparisonReport,
): ComparisonBenchmarkCaseResult {
  const checks = scoreComparisonReport(report, benchmarkCase.expectation);
  const passedChecks = checks.filter((check) => check.passed).length;
  const totalChecks = checks.length;

  return {
    caseId: benchmarkCase.caseId,
    prompt: benchmarkCase.prompt,
    report,
    passedChecks,
    totalChecks,
    score: totalChecks === 0 ? 1 : roundScore(passedChecks / totalChecks),
    checks,
  };
}

export function scoreComparisonReport(
  report: ComparisonReport,
  expectation: ComparisonBenchmarkExpectation,
): BenchmarkCheckResult[] {
  const checks: BenchmarkCheckResult[] = [];
  const semanticLabels = new Set(report.semantic_deltas?.map((item) => item.label) ?? []);
  const regressionKinds = new Set(report.regressions?.map((item) => item.kind) ?? []);
  const goalStatuses = new Map(
    report.goal_alignment?.map((item) => [item.goal, item.status]) ?? [],
  );

  for (const [goal, expectedStatus] of Object.entries(expectation.goalStatuses ?? {})) {
    const actualStatus = goalStatuses.get(goal) ?? "missing";
    checks.push({
      checkId: `goal:${goal}`,
      passed: actualStatus === expectedStatus,
      expected: expectedStatus,
      actual: actualStatus,
    });
  }

  for (const label of expectation.requiredSemanticLabels ?? []) {
    checks.push({
      checkId: `semantic:require:${label}`,
      passed: semanticLabels.has(label),
      expected: "present",
      actual: semanticLabels.has(label) ? "present" : "missing",
    });
  }

  for (const label of expectation.forbiddenSemanticLabels ?? []) {
    checks.push({
      checkId: `semantic:forbid:${label}`,
      passed: !semanticLabels.has(label),
      expected: "absent",
      actual: semanticLabels.has(label) ? "present" : "absent",
    });
  }

  for (const kind of expectation.requiredRegressionKinds ?? []) {
    checks.push({
      checkId: `regression:require:${kind}`,
      passed: regressionKinds.has(kind),
      expected: "present",
      actual: regressionKinds.has(kind) ? "present" : "missing",
    });
  }

  for (const kind of expectation.forbiddenRegressionKinds ?? []) {
    checks.push({
      checkId: `regression:forbid:${kind}`,
      passed: !regressionKinds.has(kind),
      expected: "absent",
      actual: regressionKinds.has(kind) ? "present" : "absent",
    });
  }

  return checks;
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
