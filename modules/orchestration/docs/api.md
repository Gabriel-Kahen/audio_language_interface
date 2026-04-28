# Orchestration API

## Purpose

`modules/orchestration` is the thin workflow-composition adapter over the implemented runtime and intent modules.

The current v1 surface stays thin by:

- using the existing `io`, `analysis`, `transforms`, `render`, `compare`, and `history` entrypoints directly
- composing the published `planning` and `semantics` entrypoints directly
- returning concrete artifacts and workflow traces instead of hiding state

## Public exports

- `runRequestCycle(options)`
- `importAndAnalyze(options)`
- `planApplyComparePass(options)`
- `planAndApply(options)`
- `renderAndCompare(options)`
- `iterativeRefine(options)`
- `resolveFollowUpRequest(options)`
- `OrchestrationStageError`
- `defaultOrchestrationDependencies`

## Dependency injection

`defaultOrchestrationDependencies` wires the currently implemented modules:

- `importAudioFromFile`
- `analyzeAudioVersion`
- `buildSemanticProfile`
- `interpretRequest`
- `planEdits`
- `applyEditPlan`
- `renderPreview`
- `renderExport`
- `compareVersions`
- `compareRenders`
- `createSessionGraph`
- `createBranch`
- `recordAudioAsset`
- `recordAudioVersion`
- `recordAnalysisReport`
- `recordSemanticProfile`
- `recordEditPlan`
- `recordTransformRecord`
- `recordRenderArtifact`
- `recordComparisonReport`
- `revertToVersion`

Callers may still override any dependency for testing or alternate runtimes, but the default orchestration surface now tracks the implemented module APIs.

## Main workflow

`runRequestCycle(options)` supports two inputs:

- `input.kind = "import"`: import a source file, analyze it, plan edits, apply them, analyze the result, render baseline and candidate outputs, compare them, and record the session graph
- `input.kind = "existing"`: start from an existing `AudioAsset` and `AudioVersion`, then run the same downstream stages

The returned result includes:

- `result_kind = "applied" | "reverted" | "clarification_required"`
- input and output versions
- input and output analyses
- follow-up resolution metadata
- optional `intentInterpretation` when explicit LLM-assisted interpretation normalized the planner-facing request
- optional `iterations[]` when an applied cycle executed one or more explicit version-to-version passes
- optional `revision` describing whether orchestration chose one additional revision pass and why
- optional semantic profile
- edit plan and transform result for applied cycles
- `versionComparisonReport` as the primary version-to-version quality signal for the completed cycle
- baseline and candidate render artifacts
- `renderComparisonReport` for the final render-to-render comparison
- `comparisonReport` as a backward-compatible alias of `renderComparisonReport`
- updated `SessionGraph`
- stage-level workflow trace entries

For clarification-required results, `runRequestCycle()` returns the current `inputVersion` and `inputAnalysis` plus a `clarification` object instead of output/render/comparison artifacts. That clarification object carries:

- `question`
- `pendingClarification`

The same pending clarification state is also written to `sessionGraph.metadata.pending_clarification` so the next explicit request-cycle call can resume without hidden orchestration state.

## Failure behavior

Each public flow uses stage-aware error wrapping.

- Failures throw `OrchestrationStageError`
- `error.stage` identifies the failed boundary
- `error.partialResult` contains the latest safe partial artifacts when available
- follow-up resolution inside `runRequestCycle` is its own `resolve_follow_up` stage, so failures there still include analyzed input context and a partial `sessionGraph`
- `runRequestCycle` attempts to persist any already-established history into `error.partialResult.sessionGraph`, including imported inputs, completed analysis, completed planning artifacts, and any renders produced before the failure
- when conservative interpretation asks for clarification, `runRequestCycle()` now returns a success result with `result_kind = "clarification_required"` instead of throwing a planner failure
- `FailurePolicy` can increase per-stage attempts and add retry decisions

The default behavior is one attempt with no retries.

## Smaller helpers

`importAndAnalyze(options)`

- imports one file
- analyzes the imported version

`planAndApply(options)`

- optionally derives a semantic profile
- optionally derives an `IntentInterpretation` artifact when `options.requestInterpretation` is present and `interpretRequest` is injected
- builds an edit plan through `modules/planning`
- applies that plan through `modules/transforms`

`renderAndCompare(options)`

- renders baseline and candidate versions as preview or final artifacts
- passes the corresponding render module options through via `baselineRenderOptions` and `candidateRenderOptions`
- compares those renders with paired analysis reports

`iterativeRefine(options)`

- repeats plan, apply, analyze, and compare
- forwards `analysisOptions` on each analysis pass
- stops when `maxIterations` is reached or `shouldContinue` returns false

`planApplyComparePass(options)`

- runs one explicit version-level pass
- returns the pass-local semantic profile, optional `IntentInterpretation`, edit plan, transform result, output analysis, and version comparison report
- is the shared building block for `iterativeRefine()` and the optional `runRequestCycle()` revision pass

`resolveFollowUpRequest(options)`

- resolves plain requests directly
- expands shorthand `more`, including `make it more` and `make it a little more`, to the recorded `user_request` from the plan that produced the current version
- resolves `less`, including `make it less` and `make it a little less`, and nearby revert-style wording to a concrete ancestor `version_id` using `modules/history`
- resolves `undo` to the previously active version using explicit `active_ref_history`
- resolves `try another version` to the prior baseline request and source version, then lets `runRequestCycle()` branch from that baseline before replaying the request
- throws when the current session state is insufficient to resolve the follow-up safely

`runRequestCycle(options)` now uses this resolver for `input.kind = "existing"`, which lets repeated requests such as `more`, `make it more`, `less`, `make it less`, `undo`, `revert to previous version`, and `try another version` reuse explicit session history without introducing hidden orchestration state.

When `options.revision.enabled` is true, `runRequestCycle()` may execute one additional explicit pass after the first version-level comparison. The default policy is conservative:

- stop immediately when no goal-alignment evidence exists
- stop when the first pass introduces a severe regression
- revise once when at least one goal is still `not_met` and no severe regression was introduced

Callers may override that decision through `options.revision.shouldRevise(...)`.

Important comparison behavior:

- each explicit pass records its own version-level `compare` stage and `ComparisonReport`
- `runRequestCycle()` exposes the completed cycle's final version-level quality signal at `result.versionComparisonReport`
- the final render comparison still compares the original input against the final output and is returned separately as `result.renderComparisonReport`
- only pass-level stages carry `trace[].pass`; the final render comparison does not

For revert-style and alternate-version execution, callers must provide `dependencies.getAudioVersionById({ asset, sessionGraph, versionId })`.

For opt-in planner best-effort behavior, callers may pass `options.planningPolicy = "best_effort"`. This keeps deterministic planning authoritative, but allows subjective texture wording to choose a conservative tonal-softening proxy instead of refusing when direct artifact evidence is missing. The default is strict behavior.

For opt-in LLM assistance, callers must also provide:

- `options.interpretation = { mode: "llm_assisted", policy?, provider: ... }`
- `dependencies.interpretRequest(...)`

Provider requirements are explicit:

- `openai` and `google` require `apiKey`
- `codex_cli` uses local Codex CLI auth state and does not require `apiKey`

That interpretation step stays above deterministic planning:

- orchestration records the original and resolved user requests in the returned artifact
- the interpreter returns a contract-valid `IntentInterpretation` explicitly
- the returned artifact records whether the interpretation used `conservative` or `best_effort` ambiguity handling
- orchestration passes explicit session context such as the current version id, original user request, prior request, and any pending clarification when that context exists
- `modules/planning` still receives one concrete planner-facing request string plus the usual validated `SemanticProfile`
- if conservative interpretation returns `next_action = "clarify"`, orchestration records `pending_clarification` in the session graph and returns a first-class clarification result instead of silently failing planning
- when the next explicit request arrives against the same session graph, orchestration forwards that pending clarification context back into interpretation and marks `followUpResolution.source = "clarification_answer"` when the request resumes from that state

Orchestration now verifies that the loaded historical `AudioVersion` matches:

- the requested revert `versionId`
- the current session `asset_id`
- the recorded session provenance when that provenance exists

When `try another version` is resolved successfully, orchestration also creates a new branch from the recovered source version before recording the new output version on that branch. The current alternate-version flow is still deterministic; it replays the prior request from the prior baseline rather than inventing hidden planner randomness.

That keeps orchestration thin:

- `history` resolves where the session should move
- the caller explicitly materializes the referenced `AudioVersion` artifact
- orchestration re-analyzes, re-renders, compares, and records the resulting session state
