# Planning Overview

## Purpose

Convert user intent and current audio state into an explicit `EditPlan`.

The initial implementation is a deterministic baseline planner. It uses conservative keyword parsing plus analysis and semantic evidence to emit small, explicit plans that stay within the currently implemented transform operation set.

## Public API surface

- `parseUserRequest(userRequest) => ParsedEditObjectives`
- `planEdits({ userRequest, audioVersion, analysisReport, semanticProfile, ... }) => EditPlan`
- `assertValidEditPlan(plan)` and `isValidEditPlan(plan)` for contract checks

## Suggested initial source files

- `src/parse-request.ts`: request normalization into planner-friendly intent
- `src/plan-edits.ts`: top-level planning entrypoint
- `src/step-builders.ts`: operation-specific step creation
- `src/safety.ts`: safety limits and policy helpers
- `src/verification-targets.ts`: compare-facing validation goals
- `src/index.ts`: public exports only

## Dependencies

- `modules/core`
- `modules/analysis`
- `modules/semantics`
- `EditPlan` contract

## Downstream consumers

- `transforms`
- `compare`
- `history`
- `tools`
- `orchestration`

## Non-goals

- direct DSP execution
- file import or render logic
- hidden orchestration state
- open-ended planning for unsupported transform categories

## Baseline behavior

- only emits operations currently supported by `modules/transforms`
- prefers one small EQ step over multiple overlapping tonal steps when possible
- validates inbound `AudioVersion`, `AnalysisReport`, and `SemanticProfile` contracts before planning
- uses the current `AudioVersion` duration to reject trim and fade requests that exceed the available file
- rejects combined fade requests that would overlap or cover more than half of the available file duration
- uses analysis annotations and semantic descriptors to refine frequencies and verification targets
- fails instead of guessing when the request cannot be mapped to an explicit supported operation

See `modules/planning/docs/heuristics.md` for the current phrase-to-operation mappings.

## Test expectations

- verify request-to-plan behavior for representative prompts
- verify step ordering and safety limits
- verify no plan relies on hidden defaults
- verify contract alignment for `EditPlan`
