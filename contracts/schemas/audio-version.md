# AudioVersion

## Purpose

Represents one concrete state of an audio asset at a point in its edit lineage.

## Producers

- `modules/io`
- `modules/transforms`
- `modules/render` when render-linked versions are materialized

## Consumers

- all runtime modules

## Required fields

| Field | Type | Description |
| --- | --- | --- |
| `schema_version` | string | Contract version identifier. |
| `version_id` | string | Stable version identifier. |
| `asset_id` | string | Owning `AudioAsset` identifier. |
| `lineage.created_at` | string | ISO 8601 UTC timestamp. |
| `lineage.created_by` | string | Module or system that produced this version. |
| `audio.storage_ref` | string | Explicit reference to the audio data. |
| `audio.sample_rate_hz` | number | Sample rate for this version. |
| `audio.channels` | number | Channel count for this version. |
| `audio.duration_seconds` | number | Duration of this version. |
| `audio.frame_count` | number | Number of sample frames. |

## Storage reference convention

For the initial implementation, `audio.storage_ref` should be a workspace-relative POSIX-style path to the materialized audio artifact.

Do not use `null` for `parent_version_id`. Omit the field when no parent exists.

## Optional fields

| Field | Type | Description |
| --- | --- | --- |
| `parent_version_id` | string | Parent version when this is derived. |
| `lineage.reason` | string | Short explanation of why the version exists. |
| `lineage.plan_id` | string | Related `EditPlan` when applicable. |
| `lineage.transform_record_id` | string | Related `TransformRecord` when applicable. |
| `audio.channel_layout` | string | Layout such as `mono` or `stereo`. |
| `state.is_original` | boolean | Indicates whether this is the imported original. |
| `state.is_preview` | boolean | Indicates whether this version is preview-only. |

## Invariants

- `asset_id` must point to an existing `AudioAsset`.
- `parent_version_id` must never equal `version_id`.
- `frame_count` and `duration_seconds` must agree with the stored audio.

## Example

See `contracts/examples/audio-version.json`.
