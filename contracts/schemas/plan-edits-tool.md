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

## Success response

On success, `result.edit_plan` contains a contract-valid `EditPlan`.

The returned plan must include `capability_manifest_id` so downstream callers know which runtime capability surface the planner used.

## Failure behavior

The tool follows the shared `ToolResponse` envelope and may return:

- `invalid_arguments`
- `provenance_mismatch`
- `invalid_result_contract`
- `handler_failed`
