import type { RuntimeOperationName } from "@audio-language-interface/capabilities";
import type {
  CompareVersionsOptions,
  ComparisonReport,
  GoalStatus,
} from "@audio-language-interface/compare";
import type { AudioVersion } from "@audio-language-interface/core";
import type {
  DescriptorHypothesisStatus,
  FollowUpIntentKind,
  IntentInterpretation,
  InterpretationCacheStore,
  InterpretationConstraintKind,
  InterpretationNextAction,
  InterpretationPolicy,
  InterpretationProviderConfig,
  InterpretationProviderKind,
  InterpretationSessionContext,
  RegionIntentScope,
} from "@audio-language-interface/interpretation";
import type { ImportAudioOptions } from "@audio-language-interface/io";
import type {
  FollowUpResolution,
  OrchestrationDependencies,
  RequestCycleResult,
  RunRequestCycleOptions,
} from "@audio-language-interface/orchestration";
import type { ExecuteToolRequestOptions } from "@audio-language-interface/tools";

export interface AudioFixtureFormat {
  container: string;
  codec: string;
  sample_rate_hz: number;
  channels: number;
  bit_depth: number;
  duration_seconds: number;
  file_size_bytes: number;
}

export interface AudioFixtureProvenance {
  source_type: string;
  created_by: string;
  license: string;
  redistributable: boolean;
  checksum_sha256: string;
  notes?: string;
}

export interface AudioFixtureIntendedUse {
  prompt_family?: string[];
  used_by?: string[];
  expected_characteristics?: string[];
}

export interface AudioFixtureManifestEntry {
  fixture_id: string;
  display_name: string;
  relative_path: string;
  availability: string;
  format: AudioFixtureFormat;
  provenance: AudioFixtureProvenance;
  derived_from_fixture_id?: string;
  intended_use?: AudioFixtureIntendedUse;
  generation_recipe?: string[];
  contract_refs?: Record<string, string>;
}

export interface AudioFixtureManifest {
  schema_version: string;
  fixtures: AudioFixtureManifestEntry[];
}

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
  benchmarkMode: "comparison";
  suiteId: string;
  corpusId: string;
  caseResults: ComparisonBenchmarkCaseResult[];
  totalPassedChecks: number;
  totalChecks: number;
  overallScore: number;
}

export interface InterpretationBenchmarkExpectedDescriptor {
  label: string;
  status?: DescriptorHypothesisStatus;
}

export interface InterpretationBenchmarkExpectedConstraint {
  kind: InterpretationConstraintKind;
  label?: string;
  value?: string;
}

export interface InterpretationBenchmarkExpectation {
  interpretationPolicy?: IntentInterpretation["interpretation_policy"];
  requestClassification?: IntentInterpretation["request_classification"];
  nextAction?: InterpretationNextAction;
  requiredNormalizedObjectives?: string[];
  forbiddenNormalizedObjectives?: string[];
  requiredDescriptorHypotheses?: InterpretationBenchmarkExpectedDescriptor[];
  forbiddenDescriptorHypothesisLabels?: string[];
  requiredConstraints?: InterpretationBenchmarkExpectedConstraint[];
  requiredRegionIntentScope?: RegionIntentScope;
  requireClarificationQuestion?: boolean;
  expectedFollowUpIntentKind?: FollowUpIntentKind;
  requiredGroundingNotes?: string[];
  expectedCandidateInterpretationCount?: number;
}

export interface InterpretationBenchmarkCase {
  caseId: string;
  family: "intent_interpretation";
  prompt: string;
  description: string;
  interpretation: IntentInterpretation;
  expectation: InterpretationBenchmarkExpectation;
}

export interface InterpretationBenchmarkCorpus {
  corpusId: string;
  suiteId: InterpretationBenchmarkCase["family"];
  description: string;
  cases: InterpretationBenchmarkCase[];
}

export interface InterpretationBenchmarkCaseResult {
  caseId: string;
  prompt: string;
  interpretation: IntentInterpretation;
  passedChecks: number;
  totalChecks: number;
  score: number;
  checks: BenchmarkCheckResult[];
}

export interface InterpretationBenchmarkRunResult {
  benchmarkMode: "interpretation";
  suiteId: string;
  corpusId: string;
  caseResults: InterpretationBenchmarkCaseResult[];
  totalPassedChecks: number;
  totalChecks: number;
  overallScore: number;
}

export interface LiveInterpretationBenchmarkInput {
  policy: InterpretationPolicy;
  audioVersion: AudioVersion;
  analysisReport: import("@audio-language-interface/analysis").AnalysisReport;
  semanticProfile: import("@audio-language-interface/semantics").SemanticProfile;
  capabilityManifest?: import("@audio-language-interface/capabilities").RuntimeCapabilityManifest;
  sessionContext?: InterpretationSessionContext;
  promptVersion?: string;
}

export interface LiveInterpretationBenchmarkCase {
  caseId: string;
  family: "live_intent_interpretation";
  prompt: string;
  description: string;
  input: LiveInterpretationBenchmarkInput;
  expectation: InterpretationBenchmarkExpectation;
  providerAllowlist?: InterpretationProviderKind[];
}

export interface LiveInterpretationBenchmarkCorpus {
  corpusId: string;
  suiteId: LiveInterpretationBenchmarkCase["family"];
  description: string;
  cases: LiveInterpretationBenchmarkCase[];
}

export interface LiveInterpretationBenchmarkProviderTarget
  extends Omit<InterpretationProviderConfig, "apiKey"> {
  apiKey: string;
  label?: string;
}

export interface LiveInterpretationBenchmarkError {
  name: string;
  message: string;
  stack?: string;
  failureClass: "provider_error" | "schema_invalid" | "timeout" | "validation_error";
}

export interface LiveInterpretationBenchmarkCheckResult extends BenchmarkCheckResult {
  scope: "execution" | "interpretation";
}

export interface LiveInterpretationBenchmarkProviderResult {
  provider: InterpretationProviderKind;
  model: string;
  label?: string;
  policy: InterpretationPolicy;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: "ok" | "error";
  cached: boolean;
  interpretation?: IntentInterpretation;
  error?: LiveInterpretationBenchmarkError;
  passedChecks: number;
  totalChecks: number;
  score: number;
  checks: LiveInterpretationBenchmarkCheckResult[];
}

export interface LiveInterpretationBenchmarkCaseResult {
  caseId: string;
  prompt: string;
  description: string;
  providerResults: LiveInterpretationBenchmarkProviderResult[];
  totalPassedChecks: number;
  totalChecks: number;
  score: number;
}

export interface LiveInterpretationProviderSummary {
  provider: InterpretationProviderKind;
  model: string;
  label?: string;
  totalRuns: number;
  succeededRuns: number;
  failedRuns: number;
  totalPassedChecks: number;
  totalChecks: number;
  overallScore: number;
  averageDurationMs: number;
}

export interface LiveInterpretationBenchmarkRunResult {
  benchmarkMode: "live_interpretation";
  suiteId: string;
  corpusId: string;
  caseResults: LiveInterpretationBenchmarkCaseResult[];
  providerSummaries: LiveInterpretationProviderSummary[];
  totalCases: number;
  totalProviderRuns: number;
  succeededProviderRuns: number;
  failedProviderRuns: number;
  totalPassedChecks: number;
  totalChecks: number;
  overallScore: number;
  totalDurationMs: number;
}

export type RequestCycleBenchmarkCategory =
  | "planner_correctness"
  | "outcome_verification"
  | "regression_avoidance";

export type RequestCycleBenchmarkExecutionSurface = "orchestration" | "tool";

export interface RequestCycleBenchmarkPlannerExpectation {
  expected_result_kind?: "applied" | "reverted" | "clarification_required";
  expected_follow_up_source?: FollowUpResolution["source"];
  required_operations?: RuntimeOperationName[];
  forbidden_operations?: RuntimeOperationName[];
  expected_operation_order?: RuntimeOperationName[];
  required_goals?: string[];
  require_revision?: boolean;
  expected_input_setup_index?: number;
  expected_output_setup_index?: number;
  require_active_branch?: boolean;
  require_pending_clarification?: boolean;
  clarification_question_includes?: string;
}

export interface RequestCycleBenchmarkOutcomeExpectation {
  report_scope?: "version" | "render";
  require_structured_verification?: boolean;
  goal_statuses?: Record<string, GoalStatus>;
  verification_statuses?: Record<string, GoalStatus>;
  required_semantic_labels?: string[];
  forbidden_semantic_labels?: string[];
}

export interface RequestCycleBenchmarkRegressionExpectation {
  required_regression_kinds?: string[];
  forbidden_regression_kinds?: string[];
  max_severity?: number;
}

export interface RequestCycleBenchmarkErrorExpectation {
  stage?: string;
  failure_class?: string;
  message_includes?: string;
}

export interface RequestCycleBenchmarkCase {
  caseId: string;
  family: string;
  prompt: string;
  description: string;
  fixtureId: string;
  setup_sequence?: string[];
  interpretation?: RunRequestCycleOptions["interpretation"];
  expectation: {
    planner?: RequestCycleBenchmarkPlannerExpectation;
    outcome?: RequestCycleBenchmarkOutcomeExpectation;
    regressions?: RequestCycleBenchmarkRegressionExpectation;
    error?: RequestCycleBenchmarkErrorExpectation;
  };
}

export interface RequestCycleBenchmarkCorpus {
  corpusId: string;
  suiteId: string;
  fixtureManifestPath: string;
  description: string;
  cases: RequestCycleBenchmarkCase[];
}

export interface RequestCycleBenchmarkArtifacts {
  fixtureManifestPath: string;
  workspaceRoot: string;
  sourceFixturePath?: string;
  inputPath?: string;
  fixture?: AudioFixtureManifestEntry;
}

export interface RequestCycleBenchmarkFailure {
  name: string;
  message: string;
  stack?: string;
  stage?: string;
  attempts?: number;
  partialResult?: Record<string, unknown>;
  failureClass?: string;
}

export interface RequestCycleBenchmarkCheckResult extends BenchmarkCheckResult {
  category: RequestCycleBenchmarkCategory;
  scope: "planner" | "version_compare" | "render_compare" | "request_cycle";
}

export interface RequestCycleCategoryScore {
  passedChecks: number;
  totalChecks: number;
  score: number;
}

export interface RequestCycleScoreBreakdown {
  plannerCorrectness: RequestCycleCategoryScore;
  outcomeVerification: RequestCycleCategoryScore;
  regressionAvoidance: RequestCycleCategoryScore;
}

export interface RequestCycleFailureBucket {
  category: RequestCycleBenchmarkCategory;
  bucketId: string;
  label: string;
  failedChecks: number;
}

export interface RequestCycleBenchmarkCaseResult {
  caseId: string;
  family: string;
  prompt: string;
  description: string;
  fixtureId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  executionSurface: RequestCycleBenchmarkExecutionSurface;
  status: "ok" | "error";
  artifacts: RequestCycleBenchmarkArtifacts;
  expectation: RequestCycleBenchmarkCase["expectation"];
  setupResults?: RequestCycleResult[];
  requestCycleResult?: RequestCycleResult;
  error?: RequestCycleBenchmarkFailure;
  passedChecks: number;
  totalChecks: number;
  score: number;
  checks: RequestCycleBenchmarkCheckResult[];
  scoreBreakdown: RequestCycleScoreBreakdown;
  failureBuckets: RequestCycleFailureBucket[];
}

export interface RequestCycleBenchmarkRunResult {
  benchmarkMode: "request_cycle";
  suiteId: string;
  corpusId: string;
  fixtureManifestPath: string;
  caseResults: RequestCycleBenchmarkCaseResult[];
  totalCases: number;
  succeededCases: number;
  failedCases: number;
  totalPassedChecks: number;
  totalChecks: number;
  overallScore: number;
  totalDurationMs: number;
}

export interface RunRequestCycleBenchmarkCaseOptions {
  dependencies?: Partial<OrchestrationDependencies>;
  toolRuntime?: ExecuteToolRequestOptions["runtime"];
  fixtureManifest?: AudioFixtureManifest;
  fixtureManifestPath?: string;
  analysisOptions?: RunRequestCycleOptions["analysisOptions"];
  renderKind?: RunRequestCycleOptions["renderKind"];
  interpretation?: RunRequestCycleOptions["interpretation"];
  revision?: RunRequestCycleOptions["revision"];
  sessionId?: string;
  branchId?: string;
  executionSurface?: RequestCycleBenchmarkExecutionSurface;
  importedAt?: string;
  importOptions?: Omit<ImportAudioOptions, "workspaceRoot">;
  workspaceRoot?: string;
  preserveWorkspace?: boolean;
}

export interface RunRequestCycleBenchmarksOptions
  extends Omit<RunRequestCycleBenchmarkCaseOptions, "fixtureManifest"> {
  fixtureManifest?: AudioFixtureManifest;
}

export interface RunLiveInterpretationBenchmarksOptions {
  providerTargets: LiveInterpretationBenchmarkProviderTarget[];
  interpretRequest?: typeof import("@audio-language-interface/interpretation").interpretRequest;
  cacheStore?: InterpretationCacheStore;
  generatedAt?: string;
  continueOnProviderError?: boolean;
  caseFilter?: (benchmarkCase: LiveInterpretationBenchmarkCase) => boolean;
}
