# Tools Overview

## Purpose

Expose a stable LLM-facing tool surface over the internal runtime modules.

`tools` is an adapter layer. It sits on top of the runtime and intent modules without redefining their responsibilities.

The current implementation provides a registry-backed execution layer with schema-aware request validation, module-backed handlers, capability discovery, and contract-valid `ToolResponse` results.

## Public API surface

- `createToolRegistry(definitions?)`
- `defaultToolRegistry`
- `describeTools(registry?)`
- `validateToolRequestEnvelope(value)`
- `executeToolRequest(request, options)`
- `assertValidToolResponse(response)` and `isValidToolResponse(response)`

## Implemented tool set

- `describe_runtime_capabilities` -> `modules/capabilities`
- `load_audio` -> `modules/io`
- `analyze_audio` -> `modules/analysis`
- `interpret_request` -> `modules/interpretation`
- `plan_edits` -> `modules/planning`
- `apply_edit_plan` -> `modules/transforms`
- `render_preview` -> `modules/render`
- `compare_versions` -> `modules/compare`
- `run_request_cycle` -> `modules/orchestration`

`apply_edit_plan` exposes the currently implemented runtime operation set declared by the published capability manifest.

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
- `src/handlers/interpret-request.ts`: interpretation-facing tool handler
- `src/handlers/plan-edits.ts`: planning-facing tool handler
- `src/handlers/apply-edit-plan.ts`: transform-facing tool handler
- `src/handlers/render-preview.ts`: render-facing tool handler
- `src/handlers/compare-versions.ts`: compare-facing tool handler
- `src/handlers/run-request-cycle.ts`: orchestration-facing request-cycle handler
- `src/index.ts`: public exports only

## Dependencies

- `modules/core`
- `modules/capabilities`
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
- `describe_runtime_capabilities` is exposed as a callable tool and returns a contract-valid `RuntimeCapabilityManifest`.
- `apply_edit_plan` stays schema-aligned with the published `EditPlan` contract and forwards supported runtime operations directly to `modules/transforms`.
- `apply_edit_plan` preflights published target-scope support from the runtime capability manifest and still validates runtime prerequisites such as stereo-only processing where applicable.
- `apply_edit_plan` can defer peak or loudness probing for `normalize` until runtime execution while still requiring the rest of the step to stay inside the published contract surface.
- `run_request_cycle` exposes orchestration-backed iterative follow-up behavior without introducing hidden tool-layer session state.
- `interpret_request` exposes the optional provider-backed interpretation layer directly for callers that want a contract-valid `IntentInterpretation` before planning.
- `interpret_request` now accepts explicit `session_context`, an `interpretation_policy` switch, and provider timeout and retry settings, so callers can interpret fuzzy follow-ups without hidden adapter state.
- `run_request_cycle` can also forward an explicit opt-in `interpretation` configuration when the runtime injects an `interpretRequest` implementation, and it surfaces the resulting richer interpretation artifacts back to the caller.
- `run_request_cycle` now surfaces clarification-required outcomes explicitly and stores only the minimal clarification resume token in `session_graph.metadata.pending_clarification`.
- The tool layer still does not maintain session state or resolve artifacts by id. Session-aware follow-up calls must provide an explicit `SessionGraph` plus any materialized `available_versions` needed for historical lookups.
- Orchestration stage failures preserve recoverable `partial_result` details in tool errors when available so external callers can inspect the last valid session graph or artifact state.
- The tool layer does not persist interpretation state between calls. Callers must opt into interpretation again on each `run_request_cycle` request, even when they resume a pending clarification through the explicit `SessionGraph`.
- Tool-specific argument validation happens inside handlers rather than through one centralized schema per tool.
