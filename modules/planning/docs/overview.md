# Planning Overview

## Purpose

Convert user intent and current audio state into an explicit `EditPlan`.

This module is the core of the intent layer.

The initial implementation is a deterministic baseline planner. It uses conservative keyword parsing plus analysis, semantic evidence, and the published runtime capability manifest to emit small, explicit plans that stay within the currently supported planning operation set.

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
- `modules/capabilities`
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

- only emits operations currently marked `planner_supported` in the runtime capability manifest: EQ, filtering, trim, fade, gain, conservative compression, peak limiting, conservative denoise, and conservative stereo-width adjustment
- prefers one small EQ step over multiple overlapping tonal steps when possible
- validates inbound `AudioVersion`, `AnalysisReport`, and `SemanticProfile` contracts before planning
- records the `RuntimeCapabilityManifest` identifier used to ground the plan
- uses the current `AudioVersion` duration to reject trim and fade requests that exceed the available file
- rejects combined fade requests that would overlap or cover more than half of the available file duration
- uses analysis annotations and semantic descriptors to refine frequencies and verification targets
- maps generic `cleaner` requests only when current evidence supports a conservative tonal cleanup target
- maps conservative `more controlled` language to `compressor` and explicit peak-control language to `limiter`
- supports explicit denoise requests only when analysis indicates steady noise and keeps broader restoration requests explicit
- supports explicit stereo-width requests only for already-stereo material when the current image is safe to adjust conservatively
- fails instead of guessing when the request cannot be mapped to an explicit supported operation

See `modules/planning/docs/heuristics.md` for the current phrase-to-operation mappings.

## Test expectations

- verify request-to-plan behavior for representative prompts
- verify step ordering and safety limits
- verify no plan relies on hidden defaults
- verify contract alignment for `EditPlan`
