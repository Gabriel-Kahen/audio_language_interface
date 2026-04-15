# Tools Overview

## Purpose

Expose a stable LLM-facing tool surface over the internal runtime modules.

## Public API surface

- register and describe available tools
- validate `ToolRequest` payloads
- route requests to module-backed handlers
- normalize `ToolResponse` payloads

## Implemented initial tool set

- `load_audio` -> `modules/io`
- `analyze_audio` -> `modules/analysis`
- `apply_edit_plan` -> `modules/transforms`
- `render_preview` -> `modules/render`
- `compare_versions` -> `modules/compare`

`plan_edits` is intentionally deferred. `modules/planning` currently has design docs but no runtime implementation to bind at the tool layer.

## Suggested initial source files

- `src/tool-registry.ts`: tool definitions and discovery
- `src/validation.ts`: request validation and coercion
- `src/handlers/load-audio.ts`: import-facing tool handler
- `src/handlers/analyze-audio.ts`: analysis-facing tool handler
- `src/handlers/plan-edits.ts`: planner-facing tool handler
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
