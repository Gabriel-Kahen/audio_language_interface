# Orchestration Overview

## Purpose

Compose independent modules into useful end-to-end workflows without absorbing their responsibilities.

`orchestration` is an adapter layer. It composes the runtime and intent modules into explicit workflows without becoming hidden product logic.

The current implementation is a thin integration layer over the existing runtime and intent modules. It exposes both a full request cycle and smaller reusable flow helpers.

## Public API surface

- `runRequestCycle(options)`
- `importAndAnalyze(options)`
- `planApplyComparePass(options)`
- `planAndApply(options)`
- `renderAndCompare(options)`
- `iterativeRefine(options)`
- `resolveFollowUpRequest(options)`
- `OrchestrationStageError`
- `defaultOrchestrationDependencies`

## Implemented source files

- `src/run-request-cycle.ts`: end-to-end workflow entrypoint
- `src/flows/import-and-analyze.ts`: ingest plus analysis path
- `src/flows/plan-apply-compare.ts`: one explicit plan/apply/analyze/compare pass
- `src/flows/plan-and-apply.ts`: planning plus execution path
- `src/flows/render-and-compare.ts`: output and evaluation path
- `src/flows/iterative-refine.ts`: repeated adjustment loop
- `src/follow-up-request.ts`: resolves iterative shorthand against recorded session history
- `src/failure-policy.ts`: retry and recovery policy
- `src/index.ts`: public exports only

## Dependencies

- nearly all runtime modules
- stable contracts from `core`, `io`, `analysis`, `planning`, `transforms`, `render`, `compare`, and `history`

`orchestration` may be called by `tools`, but it does not depend on the `tools` module.

## Downstream consumers

- external services
- command-line or server entrypoints

## Non-goals

- replacing module-specific logic
- inventing alternate contracts
- storing hidden state outside published artifacts

## Test expectations

- verify happy-path workflow composition
- verify failure handling and partial recovery
- verify module contracts are respected at boundaries
- verify orchestration remains thin and explicit

## Current behavior

- `runRequestCycle` supports both `input.kind = "import"` and `input.kind = "existing"`.
- The default dependency bundle wires the implemented `io`, `analysis`, `semantics`, `planning`, `transforms`, `render`, `compare`, and `history` module entrypoints directly.
- `importAndAnalyze` now defaults imports to `io`'s shared WAV normalization target when callers do not supply a normalization target, so the imported version remains compatible with the current WAV-only analysis baseline.
- Flow errors are wrapped as `OrchestrationStageError` values with stage names and partial results when available, including follow-up resolution failures before planning begins.
- `iterativeRefine` repeats plan, apply, analyze, and compare until `maxIterations` is reached or the caller stops the loop.
- `runRequestCycle` can optionally execute one additional revision pass after the first version-level comparison. The decision stays explicit through `options.revision` and every applied pass is preserved in `result.iterations`.
- `runRequestCycle` now exposes the final version-level comparison directly as `result.versionComparisonReport`, while preserving the final render-to-render comparison as `result.renderComparisonReport` and the legacy compatibility alias `result.comparisonReport`.
- `resolveFollowUpRequest` can safely expand `more` to the last recorded request, resolve `less` against version ancestry, and resolve `undo` against explicit active-ref history.

## Current limitations

- Orchestration depends on the same current module capabilities as the underlying runtime and intent layers. It does not add hidden planning breadth, hidden transform support, or alternate capability discovery on top of them.
- Revert-like follow-ups are fully executable when the caller provides `getAudioVersionById`, which lets orchestration materialize the referenced `AudioVersion` artifact explicitly before re-analyzing and re-rendering it.
- When `runRequestCycle` performs a second pass, the final render comparison still compares the original input against the final output. The final version comparison is also surfaced at `result.versionComparisonReport`, while the per-pass version comparisons remain available in `result.iterations` and are also recorded into session history.
- It does not provide hidden persistence, job scheduling, or service hosting behavior.
- There is no dedicated CLI or app entrypoint that wraps these orchestration APIs yet.
