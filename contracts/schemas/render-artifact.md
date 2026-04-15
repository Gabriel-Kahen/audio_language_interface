# RenderArtifact

## Purpose

Describes a rendered preview or export derived from an `AudioVersion`.

## Producers

- `modules/render`

## Consumers

- `modules/compare`
- `modules/history`
- `modules/tools`
- `modules/orchestration`

## Required fields

| Field | Type | Description |
| --- | --- | --- |
| `schema_version` | string | Contract version identifier. |
| `render_id` | string | Stable render identifier. |
| `asset_id` | string | Referenced asset identifier. |
| `version_id` | string | Source version identifier. |
| `kind` | string | One of `preview` or `final`. |
| `created_at` | string | ISO 8601 UTC timestamp. |
| `output.path` | string | File path to the rendered artifact. |
| `output.format` | string | Rendered file format. |
| `output.codec` | string | Probed codec name for the rendered audio stream. |
| `output.sample_rate_hz` | number | Output sample rate. |
| `output.channels` | number | Output channel count. |
| `output.duration_seconds` | number | Output duration. |

## Optional fields

| Field | Type | Description |
| --- | --- | --- |
| `output.file_size_bytes` | number | Rendered file size. |
| `loudness_summary` | object | Lightweight post-render level summary. |
| `warnings` | array of string | Non-fatal issues during rendering. |

## Output path convention

For the initial implementation, `output.path` should be a workspace-relative POSIX-style path to a materialized render file.

## Invariants

- `kind` must reflect the actual render intent.
- `output.path` must be explicit and materialized.
- Output metadata must describe the rendered file, not the source file.
- `output.codec` should describe the rendered stream codec as reported by metadata probing, not the encoder library name.

## Example

See `contracts/examples/render-artifact.json`.
