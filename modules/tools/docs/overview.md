# Tools Overview

## Purpose

Expose a stable LLM-facing tool surface over the internal runtime modules.

The current implementation provides a registry-backed execution layer with schema-aware request validation, module-backed handlers, and contract-valid `ToolResponse` results.

## Public API surface

- `createToolRegistry(definitions?)`
- `defaultToolRegistry`
- `describeTools(registry?)`
- `validateToolRequestEnvelope(value)`
- `executeToolRequest(request, options)`
- `assertValidToolResponse(response)` and `isValidToolResponse(response)`

## Implemented initial tool set

- `load_audio` -> `modules/io`
- `analyze_audio` -> `modules/analysis`
- `plan_edits` -> `modules/planning`
- `apply_edit_plan` -> `modules/transforms`
- `render_preview` -> `modules/render`
- `compare_versions` -> `modules/compare`

`apply_edit_plan` now exposes the full currently implemented locked Phase 2 runtime subset: the stable baseline operations plus `compressor`, `limiter`, `stereo_width`, and `denoise`.

`load_audio` now defaults to `io`'s shared WAV normalization target when callers omit `normalization_target`, so versions materialized through the tool surface remain compatible with the current analysis baseline.

## Implemented source files

- `src/tool-registry.ts`: tool definitions and discovery
- `src/execute-tool-request.ts`: top-level tool execution flow
- `src/runtime.ts`: runtime dependency resolution
- `src/errors.ts`: tool-surface error types
- `src/types.ts`: request, response, and handler type shapes
- `src/validation.ts`: request validation and coercion
- `src/handlers/load-audio.ts`: import-facing tool handler
- `src/handlers/analyze-audio.ts`: analysis-facing tool handler
- `src/handlers/plan-edits.ts`: planning-facing tool handler
- `src/handlers/apply-edit-plan.ts`: transform-facing tool handler
- `src/handlers/render-preview.ts`: render-facing tool handler
- `src/handlers/compare-versions.ts`: compare-facing tool handler
- `src/index.ts`: public exports only

## Dependencies

- `modules/core`
- stable contracts across runtime modules
- `ToolRequest` and `ToolResponse` contracts

## Downstream consumers

- external LLM integrations
- `orchestration`

## Non-goals

- reimplementing lower-level business logic
- owning full workflow state machines
- hiding cross-module coupling behind opaque calls

## Test expectations

- verify request validation
- verify handler routing and normalized responses
- verify errors and warnings are stable and machine-readable
- verify contract alignment for `ToolRequest` and `ToolResponse`

See `docs/api.md` for the concrete callable tool surface and payload conventions.

## Current limitations

- The tool surface is intentionally smaller than the set of implemented runtime modules and contract-declared operations.
- `plan_edits` is exposed as a callable tool and returns a contract-valid `EditPlan`.
- `apply_edit_plan` stays schema-aligned with the published `EditPlan` contract and forwards supported locked Phase 2 operations directly to `modules/transforms`.
- `apply_edit_plan` also preflights a small set of stable runtime prerequisites such as stereo-only width processing and full-file-only Phase 2 transform targets.
- The tool layer does not maintain session state or resolve artifacts by id.
- Tool-specific argument validation happens inside handlers rather than through one centralized schema per tool.
