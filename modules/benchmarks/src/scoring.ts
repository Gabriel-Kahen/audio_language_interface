import type { ComparisonReport } from "@audio-language-interface/compare";

import type {
  BenchmarkCheckResult,
  ComparisonBenchmarkCase,
  ComparisonBenchmarkCaseResult,
  ComparisonBenchmarkExpectation,
  InterpretationBenchmarkCase,
  InterpretationBenchmarkCaseResult,
  InterpretationBenchmarkExpectation,
  LiveInterpretationBenchmarkCase,
  LiveInterpretationBenchmarkCheckResult,
  LiveInterpretationBenchmarkProviderResult,
  RequestCycleBenchmarkCase,
  RequestCycleBenchmarkCaseResult,
  RequestCycleBenchmarkCategory,
  RequestCycleBenchmarkCheckResult,
  RequestCycleBenchmarkFailure,
  RequestCycleCategoryScore,
  RequestCycleFailureBucket,
  RequestCycleScoreBreakdown,
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
    fixtures: benchmarkCase.fixtures,
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

export function scoreInterpretationBenchmarkCase(
  benchmarkCase: InterpretationBenchmarkCase,
): InterpretationBenchmarkCaseResult {
  const checks = scoreIntentInterpretation(benchmarkCase.interpretation, benchmarkCase.expectation);
  const passedChecks = checks.filter((check) => check.passed).length;
  const totalChecks = checks.length;

  return {
    caseId: benchmarkCase.caseId,
    prompt: benchmarkCase.prompt,
    interpretation: benchmarkCase.interpretation,
    passedChecks,
    totalChecks,
    score: totalChecks === 0 ? 1 : roundScore(passedChecks / totalChecks),
    checks,
  };
}

export function scoreLiveInterpretationBenchmarkProviderResult(
  benchmarkCase: LiveInterpretationBenchmarkCase,
  providerResult: Pick<
    LiveInterpretationBenchmarkProviderResult,
    "status" | "interpretation" | "error"
  >,
): Pick<
  LiveInterpretationBenchmarkProviderResult,
  "passedChecks" | "totalChecks" | "score" | "checks"
> {
  const checks: LiveInterpretationBenchmarkCheckResult[] =
    providerResult.status === "ok" && providerResult.interpretation !== undefined
      ? [
          {
            scope: "execution",
            checkId: "live_interpretation:execution",
            passed: true,
            expected: "ok",
            actual: "ok",
          },
          ...scoreIntentInterpretation(
            providerResult.interpretation,
            benchmarkCase.expectation,
          ).map((check) => ({
            ...check,
            scope: "interpretation" as const,
          })),
        ]
      : [
          {
            scope: "execution",
            checkId: "live_interpretation:execution",
            passed: false,
            expected: "ok",
            actual: providerResult.error?.failureClass ?? "error",
          },
        ];

  const passedChecks = checks.filter((check) => check.passed).length;
  const totalChecks = checks.length;

  return {
    passedChecks,
    totalChecks,
    score: totalChecks === 0 ? 1 : roundScore(passedChecks / totalChecks),
    checks,
  };
}

export function scoreIntentInterpretation(
  interpretation: InterpretationBenchmarkCase["interpretation"],
  expectation: InterpretationBenchmarkExpectation,
): BenchmarkCheckResult[] {
  const checks: BenchmarkCheckResult[] = [];
  const normalizedObjectives = new Set(interpretation.normalized_objectives ?? []);
  const descriptorHypotheses = new Map(
    (interpretation.descriptor_hypotheses ?? []).map((item) => [item.label, item.status]),
  );
  const constraintKeys = new Set(
    (interpretation.constraints ?? []).map(
      (item) => `${item.kind}:${item.label}:${item.value ?? ""}`,
    ),
  );
  const regionIntentScopes = new Set(
    (interpretation.region_intents ?? []).map((item) => item.scope),
  );
  const groundingNotes = new Set(interpretation.grounding_notes ?? []);

  if (expectation.interpretationPolicy !== undefined) {
    checks.push({
      checkId: "interpretation:policy",
      passed: interpretation.interpretation_policy === expectation.interpretationPolicy,
      expected: expectation.interpretationPolicy,
      actual: interpretation.interpretation_policy,
    });
  }

  if (expectation.requestClassification !== undefined) {
    checks.push({
      checkId: "interpretation:request_classification",
      passed: interpretation.request_classification === expectation.requestClassification,
      expected: expectation.requestClassification,
      actual: interpretation.request_classification,
    });
  }

  if (expectation.nextAction !== undefined) {
    checks.push({
      checkId: "interpretation:next_action",
      passed: interpretation.next_action === expectation.nextAction,
      expected: expectation.nextAction,
      actual: interpretation.next_action,
    });
  }

  for (const objective of expectation.requiredNormalizedObjectives ?? []) {
    checks.push({
      checkId: `interpretation:require_objective:${objective}`,
      passed: normalizedObjectives.has(objective),
      expected: "present",
      actual: normalizedObjectives.has(objective) ? "present" : "missing",
    });
  }

  for (const objective of expectation.forbiddenNormalizedObjectives ?? []) {
    checks.push({
      checkId: `interpretation:forbid_objective:${objective}`,
      passed: !normalizedObjectives.has(objective),
      expected: "absent",
      actual: normalizedObjectives.has(objective) ? "present" : "absent",
    });
  }

  for (const descriptor of expectation.requiredDescriptorHypotheses ?? []) {
    const actualStatus = descriptorHypotheses.get(descriptor.label);
    checks.push({
      checkId:
        descriptor.status === undefined
          ? `interpretation:require_descriptor:${descriptor.label}`
          : `interpretation:require_descriptor:${descriptor.label}:${descriptor.status}`,
      passed:
        actualStatus !== undefined &&
        (descriptor.status === undefined || actualStatus === descriptor.status),
      expected: descriptor.status ?? "present",
      actual: actualStatus ?? "missing",
    });
  }

  for (const label of expectation.forbiddenDescriptorHypothesisLabels ?? []) {
    checks.push({
      checkId: `interpretation:forbid_descriptor:${label}`,
      passed: !descriptorHypotheses.has(label),
      expected: "absent",
      actual: descriptorHypotheses.has(label) ? "present" : "absent",
    });
  }

  for (const constraint of expectation.requiredConstraints ?? []) {
    const key = `${constraint.kind}:${constraint.label ?? ""}:${constraint.value ?? ""}`;
    const present =
      constraint.label === undefined
        ? [...constraintKeys].some((candidate) => candidate.startsWith(`${constraint.kind}:`))
        : constraintKeys.has(key);
    checks.push({
      checkId:
        constraint.label === undefined
          ? `interpretation:require_constraint:${constraint.kind}`
          : `interpretation:require_constraint:${constraint.kind}:${constraint.label}`,
      passed: present,
      expected: "present",
      actual: present ? "present" : "missing",
    });
  }

  if (expectation.requiredRegionIntentScope !== undefined) {
    checks.push({
      checkId: "interpretation:region_scope",
      passed: regionIntentScopes.has(expectation.requiredRegionIntentScope),
      expected: expectation.requiredRegionIntentScope,
      actual: regionIntentScopes.size === 0 ? "missing" : [...regionIntentScopes].sort().join(","),
    });
  }

  if (expectation.requireClarificationQuestion !== undefined) {
    const actual = interpretation.clarification_question !== undefined;
    checks.push({
      checkId: "interpretation:clarification_question",
      passed: actual === expectation.requireClarificationQuestion,
      expected: expectation.requireClarificationQuestion ? "present" : "absent",
      actual: actual ? "present" : "absent",
    });
  }

  if (expectation.expectedFollowUpIntentKind !== undefined) {
    checks.push({
      checkId: "interpretation:follow_up_intent",
      passed: interpretation.follow_up_intent?.kind === expectation.expectedFollowUpIntentKind,
      expected: expectation.expectedFollowUpIntentKind,
      actual: interpretation.follow_up_intent?.kind ?? "missing",
    });
  }

  for (const note of expectation.requiredGroundingNotes ?? []) {
    checks.push({
      checkId: `interpretation:grounding_note:${note}`,
      passed: groundingNotes.has(note),
      expected: "present",
      actual: groundingNotes.has(note) ? "present" : "missing",
    });
  }

  if (expectation.expectedCandidateInterpretationCount !== undefined) {
    const actualCount = interpretation.candidate_interpretations?.length ?? 0;
    checks.push({
      checkId: "interpretation:candidate_count",
      passed: actualCount === expectation.expectedCandidateInterpretationCount,
      expected: String(expectation.expectedCandidateInterpretationCount),
      actual: String(actualCount),
    });
  }

  return checks;
}

export function scoreRequestCycleBenchmarkCase(
  benchmarkCase: RequestCycleBenchmarkCase,
  result: RequestCycleBenchmarkCaseResult["requestCycleResult"],
  error?: RequestCycleBenchmarkFailure,
  setupResults?: RequestCycleBenchmarkCaseResult["setupResults"],
): Pick<
  RequestCycleBenchmarkCaseResult,
  "passedChecks" | "totalChecks" | "score" | "checks" | "scoreBreakdown" | "failureBuckets"
> {
  const checks =
    result === undefined
      ? scoreErrorExpectation(benchmarkCase.expectation.error, error)
      : [
          ...scorePlannerCorrectness(benchmarkCase, result, setupResults),
          ...scoreOutcomeVerification(benchmarkCase, result),
          ...scoreRegressionAvoidance(benchmarkCase, result),
        ];
  const passedChecks = checks.filter((check) => check.passed).length;
  const totalChecks = checks.length;
  const scoreBreakdown = createScoreBreakdown(checks);

  return {
    passedChecks,
    totalChecks,
    score: roundScore(averageNonEmptyCategoryScores(scoreBreakdown)),
    checks,
    scoreBreakdown,
    failureBuckets: buildFailureBuckets(checks),
  };
}

function scorePlannerCorrectness(
  benchmarkCase: RequestCycleBenchmarkCase,
  result: NonNullable<RequestCycleBenchmarkCaseResult["requestCycleResult"]>,
  setupResults?: RequestCycleBenchmarkCaseResult["setupResults"],
): RequestCycleBenchmarkCheckResult[] {
  const checks: RequestCycleBenchmarkCheckResult[] = [];
  const expectation = benchmarkCase.expectation.planner;
  const plannedOperations = result.editPlan?.steps.map((step) => step.operation) ?? [];
  const plannedGoals = result.editPlan?.goals ?? [];

  if (expectation?.expected_result_kind !== undefined) {
    checks.push({
      category: "planner_correctness",
      scope: "request_cycle",
      checkId: "planner:result_kind",
      passed: result.result_kind === expectation.expected_result_kind,
      expected: expectation.expected_result_kind,
      actual: result.result_kind,
    });
  }

  if (expectation?.expected_follow_up_source !== undefined) {
    checks.push({
      category: "planner_correctness",
      scope: "request_cycle",
      checkId: "planner:follow_up_source",
      passed: result.followUpResolution.source === expectation.expected_follow_up_source,
      expected: expectation.expected_follow_up_source,
      actual: result.followUpResolution.source,
    });
  }

  for (const operation of expectation?.required_operations ?? []) {
    checks.push({
      category: "planner_correctness",
      scope: "planner",
      checkId: `planner:require_operation:${operation}`,
      passed: plannedOperations.includes(operation),
      expected: "planned",
      actual: plannedOperations.includes(operation) ? "planned" : "missing",
    });
  }

  for (const operation of expectation?.forbidden_operations ?? []) {
    checks.push({
      category: "planner_correctness",
      scope: "planner",
      checkId: `planner:forbid_operation:${operation}`,
      passed: !plannedOperations.includes(operation),
      expected: "absent",
      actual: plannedOperations.includes(operation) ? "present" : "absent",
    });
  }

  if ((expectation?.expected_operation_order ?? []).length > 0) {
    const expectedOperationOrder = expectation?.expected_operation_order ?? [];
    checks.push({
      category: "planner_correctness",
      scope: "planner",
      checkId: "planner:operation_order",
      passed: containsOrderedSubsequence(plannedOperations, expectedOperationOrder),
      expected: expectedOperationOrder.join(" -> "),
      actual: plannedOperations.join(" -> ") || "missing",
    });
  }

  for (const goal of expectation?.required_goals ?? []) {
    checks.push({
      category: "planner_correctness",
      scope: "planner",
      checkId: `planner:require_goal:${goal}`,
      passed: plannedGoals.includes(goal),
      expected: "planned",
      actual: plannedGoals.includes(goal) ? "planned" : "missing",
    });
  }

  if (expectation?.require_revision !== undefined) {
    const actual = result.revision?.shouldRevise === true;
    checks.push({
      category: "planner_correctness",
      scope: "request_cycle",
      checkId: "planner:revision_decision",
      passed: actual === expectation.require_revision,
      expected: expectation.require_revision ? "revise" : "stop",
      actual: actual ? "revise" : "stop",
    });
  }

  if (expectation?.expected_input_setup_index !== undefined) {
    const setupVersionId =
      setupResults?.[expectation.expected_input_setup_index]?.outputVersion.version_id;
    checks.push({
      category: "planner_correctness",
      scope: "request_cycle",
      checkId: "planner:input_setup_index",
      passed: setupVersionId !== undefined && result.inputVersion.version_id === setupVersionId,
      expected: setupVersionId ?? `setup[${expectation.expected_input_setup_index}]`,
      actual: result.inputVersion.version_id,
    });
  }

  if (expectation?.expected_output_setup_index !== undefined) {
    const setupVersionId =
      setupResults?.[expectation.expected_output_setup_index]?.outputVersion.version_id;
    checks.push({
      category: "planner_correctness",
      scope: "request_cycle",
      checkId: "planner:output_setup_index",
      passed: setupVersionId !== undefined && result.outputVersion.version_id === setupVersionId,
      expected: setupVersionId ?? `setup[${expectation.expected_output_setup_index}]`,
      actual: result.outputVersion.version_id,
    });
  }

  if (expectation?.require_active_branch !== undefined) {
    const actual = result.sessionGraph.active_refs.branch_id !== undefined;
    checks.push({
      category: "planner_correctness",
      scope: "request_cycle",
      checkId: "planner:active_branch",
      passed: actual === expectation.require_active_branch,
      expected: expectation.require_active_branch ? "branch" : "no_branch",
      actual: actual ? "branch" : "no_branch",
    });
  }

  return checks;
}

function scoreOutcomeVerification(
  benchmarkCase: RequestCycleBenchmarkCase,
  result: NonNullable<RequestCycleBenchmarkCaseResult["requestCycleResult"]>,
): RequestCycleBenchmarkCheckResult[] {
  const checks: RequestCycleBenchmarkCheckResult[] = [];
  const expectation = benchmarkCase.expectation.outcome;
  const comparisonReports = selectComparisonReports(result, expectation?.report_scope);

  if (expectation?.require_structured_verification !== undefined) {
    const actual = comparisonReports.some(
      (entry) =>
        entry.report.evaluation_basis?.goal_evaluation_source === "structured_verification",
    );
    checks.push({
      category: "outcome_verification",
      scope: comparisonReports[0]?.scope ?? "request_cycle",
      checkId: "outcome:structured_verification",
      passed: actual === expectation.require_structured_verification,
      expected: expectation.require_structured_verification ? "structured" : "not_required",
      actual: actual ? "structured" : "missing",
    });
  }

  for (const [goal, expectedStatus] of Object.entries(expectation?.goal_statuses ?? {})) {
    const actualStatus = findGoalStatus(comparisonReports, goal) ?? "missing";
    checks.push({
      category: "outcome_verification",
      scope: resolveGoalScope(comparisonReports, goal),
      checkId: `outcome:goal:${goal}`,
      passed: actualStatus === expectedStatus,
      expected: expectedStatus,
      actual: actualStatus,
    });
  }

  for (const [targetId, expectedStatus] of Object.entries(
    expectation?.verification_statuses ?? {},
  )) {
    const actualStatus = findVerificationStatus(comparisonReports, targetId) ?? "missing";
    checks.push({
      category: "outcome_verification",
      scope: resolveVerificationScope(comparisonReports, targetId),
      checkId: `outcome:verification:${targetId}`,
      passed: actualStatus === expectedStatus,
      expected: expectedStatus,
      actual: actualStatus,
    });
  }

  for (const label of expectation?.required_semantic_labels ?? []) {
    const present = comparisonReports.some((entry) =>
      (entry.report.semantic_deltas ?? []).some((item) => item.label === label),
    );
    checks.push({
      category: "outcome_verification",
      scope: comparisonReports[0]?.scope ?? "request_cycle",
      checkId: `outcome:require_semantic:${label}`,
      passed: present,
      expected: "present",
      actual: present ? "present" : "missing",
    });
  }

  for (const label of expectation?.forbidden_semantic_labels ?? []) {
    const present = comparisonReports.some((entry) =>
      (entry.report.semantic_deltas ?? []).some((item) => item.label === label),
    );
    checks.push({
      category: "outcome_verification",
      scope: comparisonReports[0]?.scope ?? "request_cycle",
      checkId: `outcome:forbid_semantic:${label}`,
      passed: !present,
      expected: "absent",
      actual: present ? "present" : "absent",
    });
  }

  return checks;
}

function scoreRegressionAvoidance(
  benchmarkCase: RequestCycleBenchmarkCase,
  result: NonNullable<RequestCycleBenchmarkCaseResult["requestCycleResult"]>,
): RequestCycleBenchmarkCheckResult[] {
  const checks: RequestCycleBenchmarkCheckResult[] = [];
  const expectation = benchmarkCase.expectation.regressions;
  const comparisonReports = selectComparisonReports(result);
  const regressions = comparisonReports.flatMap((entry) =>
    (entry.report.regressions ?? []).map((regression) => ({
      ...regression,
      scope: entry.scope,
    })),
  );

  for (const kind of expectation?.required_regression_kinds ?? []) {
    const present = regressions.some((regression) => regression.kind === kind);
    checks.push({
      category: "regression_avoidance",
      scope: resolveRegressionScope(regressions, kind),
      checkId: `regression:require:${kind}`,
      passed: present,
      expected: "present",
      actual: present ? "present" : "missing",
    });
  }

  for (const kind of expectation?.forbidden_regression_kinds ?? []) {
    const present = regressions.some((regression) => regression.kind === kind);
    checks.push({
      category: "regression_avoidance",
      scope: resolveRegressionScope(regressions, kind),
      checkId: `regression:forbid:${kind}`,
      passed: !present,
      expected: "absent",
      actual: present ? "present" : "absent",
    });
  }

  if (expectation?.max_severity !== undefined) {
    const worstSeverity = regressions.reduce(
      (currentWorst, regression) => Math.max(currentWorst, regression.severity),
      0,
    );
    checks.push({
      category: "regression_avoidance",
      scope: "request_cycle",
      checkId: "regression:max_severity",
      passed: worstSeverity <= expectation.max_severity,
      expected: `<=${expectation.max_severity.toFixed(2)}`,
      actual: worstSeverity.toFixed(2),
    });
  }

  return checks;
}

function scoreErrorExpectation(
  expectation: RequestCycleBenchmarkCase["expectation"]["error"],
  error: RequestCycleBenchmarkFailure | undefined,
): RequestCycleBenchmarkCheckResult[] {
  if (error === undefined) {
    return [
      {
        category: "planner_correctness",
        scope: "request_cycle",
        checkId: "request_cycle:unexpected_success",
        passed: false,
        expected: expectation === undefined ? "success" : "error",
        actual: "success",
      },
    ];
  }

  if (expectation === undefined) {
    return [
      {
        category: "planner_correctness",
        scope: "request_cycle",
        checkId: "request_cycle:unexpected_error",
        passed: false,
        expected: "success",
        actual: `${error.stage ?? error.name}: ${error.message}`,
      },
    ];
  }

  const checks: RequestCycleBenchmarkCheckResult[] = [];

  if (expectation.stage !== undefined) {
    checks.push({
      category: "planner_correctness",
      scope: "request_cycle",
      checkId: "request_cycle:error_stage",
      passed: error.stage === expectation.stage,
      expected: expectation.stage,
      actual: error.stage ?? "missing",
    });
  }

  if (expectation.failure_class !== undefined) {
    checks.push({
      category: "planner_correctness",
      scope: "request_cycle",
      checkId: "request_cycle:error_failure_class",
      passed: error.failureClass === expectation.failure_class,
      expected: expectation.failure_class,
      actual: error.failureClass ?? "missing",
    });
  }

  if (expectation.message_includes !== undefined) {
    checks.push({
      category: "planner_correctness",
      scope: "request_cycle",
      checkId: "request_cycle:error_message",
      passed: error.message.includes(expectation.message_includes),
      expected: expectation.message_includes,
      actual: error.message,
    });
  }

  return checks.length === 0
    ? [
        {
          category: "planner_correctness",
          scope: "request_cycle",
          checkId: "request_cycle:error_expected",
          passed: true,
          expected: "error",
          actual: "error",
        },
      ]
    : checks;
}

function createScoreBreakdown(
  checks: RequestCycleBenchmarkCheckResult[],
): RequestCycleScoreBreakdown {
  return {
    plannerCorrectness: scoreCategory(checks, "planner_correctness"),
    outcomeVerification: scoreCategory(checks, "outcome_verification"),
    regressionAvoidance: scoreCategory(checks, "regression_avoidance"),
  };
}

function scoreCategory(
  checks: RequestCycleBenchmarkCheckResult[],
  category: RequestCycleBenchmarkCategory,
): RequestCycleCategoryScore {
  const categoryChecks = checks.filter((check) => check.category === category);
  const passedChecks = categoryChecks.filter((check) => check.passed).length;
  const totalChecks = categoryChecks.length;

  return {
    passedChecks,
    totalChecks,
    score: totalChecks === 0 ? 1 : roundScore(passedChecks / totalChecks),
  };
}

function averageNonEmptyCategoryScores(scoreBreakdown: RequestCycleScoreBreakdown): number {
  const categories = Object.values(scoreBreakdown).filter((category) => category.totalChecks > 0);
  if (categories.length === 0) {
    return 1;
  }

  const total = categories.reduce((sum, category) => sum + category.score, 0);
  return total / categories.length;
}

function buildFailureBuckets(
  checks: RequestCycleBenchmarkCheckResult[],
): RequestCycleFailureBucket[] {
  const buckets = new Map<string, RequestCycleFailureBucket>();

  for (const check of checks) {
    if (check.passed) {
      continue;
    }

    const bucketId = `${check.category}:${check.checkId}`;
    const existing = buckets.get(bucketId);
    if (existing) {
      existing.failedChecks += 1;
      continue;
    }

    buckets.set(bucketId, {
      category: check.category,
      bucketId,
      label: check.checkId,
      failedChecks: 1,
    });
  }

  return [...buckets.values()].sort(
    (left, right) =>
      right.failedChecks - left.failedChecks || left.label.localeCompare(right.label),
  );
}

function selectComparisonReports(
  result: NonNullable<RequestCycleBenchmarkCaseResult["requestCycleResult"]>,
  scope?: "version" | "render",
): Array<{ scope: RequestCycleBenchmarkCheckResult["scope"]; report: ComparisonReport }> {
  const reports: Array<{
    scope: RequestCycleBenchmarkCheckResult["scope"];
    report: ComparisonReport;
  }> = [];

  if (scope === undefined || scope === "version") {
    reports.push({ scope: "version_compare", report: result.versionComparisonReport });
  }

  if (scope === undefined || scope === "render") {
    reports.push({ scope: "render_compare", report: result.renderComparisonReport });
  }

  return reports;
}

function findGoalStatus(
  reports: Array<{ scope: RequestCycleBenchmarkCheckResult["scope"]; report: ComparisonReport }>,
  goal: string,
) {
  for (const entry of reports) {
    const match = entry.report.goal_alignment?.find((item) => item.goal === goal);
    if (match) {
      return match.status;
    }
  }
}

function resolveGoalScope(
  reports: Array<{ scope: RequestCycleBenchmarkCheckResult["scope"]; report: ComparisonReport }>,
  goal: string,
): RequestCycleBenchmarkCheckResult["scope"] {
  for (const entry of reports) {
    const match = entry.report.goal_alignment?.find((item) => item.goal === goal);
    if (match) {
      return entry.scope;
    }
  }

  return reports[0]?.scope ?? "request_cycle";
}

function findVerificationStatus(
  reports: Array<{ scope: RequestCycleBenchmarkCheckResult["scope"]; report: ComparisonReport }>,
  targetId: string,
) {
  for (const entry of reports) {
    const match = entry.report.verification_results?.find((item) => item.target_id === targetId);
    if (match) {
      return match.status;
    }
  }
}

function resolveVerificationScope(
  reports: Array<{ scope: RequestCycleBenchmarkCheckResult["scope"]; report: ComparisonReport }>,
  targetId: string,
): RequestCycleBenchmarkCheckResult["scope"] {
  for (const entry of reports) {
    const match = entry.report.verification_results?.find((item) => item.target_id === targetId);
    if (match) {
      return entry.scope;
    }
  }

  return reports[0]?.scope ?? "request_cycle";
}

function resolveRegressionScope(
  regressions: Array<{
    kind: string;
    severity: number;
    scope: RequestCycleBenchmarkCheckResult["scope"];
  }>,
  kind: string,
): RequestCycleBenchmarkCheckResult["scope"] {
  return regressions.find((regression) => regression.kind === kind)?.scope ?? "request_cycle";
}

function containsOrderedSubsequence(values: string[], expectedSequence: string[]): boolean {
  if (expectedSequence.length === 0) {
    return true;
  }

  let expectedIndex = 0;
  for (const value of values) {
    if (value === expectedSequence[expectedIndex]) {
      expectedIndex += 1;
      if (expectedIndex >= expectedSequence.length) {
        return true;
      }
    }
  }

  return false;
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
