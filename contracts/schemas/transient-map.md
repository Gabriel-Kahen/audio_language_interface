# TransientMap

## Purpose

Captures deterministic transient-detection results for an `AudioVersion` without introducing timeline, bar, beat, or DAW semantics.

## Producers

- transient-detection tooling
- `modules/analysis` when it emits event-level transient maps

## Consumers

- `modules/planning`
- `modules/transforms`
- `modules/tools`
- `modules/orchestration`

## Required fields

| Field | Type | Description |
| --- | --- | --- |
| `schema_version` | string | Contract version identifier. |
| `transient_map_id` | string | Stable transient-map identifier. |
| `asset_id` | string | Referenced asset identifier. |
| `version_id` | string | Referenced version identifier. |
| `generated_at` | string | ISO 8601 UTC timestamp. |
| `detector.name` | string | Detector entrypoint name. |
| `detector.version` | string | Detector implementation version. |
| `transients` | array | Ordered transient events. |

## Transient fields

Each transient should include:

- `time_seconds`
- `strength`

Optional transient fields:

- `kind`
- `confidence`

## Invariants

- `transients` should be emitted in ascending `time_seconds` order.
- `strength` should be normalized to the `0` to `1` range.
- `confidence`, when present, should also be normalized to the `0` to `1` range.
- `kind`, when present, is detector-local and should not imply musical structure or grid position.
- The contract does not encode bars, beats, measures, or edit regions.

## Example

See `contracts/examples/transient-map.json`.
