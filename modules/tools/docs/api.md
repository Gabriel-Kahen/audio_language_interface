# Tools API

## Public exports

- `createToolRegistry(definitions?)`
- `defaultToolRegistry`
- `describeTools(registry?)`
- `validateToolRequestEnvelope(value)`
- `executeToolRequest(request, options)`
- `assertValidToolResponse(response)`
- `isValidToolResponse(response)`

`describeTools()` returns stable per-tool metadata including required and optional arguments, supported error codes, and any explicit capabilities exposed by the tool layer.

## Supported callable tools

### `describe_runtime_capabilities`

- backing module: `capabilities`
- required arguments: none
- optional arguments: none

Returns a `runtime_capability_manifest` object containing the published runtime capability surface.

### `load_audio`

- backing module: `io`
- required arguments:
  - `input_path`
- optional arguments:
  - `output_directory`
  - `normalization_target`
  - `tags`
  - `notes`

Returns imported `asset`, imported `version`, source and materialized metadata, output path, and a `normalized` flag.

### `analyze_audio`

- backing module: `analysis`
- required arguments:
  - `audio_version`
- optional arguments:
  - `generated_at`
  - `include_annotations`
  - `include_segments`
  - `include_source_character`

Returns a `report` object containing the `AnalysisReport`. The include flags only trim response sections after the analysis runs.

### `plan_edits`

- backing module: `planning`
- required arguments:
  - `audio_version`
  - `analysis_report`
  - `semantic_profile`
  - `user_request`
- optional arguments:
  - `generated_at`
  - `constraints`

Returns an `edit_plan` object containing the canonical `EditPlan`.

If the request cannot be planned conservatively, `plan_edits` returns `invalid_arguments` with `error.details.field = "arguments.user_request"` and a planner-specific `failure_class` of:

- `supported_but_underspecified`
- `unsupported`
- `supported_runtime_only_but_not_planner_enabled`

That detail payload may also include `matched_requests`, `runtime_only_operations`, `planner_supported_operations`, `capability_manifest_id`, and `suggested_directions`.

### `apply_edit_plan`

- backing module: `transforms`
- required arguments:
  - `audio_version`
  - `edit_plan`
- optional arguments:
  - `output_dir`
  - `output_version_id`
  - `record_id`

Returns `output_version`, `transform_record`, and normalized FFmpeg `commands`. Runtime warnings are surfaced in top-level `ToolResponse.warnings`.

`describeTools()` also exposes `apply_edit_plan.capabilities.supported_operations` and `apply_edit_plan.capabilities.capability_manifest_id` so callers can reject unsupported plan steps before execution.

Current runtime-aware tool behavior:

- tool-layer validation accepts the published runtime capability operation set, including runtime-only operations when the caller provides an explicit valid plan
- tool-layer validation preflights published target-scope support from the runtime capability manifest, including the current first-cohort `time_range` surface and the remaining `full_file`-only operations
- tool-layer validation also preflights a small set of stable runtime constraints such as stereo-only processing requirements
- `apply_edit_plan` may omit measured peak or loudness fields for `normalize`; the runtime resolves those measurements during execution while keeping the canonical plan and record contracts explicit

### `render_preview`

- backing module: `render`
- required arguments:
  - `audio_version`
- optional arguments:
  - `output_dir`
  - `output_file_name`
  - `render_id`
  - `bitrate`
  - `sample_rate_hz`
  - `channels`
  - `loudness_summary`

Returns the preview `artifact` and normalized FFmpeg `command`. Artifact warnings are mirrored to top-level `ToolResponse.warnings`.

### `compare_versions`

- backing module: `compare`
- required arguments:
  - `baseline_version`
  - `candidate_version`
  - `baseline_analysis`
  - `candidate_analysis`
- optional arguments:
  - `edit_plan`
  - `comparison_id`
  - `generated_at`

Returns a `comparison_report`.

### `run_request_cycle`

- backing module: `orchestration`
- required arguments:
  - `user_request`
  - `input`
- optional arguments:
  - `render_kind`
  - `revision`

`arguments.input` supports two explicit shapes:

- import input:
  - `kind = "import"`
  - required: `input_path`
  - optional: `import_options`
- existing input:
  - `kind = "existing"`
  - required:
    - `asset`
    - `audio_version`
    - `session_graph`
  - optional:
    - `available_versions`

Returns the completed request-cycle artifact set:

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

Important follow-up behavior:

- `run_request_cycle` exposes session-aware follow-up requests through the published tool surface, including `more`, `less`, `undo`, `revert to previous version`, and `try another version`
- the tool remains explicit and stateless: it does not maintain hidden session state or resolve historical versions by id
- callers using `input.kind = "existing"` must provide the current `session_graph`
- revert-style and alternate-version flows must also provide any required historical `AudioVersion` artifacts in `arguments.input.available_versions`

If orchestration cannot resolve a follow-up safely because required historical versions were not provided, the tool returns `invalid_arguments`, typically pointing at `arguments.input.available_versions`.

## Validation behavior

- `validateToolRequestEnvelope` validates only the shared `ToolRequest` contract.
- Tool-specific argument validation happens in each handler so payload expectations stay explicit and inspectable.
- Contract-bearing nested payloads such as `audio_version`, `baseline_analysis`, and `edit_plan` are validated against their published contracts before handler execution.
- Canonical nested outputs such as `asset`, `version`, `report`, `transform_record`, `artifact`, and `comparison_report` are revalidated at the tool boundary before a success response is returned.
- Unknown tools are not rejected during envelope validation. They produce a contract-valid error `ToolResponse` during execution.

## Error codes

- `unknown_tool`: the request envelope is valid but `tool_name` is not registered.
- `provenance_mismatch`: the request envelope metadata does not match the canonical asset/version lineage carried in nested contract objects.
- `invalid_arguments`: the envelope is valid but the tool-specific `arguments` payload is malformed.
- `unsupported_operation`: the request is structurally valid but asks a tool to execute an operation that this tool surface does not support.
- `invalid_result_contract`: a backing module returned a payload that does not satisfy the canonical contract expected at the tool boundary.
- `handler_failed`: the handler threw an unexpected runtime error.

Unknown-tool responses include `error.details.available_tools` to help a caller recover without an extra capability lookup.

Provenance mismatch responses include a `field` plus the conflicting ids so a caller can repair and retry deterministically.

Unsupported-operation responses include the current `supported_operations` list when a tool advertises a narrower callable subset than its surrounding contracts.

For currently supported operations that still have input-shape or runtime-prerequisite constraints, the tool layer uses `invalid_arguments` with machine-readable field details rather than `unsupported_operation`.

## Current non-goals

- The tool layer does not maintain hidden session state or resolve versions from ids.
