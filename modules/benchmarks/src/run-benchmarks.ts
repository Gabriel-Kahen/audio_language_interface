import { compareVersions } from "@audio-language-interface/compare";

import {
  FIRST_PROMPT_FAMILY_CORPUS_ID,
  firstPromptFamilyFixtureCorpus,
  firstPromptFamilyPromptSuite,
  INTERPRETATION_CORPUS_ID,
  interpretationBenchmarkCorpus,
} from "./prompt-suite.js";
import { scoreComparisonBenchmarkCase, scoreInterpretationBenchmarkCase } from "./scoring.js";
import type {
  ComparisonBenchmarkCase,
  ComparisonBenchmarkCaseResult,
  ComparisonBenchmarkCorpus,
  ComparisonBenchmarkRunResult,
  InterpretationBenchmarkCase,
  InterpretationBenchmarkCaseResult,
  InterpretationBenchmarkCorpus,
  InterpretationBenchmarkRunResult,
} from "./types.js";

export function runComparisonBenchmarks(
  benchmarkInput:
    | ComparisonBenchmarkCorpus
    | ComparisonBenchmarkCase[] = firstPromptFamilyFixtureCorpus,
): ComparisonBenchmarkRunResult {
  const benchmarkCases = Array.isArray(benchmarkInput) ? benchmarkInput : benchmarkInput.cases;
  const caseResults = benchmarkCases.map(runComparisonBenchmarkCase);
  const totalPassedChecks = caseResults.reduce((sum, item) => sum + item.passedChecks, 0);
  const totalChecks = caseResults.reduce((sum, item) => sum + item.totalChecks, 0);

  return {
    benchmarkMode: "comparison",
    suiteId: Array.isArray(benchmarkInput)
      ? (firstPromptFamilyPromptSuite[0]?.family ?? "first_prompt_family")
      : benchmarkInput.suiteId,
    corpusId: Array.isArray(benchmarkInput)
      ? FIRST_PROMPT_FAMILY_CORPUS_ID
      : benchmarkInput.corpusId,
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

export function runInterpretationBenchmarks(
  benchmarkInput:
    | InterpretationBenchmarkCorpus
    | InterpretationBenchmarkCase[] = interpretationBenchmarkCorpus,
): InterpretationBenchmarkRunResult {
  const benchmarkCases = Array.isArray(benchmarkInput) ? benchmarkInput : benchmarkInput.cases;
  const caseResults = benchmarkCases.map(runInterpretationBenchmarkCase);
  const totalPassedChecks = caseResults.reduce((sum, item) => sum + item.passedChecks, 0);
  const totalChecks = caseResults.reduce((sum, item) => sum + item.totalChecks, 0);

  return {
    benchmarkMode: "interpretation",
    suiteId: Array.isArray(benchmarkInput)
      ? (benchmarkCases[0]?.family ?? "intent_interpretation")
      : benchmarkInput.suiteId,
    corpusId: Array.isArray(benchmarkInput) ? INTERPRETATION_CORPUS_ID : benchmarkInput.corpusId,
    caseResults,
    totalPassedChecks,
    totalChecks,
    overallScore:
      totalChecks === 0 ? 1 : Math.round((totalPassedChecks / totalChecks) * 1000) / 1000,
  };
}

export function runInterpretationBenchmarkCase(
  benchmarkCase: InterpretationBenchmarkCase,
): InterpretationBenchmarkCaseResult {
  return scoreInterpretationBenchmarkCase(benchmarkCase);
}
