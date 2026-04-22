# `interpret_request` Tool Contract

## Purpose

Defines the tool envelope for running the optional LLM-backed request interpretation layer and returning a contract-valid `IntentInterpretation`.

This tool does not plan or execute edits. It exists so callers can inspect the interpretation artifact directly before deterministic planning.

## Request

- `tool_name` must be `interpret_request`
- required arguments:
  - `audio_version`
  - `analysis_report`
  - `semantic_profile`
  - `user_request`
  - `provider`
- optional arguments:
  - `capability_manifest`
  - `prompt_version`

The tool requires an explicit provider config. It does not read API keys from hidden environment state.

## Success response

On success, `result.intent_interpretation` contains a contract-valid `IntentInterpretation`.

That artifact captures a bounded interpretation proposal only. Callers must still pass it through deterministic planning or refuse unsupported/ambiguous requests explicitly.

## Failure behavior

This tool follows the shared `ToolResponse` envelope and may return:

- `invalid_arguments`
- `provenance_mismatch`
- `invalid_result_contract`
- `handler_failed`

## Schemas

- `contracts/schemas/json/interpret-request-tool-request.schema.json`
- `contracts/schemas/json/interpret-request-tool-response.schema.json`

## Example payloads

- `contracts/examples/interpret-request-tool-request.json`
- `contracts/examples/interpret-request-tool-response.json`
