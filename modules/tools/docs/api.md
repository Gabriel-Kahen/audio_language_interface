# Tools API

## Public exports

- `createToolRegistry(definitions?)`
- `defaultToolRegistry`
- `describeTools(registry?)`
- `validateToolRequestEnvelope(value)`
- `executeToolRequest(request, options)`
- `assertValidToolResponse(response)`
- `isValidToolResponse(response)`

## Supported callable tools

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

## Validation behavior

- `validateToolRequestEnvelope` validates only the shared `ToolRequest` contract.
- Tool-specific argument validation happens in each handler so payload expectations stay explicit and inspectable.
- Contract-bearing nested payloads such as `audio_version`, `baseline_analysis`, and `edit_plan` are validated against their published contracts before handler execution.
- Canonical nested outputs such as `asset`, `version`, `report`, `transform_record`, `artifact`, and `comparison_report` are revalidated at the tool boundary before a success response is returned.
- Unknown tools are not rejected during envelope validation. They produce a contract-valid error `ToolResponse` during execution.

## Error codes

- `unknown_tool`: the request envelope is valid but `tool_name` is not registered.
- `invalid_arguments`: the envelope is valid but the tool-specific `arguments` payload is malformed.
- `handler_failed`: the handler threw an unexpected runtime error.

## Current non-goals

- `plan_edits` is intentionally not exposed yet because `modules/planning` does not have a runtime implementation.
- The tool layer does not maintain hidden session state or resolve versions from ids.
