# AudioAsset

## Purpose

Represents the external identity and source metadata of an imported audio item.

## Producers

- `modules/io`

## Consumers

- `modules/core`
- `modules/history`
- `modules/tools`
- `modules/orchestration`

## Required fields

| Field | Type | Description |
| --- | --- | --- |
| `schema_version` | string | Contract version identifier. |
| `asset_id` | string | Stable asset identifier. |
| `display_name` | string | Human-readable name for the asset. |
| `source.kind` | string | One of `file`, `bytes`, `stream`, or `generated`. |
| `source.imported_at` | string | ISO 8601 UTC timestamp. |
| `media.container_format` | string | File container such as `wav` or `flac`. |
| `media.codec` | string | Codec name such as `pcm_s16le`. |
| `media.sample_rate_hz` | number | Source sample rate. |
| `media.channels` | number | Channel count. |
| `media.duration_seconds` | number | Source duration in seconds. |

## Optional fields

| Field | Type | Description |
| --- | --- | --- |
| `source.uri` | string | Source path or URI if one exists. |
| `source.checksum_sha256` | string | Content checksum for deduplication and provenance. |
| `media.bit_depth` | number | Bit depth when known. |
| `media.channel_layout` | string | Layout such as `mono`, `stereo`, or `5.1`. |
| `tags` | array of string | User or system labels. |
| `notes` | string | Free-form provenance note. |

## Invariants

- `asset_id` must remain stable across all derived versions.
- `duration_seconds` must be non-negative.
- `channels` must be at least `1`.

## Example

See `contracts/examples/audio-asset.json`.
