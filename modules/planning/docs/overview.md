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
- `src/verification-targets.ts`: compare-facing structured verification targets
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

- only emits operations currently marked `planner_supported` in the runtime capability manifest: trim, fade, gain, normalize, filtering, `parametric_eq`, surgical shelf/notch/tilt EQ, conservative compression, peak limiting, conservative restoration, and conservative stereo-width adjustment
- prefers small explicit steps with published parameter shapes over hidden macro behavior
- validates inbound `AudioVersion`, `AnalysisReport`, and `SemanticProfile` contracts before planning
- records the `RuntimeCapabilityManifest` identifier used to ground the plan
- uses the current `AudioVersion` duration to reject trim and fade requests that exceed the available file
- rejects combined fade requests that would overlap or cover more than half of the available file duration
- uses analysis annotations and semantic descriptors to refine frequencies and emit structured verification targets
- maps generic `cleaner` requests only when current evidence supports a conservative tonal cleanup target or the request also contains an explicit supported cleanup direction
- does not auto-promote generic cleanup wording into hum or click restoration; those restoration steps still require explicit supported intent
- maps conservative `more controlled` language to `compressor`, maps explicit louder-and-controlled language to a measured `compressor -> normalize` path, and maps explicit peak-control language to `limiter`
- supports explicit loudness-normalization, upper-air, warmth, low-mid cleanup, harsh-ring, sibilance, click-cleanup, and hum-removal requests with conservative defaults grounded in the published manifest
- supports explicit denoise requests only when analysis indicates steady noise
- prefers annotation-backed or semantic-backed restoration verification when that evidence exists, and only falls back to coarse click or hum proxies when the current compare surface leaves no stronger option
- supports explicit stereo-width requests only for already-stereo material when the current image is safe to adjust conservatively
- fails instead of guessing when the request cannot be mapped to an explicit supported operation
- classifies planner refusals explicitly as `supported_but_underspecified`, `unsupported`, or `supported_runtime_only_but_not_planner_enabled` so adapters can ask for clarification without pretending the runtime or planner can do more than they actually can

See `modules/planning/docs/heuristics.md` for the current phrase-to-operation mappings.

## Test expectations

- verify request-to-plan behavior for representative prompts
- verify step ordering and safety limits
- verify no plan relies on hidden defaults
- verify contract alignment for `EditPlan`
