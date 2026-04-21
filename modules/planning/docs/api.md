# Planning API

## Scope

This document describes the implemented public API in `modules/planning/src/index.ts`.

Use it when you need the current request-parsing behavior, plan-construction rules, or planner failure surface.

## Entry points

### `parseUserRequest(userRequest)`

Normalizes one natural-language request into the planner’s current objective shape.

Current behavior:

- lowercases and normalizes the request text
- extracts supported intent flags for tonal, cleanup, level, dynamics, timing, pitch, and stereo/spatial directions
- extracts some numeric hints such as explicit semitone shifts or timing percentages
- records unsupported phrasing separately from supported but underspecified phrasing
- records runtime-available but not planner-enabled requests separately from fully unsupported ones

This helper does not inspect `AnalysisReport` or `SemanticProfile`. It only parses the request text.

### `planEdits(options)`

Builds a canonical `EditPlan` from:

- `userRequest`
- `audioVersion`
- `analysisReport`
- `semanticProfile`
- optional planner constraints and timestamp override

Current behavior:

- validates the inbound `AudioVersion`, `AnalysisReport`, and `SemanticProfile`
- checks provenance consistency across those three artifacts
- parses the request into planner objectives
- rejects contradictory or underspecified requests before step construction
- rejects runtime-only requests with a distinct `supported_runtime_only_but_not_planner_enabled` failure class
- grounds the plan against `defaultRuntimeCapabilityManifest.manifest_id`
- builds ordered steps through the current step builders
- emits `goals`, optional `constraints`, and typed `verification_targets`
- schema-validates the final `EditPlan`

Important defaults:

- `capability_manifest_id` always comes from the current default runtime capability manifest
- `created_at` defaults to `semanticProfile.generated_at` unless `generatedAt` is provided

### `createPlanningFailure(failureClass, message, details?)`

Constructs the current structured planner error shape.

### `PlanningFailure`

The exported planner-specific error class used by the module when a request is supported but unsafe, unsupported, or runtime-only from the planner’s perspective.

## Current failure classes

The public planner failure surface currently distinguishes:

- `supported_but_underspecified`
- `unsupported`
- `supported_runtime_only_but_not_planner_enabled`

Adapters should preserve that distinction instead of flattening every planner refusal into one generic message.

## Validation helpers

### `assertValidEditPlan(plan)`

Throws if a payload fails the published `EditPlan` contract.

### `isValidEditPlan(plan)`

Returns `true` when a payload satisfies the published `EditPlan` contract.

## Public types and constants

`src/index.ts` re-exports the current local planner types for:

- `PlanEditsOptions`
- parsed-objective and request-classification types
- `EditPlan`, `EditPlanStep`, `EditTarget`, and `OperationName`
- verification-target types
- the reduced local `AnalysisReport`, `SemanticProfile`, and `AudioVersion` views used by the planner
- `CONTRACT_SCHEMA_VERSION`

These types describe what the planner currently consumes and emits. The shared artifact contract source of truth remains under `contracts/schemas/`.

## Current planning boundary

The baseline planner currently:

- plans only operations marked `planner_supported` in the published capability manifest
- stays conservative around cleanup, timing, pitch, dynamics, and stereo moves
- prefers explicit failure over hidden fallback behavior
- uses analysis and semantic evidence to refine frequencies, thresholds, and verification targets

The baseline planner still does not auto-select runtime-only operations such as creative effects, routing utilities, or the broader runtime-only Layer 1 surface.

## Known limitations

- parsing remains heuristic and phrase-based
- some requests are intentionally rejected even when the runtime could execute them directly
- pitch shifting is only planner-enabled when the source reads as pitched material
- several compound requests are still rejected rather than combined in one pass when the planner cannot justify a safe deterministic mapping
- cross-family compounds are supported only when the fixed planner phase order can express them safely; incompatible one-pass mixes such as brightening-plus-de-essing, denoise-plus-brightening, hum-removal-plus-warmth, or too-narrow recenter-plus-narrower stereo requests still fail explicitly
