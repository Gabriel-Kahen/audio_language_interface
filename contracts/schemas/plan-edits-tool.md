# Plan Edits Tool

## Purpose

`plan_edits` converts a natural-language request plus current audio evidence into an explicit `EditPlan`.

This tool belongs to the adapter layer, but the resulting artifact is owned by the intent layer.

## Request shape

The request uses the common `ToolRequest` envelope with:

- `tool_name = "plan_edits"`
- `arguments.audio_version`
- `arguments.analysis_report`
- `arguments.semantic_profile`
- `arguments.user_request`

Optional arguments:

- `generated_at`
- `constraints`
- `intent_interpretation`

## Success response

On success, `result.edit_plan` contains a contract-valid `EditPlan`.

The returned plan must include `capability_manifest_id` so downstream callers know which runtime capability surface the planner used.

When present, `intent_interpretation` gives the planner a contract-valid normalized request proposal from the optional interpretation layer. Planning still validates and may reject that proposal deterministically.

## Failure behavior

The tool follows the shared `ToolResponse` envelope and may return:

- `invalid_arguments`
- `provenance_mismatch`
- `invalid_result_contract`
- `handler_failed`

Planner clarification failures are surfaced as `invalid_arguments` with `error.details.field = "arguments.user_request"` plus a stable `failure_class` of:

- `supported_but_underspecified`
- `unsupported`
- `supported_runtime_only_but_not_planner_enabled`

When available, `error.details` also includes `matched_requests`, `runtime_only_operations`, `planner_supported_operations`, `capability_manifest_id`, and `suggested_directions`.
