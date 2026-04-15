# `render_preview` Tool Contract

## Purpose

Defines the tool envelope for creating an MP3 preview from one `AudioVersion`.

## Request

- `tool_name` must be `render_preview`
- `arguments.audio_version` is required
- optional arguments:
  - `output_dir`
  - `output_file_name`
  - `render_id`
  - `bitrate`
  - `sample_rate_hz`
  - `channels`
  - `loudness_summary`

## Success response

- `result.artifact`: `RenderArtifact`
- `result.command`: normalized render command

Artifact warnings may also be mirrored to `ToolResponse.warnings`.

## Schemas

- `contracts/schemas/json/render-preview-tool-request.schema.json`
- `contracts/schemas/json/render-preview-tool-response.schema.json`

## Example payloads

- `contracts/examples/render-preview-tool-request.json`
- `contracts/examples/render-preview-tool-response.json`
