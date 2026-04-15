# `load_audio` Tool Contract

## Purpose

Defines the `ToolRequest` and `ToolResponse` shapes for importing a local audio file into workspace storage.

## Request

- `tool_name` must be `load_audio`
- `arguments.input_path` is required
- optional arguments:
  - `output_directory`
  - `normalization_target`
  - `tags`
  - `notes`

## Success response

- `result.asset`: imported `AudioAsset`
- `result.version`: imported initial `AudioVersion`
- `result.source_metadata`: decoded source media facts
- `result.materialized_metadata`: stored workspace media facts
- `result.output_path`: materialized file path returned by the runtime
- `result.normalized`: whether materialization changed the source encoding

## Schemas

- `contracts/schemas/json/load-audio-tool-request.schema.json`
- `contracts/schemas/json/load-audio-tool-response.schema.json`

## Example payloads

- `contracts/examples/load-audio-tool-request.json`
- `contracts/examples/load-audio-tool-response.json`
