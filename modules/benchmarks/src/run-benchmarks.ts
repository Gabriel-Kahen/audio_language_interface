import { compareVersions } from "@audio-language-interface/compare";

import { firstPromptFamilyPromptSuite } from "./prompt-suite.js";
import { scoreComparisonBenchmarkCase } from "./scoring.js";
import type {
  ComparisonBenchmarkCase,
  ComparisonBenchmarkCaseResult,
  ComparisonBenchmarkRunResult,
} from "./types.js";

export function runComparisonBenchmarks(
  benchmarkCases: ComparisonBenchmarkCase[] = firstPromptFamilyPromptSuite,
): ComparisonBenchmarkRunResult {
  const caseResults = benchmarkCases.map(runComparisonBenchmarkCase);
  const totalPassedChecks = caseResults.reduce((sum, item) => sum + item.passedChecks, 0);
  const totalChecks = caseResults.reduce((sum, item) => sum + item.totalChecks, 0);

  return {
    suiteId: "first_prompt_family",
    caseResults,
    totalPassedChecks,
    totalChecks,
    overallScore:
      totalChecks === 0 ? 1 : Math.round((totalPassedChecks / totalChecks) * 1000) / 1000,
  };
}

export function runComparisonBenchmarkCase(
  benchmarkCase: ComparisonBenchmarkCase,
): ComparisonBenchmarkCaseResult {
  const report = compareVersions(benchmarkCase.compareOptions);
  return scoreComparisonBenchmarkCase(benchmarkCase, report);
}
