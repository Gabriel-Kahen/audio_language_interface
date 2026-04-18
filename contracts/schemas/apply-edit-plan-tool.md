# `apply_edit_plan` Tool Contract

## Purpose

Defines the tool envelope for executing an explicit `EditPlan` against one `AudioVersion`.

## Request

- `tool_name` must be `apply_edit_plan`
- `arguments.audio_version` and `arguments.edit_plan` are required
- `arguments.audio_version` must match the canonical `AudioVersion` contract
- `arguments.edit_plan` must match the canonical `EditPlan` contract, including `capability_manifest_id`
- optional arguments:
  - `output_dir`
  - `output_version_id`
  - `record_id`

The request schema and current tool runtime support the currently implemented runtime operation set exposed by `modules/transforms` and `RuntimeCapabilityManifest`, including `trim_silence`, `pitch_shift`, `high_shelf`, `low_shelf`, `notch_filter`, `tilt_eq`, `compressor`, `limiter`, `transient_shaper`, `clipper`, `gate`, `time_stretch`, `reverse`, `mono_sum`, `pan`, `channel_swap`, `channel_remap`, `stereo_balance_correction`, `mid_side_eq`, `stereo_width`, and `denoise`.

Per-operation target scope is governed by the published `RuntimeCapabilityManifest`. Requests should be rejected when a step uses a target scope that is not published for that runtime operation.

## Success response

- `result.output_version`: transformed `AudioVersion`
- `result.transform_record`: emitted `TransformRecord`
- `result.commands`: normalized command list used by the runtime

`result.output_version` and `result.transform_record` reuse the canonical artifact contracts directly.

`result.transform_record.operations[]` should preserve the executed `target` for every applied step so region-scoped edits remain inspectable after execution.

Warnings are surfaced through the shared top-level `ToolResponse.warnings` array.

## Schemas

- `contracts/schemas/json/apply-edit-plan-tool-request.schema.json`
- `contracts/schemas/json/apply-edit-plan-tool-response.schema.json`

## Example payloads

- `contracts/examples/apply-edit-plan-tool-request.json`
- `contracts/examples/apply-edit-plan-tool-response.json`
