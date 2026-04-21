# `run_request_cycle` Tool Contract

## Purpose

Defines the tool envelope for running the full orchestration editing cycle, including explicit session-aware follow-up requests such as `more`, `less`, `undo`, `revert to previous version`, and `try another version`.

This tool is the adapter-layer entrypoint for one-shot and iterative request-cycle execution. It delegates workflow logic to `modules/orchestration` while keeping session history explicit at the tool boundary.

## Request

- `tool_name` must be `run_request_cycle`
- required arguments:
  - `user_request`
  - `input`
- optional arguments:
  - `render_kind`
  - `revision`

`arguments.input` supports two explicit shapes:

- `kind = "import"`
  - required: `input_path`
  - optional: `import_options`
- `kind = "existing"`
  - required:
    - `asset`
    - `audio_version`
    - `session_graph`
  - optional:
    - `available_versions`

Important session-aware constraint:

- the tool layer does not maintain hidden session state or resolve historical versions by id
- follow-up requests against `kind = "existing"` therefore require callers to provide the current `SessionGraph`
- revert-style and alternate-version flows also require any needed historical `AudioVersion` artifacts to be materialized explicitly in `arguments.input.available_versions`

Request provenance must stay explicit:

- `request.asset_id`, when provided, must match `arguments.input.asset.asset_id`
- `request.version_id`, when provided, must match `arguments.input.audio_version.version_id`
- `request.session_id`, when provided, must match `arguments.input.session_graph.session_id`
- `arguments.input.session_graph.active_refs` must point at the same current asset/version as `arguments.input.asset` and `arguments.input.audio_version`

## Success response

On success, `result` contains the completed request-cycle artifacts:

- `result_kind`
- `asset`
- `input_version`
- `input_analysis`
- `follow_up_resolution`
- optional `semantic_profile`
- optional `edit_plan`
- `output_version`
- optional `transform_record`
- optional `commands`
- `output_analysis`
- `version_comparison_report`
- `baseline_render`
- `candidate_render`
- `render_comparison_report`
- `session_graph`
- optional `revision`
- optional `iterations`
- `trace`

Important response semantics:

- `version_comparison_report` is the authoritative version-to-version quality signal for the completed cycle
- `render_comparison_report` remains the final render-to-render comparison artifact
- `follow_up_resolution` makes the resolved request explicit so callers can see whether the tool:
  - applied the direct request
  - repeated the last request for `more`
  - branched and replayed the prior request for `try another version`
  - reverted to a concrete historical version for `less`, `undo`, or `revert`

## Failure behavior

This tool follows the shared `ToolResponse` envelope and may return:

- `invalid_arguments`
- `provenance_mismatch`
- `invalid_result_contract`
- `handler_failed`

Historical follow-up resolution failures should surface as `invalid_arguments`, typically with:

- `error.details.field = "arguments.input.available_versions"` when a required historical version was not provided
- `error.details.stage` when orchestration failed while resolving or loading follow-up history

## Schemas

- `contracts/schemas/json/run-request-cycle-tool-request.schema.json`
- `contracts/schemas/json/run-request-cycle-tool-response.schema.json`

## Example payloads

- `contracts/examples/run-request-cycle-tool-request.json`
- `contracts/examples/run-request-cycle-tool-response.json`
