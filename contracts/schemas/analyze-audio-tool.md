# `analyze_audio` Tool Contract

## Purpose

Defines the tool envelope for running deterministic analysis on one `AudioVersion`.

## Request

- `tool_name` must be `analyze_audio`
- `arguments.audio_version` is required
- optional arguments:
  - `generated_at`
  - `include_annotations`
  - `include_segments`
  - `include_source_character`

## Success response

- `result.report`: `AnalysisReport`

The include flags affect which optional sections are returned to the caller, not whether analysis is executed.

## Schemas

- `contracts/schemas/json/analyze-audio-tool-request.schema.json`
- `contracts/schemas/json/analyze-audio-tool-response.schema.json`

## Example payloads

- `contracts/examples/analyze-audio-tool-request.json`
- `contracts/examples/analyze-audio-tool-response.json`
