# `apply_edit_plan` Tool Contract

## Purpose

Defines the tool envelope for executing an explicit `EditPlan` against one `AudioVersion`.

## Request

- `tool_name` must be `apply_edit_plan`
- `arguments.audio_version` and `arguments.edit_plan` are required
- optional arguments:
  - `output_dir`
  - `output_version_id`
  - `record_id`

## Success response

- `result.output_version`: transformed `AudioVersion`
- `result.transform_record`: emitted `TransformRecord`
- `result.commands`: normalized command list used by the runtime

Warnings are surfaced through the shared top-level `ToolResponse.warnings` array.

## Schemas

- `contracts/schemas/json/apply-edit-plan-tool-request.schema.json`
- `contracts/schemas/json/apply-edit-plan-tool-response.schema.json`

## Example payloads

- `contracts/examples/apply-edit-plan-tool-request.json`
- `contracts/examples/apply-edit-plan-tool-response.json`
