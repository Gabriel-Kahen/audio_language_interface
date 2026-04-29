# `run_request_cycle` Tool Contract

## Purpose

Defines the tool envelope for running the full orchestration editing cycle, including explicit session-aware follow-up requests such as `more`, `less`, `undo`, `revert to previous version`, `try another version`, and `retry`, plus clarification-required request interpretation flows.

This tool is the adapter-layer entrypoint for one-shot and iterative request-cycle execution. It delegates workflow logic to `modules/orchestration` while keeping session history explicit at the tool boundary.

## Request

- `tool_name` must be `run_request_cycle`
- required arguments:
  - `user_request`
  - `input`
- optional arguments:
  - `render_kind`
  - `interpretation`
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
- clarification-resume flows also reuse the caller-provided `SessionGraph`; orchestration records pending clarification state there instead of inventing hidden adapter state

When `arguments.interpretation` is present, it is an explicit opt-in object:

- `mode = "llm_assisted"`
- optional `policy`
- `provider.kind`
- `api_key` for `openai` and `google`
- `provider.model` for `openai` and `google`
- optional `provider.model` for `codex_cli`
- optional `provider.api_base_url` for `openai` and `google`
- optional `provider.temperature` for `openai` and `google`
- optional `provider.timeout_ms`
- optional `provider.max_retries`
- optional `provider.codex_path` for `codex_cli`
- optional `provider.profile` for `codex_cli`
- optional `prompt_version`

`arguments.interpretation.policy` accepts:

- `conservative`: ambiguity may stay `clarify`
- `best_effort`: ordinary ambiguity should prefer a best planner-facing interpretation and usually continue with `plan`

When omitted, orchestration forwards the interpretation module default of `conservative`.

Request provenance must stay explicit:

- `request.asset_id`, when provided, must match `arguments.input.asset.asset_id`
- `request.version_id`, when provided, must match `arguments.input.audio_version.version_id`
- `request.session_id`, when provided, must match `arguments.input.session_graph.session_id`
- `arguments.input.session_graph.active_refs` must point at the same current asset/version as `arguments.input.asset` and `arguments.input.audio_version`

## Success response

On success, `result` contains one of two success shapes.

Applied or reverted cycles return the completed request-cycle artifacts:

- `result_kind`
- `asset`
- `input_version`
- `input_analysis`
- `follow_up_resolution`
- optional `semantic_profile`
- optional `intent_interpretation`
- optional `edit_plan`
- `output_version`
- optional `transform_record`
- optional `commands`
- `output_analysis`
- `version_comparison_report`
- `baseline_render`
- `candidate_render`
- `render_comparison_report`
- `comparison_report`
- `session_graph`
- optional `revision`
- optional `iterations`
- `trace`

Clarification-required cycles return:

- `result_kind = "clarification_required"`
- `asset`
- `input_version`
- `input_analysis`
- `follow_up_resolution`
- optional `semantic_profile`
- optional `intent_interpretation`
- `clarification`
  - `question`
  - `pending_clarification`
- `session_graph`
- `trace`

Important response semantics:

- `version_comparison_report` is the authoritative version-to-version quality signal for the completed cycle
- `render_comparison_report` remains the final render-to-render comparison artifact
- `comparison_report` is preserved as a backward-compatible alias of `render_comparison_report`
- `follow_up_resolution` makes the resolved request explicit so callers can see whether the tool:
  - applied the direct request
  - treated the current request as a clarification answer
  - repeated the last request for `more`
  - branched and replayed the prior request for `try another version` or `retry`
  - reverted to a concrete historical version for `less`, `undo`, or `revert`
- when interpretation is enabled, `intent_interpretation` makes the normalized planner-facing request and any ambiguity flags explicit without bypassing deterministic planning
- the richer interpretation artifact may also expose `next_action`, descriptor hypotheses, constraints, region-intent proposals, alternate candidates, and follow-up interpretation metadata
- when `result_kind = "clarification_required"`, `session_graph.metadata.pending_clarification` becomes the explicit resume token for the next request-cycle call

## Failure behavior

This tool follows the shared `ToolResponse` envelope and may return:

- `invalid_arguments`
- `provenance_mismatch`
- `invalid_result_contract`
- `handler_failed`

Historical follow-up resolution failures should surface as `invalid_arguments`, typically with:

- `error.details.field = "arguments.input.available_versions"` when a required historical version was not provided
- `error.details.stage` when orchestration failed while resolving or loading follow-up history
- `error.details.partial_result` when orchestration had recoverable session or artifact state at the failure boundary

## Schemas

- `contracts/schemas/json/run-request-cycle-tool-request.schema.json`
- `contracts/schemas/json/run-request-cycle-tool-response.schema.json`

## Example payloads

- `contracts/examples/run-request-cycle-tool-request.json`
- `contracts/examples/run-request-cycle-tool-response.json`
