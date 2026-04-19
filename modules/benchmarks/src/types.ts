import type {
  CompareVersionsOptions,
  ComparisonReport,
  GoalStatus,
} from "@audio-language-interface/compare";

export interface ComparisonBenchmarkFixtureBinding {
  sourceFixtureId: string;
  baselineFixtureId: string;
  candidateFixtureId: string;
}

export interface ComparisonBenchmarkExpectation {
  goalStatuses?: Record<string, GoalStatus>;
  requiredSemanticLabels?: string[];
  forbiddenSemanticLabels?: string[];
  requiredRegressionKinds?: string[];
  forbiddenRegressionKinds?: string[];
}

export interface ComparisonBenchmarkCase {
  caseId: string;
  family: "first_prompt_family";
  prompt: string;
  description: string;
  fixtures: ComparisonBenchmarkFixtureBinding;
  compareOptions: CompareVersionsOptions;
  expectation: ComparisonBenchmarkExpectation;
}

export interface ComparisonBenchmarkCorpus {
  corpusId: string;
  suiteId: ComparisonBenchmarkCase["family"];
  fixtureManifestPath: string;
  description: string;
  cases: ComparisonBenchmarkCase[];
}

export interface BenchmarkCheckResult {
  checkId: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export interface ComparisonBenchmarkCaseResult {
  caseId: string;
  prompt: string;
  fixtures: ComparisonBenchmarkFixtureBinding;
  report: ComparisonReport;
  passedChecks: number;
  totalChecks: number;
  score: number;
  checks: BenchmarkCheckResult[];
}

export interface ComparisonBenchmarkRunResult {
  suiteId: string;
  corpusId: string;
  caseResults: ComparisonBenchmarkCaseResult[];
  totalPassedChecks: number;
  totalChecks: number;
  overallScore: number;
}
