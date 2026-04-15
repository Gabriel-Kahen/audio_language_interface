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
- `apply_edit_plan` -> `modules/transforms`
- `render_preview` -> `modules/render`
- `compare_versions` -> `modules/compare`

`plan_edits` is intentionally deferred. `modules/planning` now has a runtime implementation, but the tool layer does not expose it yet.

Within `apply_edit_plan`, the currently supported operation subset is narrower than the full Phase 2 contract surface. The tool layer allows the stable baseline operations plus `compressor` and `limiter`, while rejecting `stereo_width` and `denoise` explicitly until that execution path is supported end to end.

## Implemented source files

- `src/tool-registry.ts`: tool definitions and discovery
- `src/execute-tool-request.ts`: top-level tool execution flow
- `src/runtime.ts`: runtime dependency resolution
- `src/errors.ts`: tool-surface error types
- `src/types.ts`: request, response, and handler type shapes
- `src/validation.ts`: request validation and coercion
- `src/handlers/load-audio.ts`: import-facing tool handler
- `src/handlers/analyze-audio.ts`: analysis-facing tool handler
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
- `plan_edits` is not exposed as a callable tool yet.
- `apply_edit_plan` rejects `stereo_width` and `denoise` with explicit `unsupported_operation` responses, including multi-step unsupported combinations.
- The tool layer does not maintain session state or resolve artifacts by id.
- Tool-specific argument validation happens inside handlers rather than through one centralized schema per tool.
