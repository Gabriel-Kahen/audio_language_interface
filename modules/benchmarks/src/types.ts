import type {
  CompareVersionsOptions,
  ComparisonReport,
  GoalStatus,
} from "@audio-language-interface/compare";

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
  compareOptions: CompareVersionsOptions;
  expectation: ComparisonBenchmarkExpectation;
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
  report: ComparisonReport;
  passedChecks: number;
  totalChecks: number;
  score: number;
  checks: BenchmarkCheckResult[];
}

export interface ComparisonBenchmarkRunResult {
  suiteId: string;
  caseResults: ComparisonBenchmarkCaseResult[];
  totalPassedChecks: number;
  totalChecks: number;
  overallScore: number;
}
