# `apply_edit_plan` Tool Contract

## Purpose

Defines the tool envelope for executing an explicit `EditPlan` against one `AudioVersion`.

## Request

- `tool_name` must be `apply_edit_plan`
- `arguments.audio_version` and `arguments.edit_plan` are required
- `arguments.audio_version` must match the canonical `AudioVersion` contract
- `arguments.edit_plan` must match the canonical `EditPlan` contract, including operation-specific parameter shapes for the locked Phase 2 transform batch
- optional arguments:
  - `output_dir`
  - `output_version_id`
  - `record_id`

The request schema and current tool runtime support the published `apply_edit_plan` operation set currently implemented by `modules/transforms`, including `pitch_shift`, `compressor`, `limiter`, `time_stretch`, `stereo_width`, and `denoise`.

## Success response

- `result.output_version`: transformed `AudioVersion`
- `result.transform_record`: emitted `TransformRecord`
- `result.commands`: normalized command list used by the runtime

`result.output_version` and `result.transform_record` reuse the canonical artifact contracts directly.

Warnings are surfaced through the shared top-level `ToolResponse.warnings` array.

## Schemas

- `contracts/schemas/json/apply-edit-plan-tool-request.schema.json`
- `contracts/schemas/json/apply-edit-plan-tool-response.schema.json`

## Example payloads

- `contracts/examples/apply-edit-plan-tool-request.json`
- `contracts/examples/apply-edit-plan-tool-response.json`
