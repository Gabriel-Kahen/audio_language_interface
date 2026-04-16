# SliceMap

## Purpose

Captures deterministic slice boundaries derived from transient detection or another explicit slicing strategy without introducing timeline, bar, beat, or DAW semantics.

## Producers

- transient-slicing tooling
- `modules/analysis` when it emits slice maps

## Consumers

- `modules/planning`
- `modules/transforms`
- `modules/tools`
- `modules/orchestration`

## Required fields

| Field | Type | Description |
| --- | --- | --- |
| `schema_version` | string | Contract version identifier. |
| `slice_map_id` | string | Stable slice-map identifier. |
| `asset_id` | string | Referenced asset identifier. |
| `version_id` | string | Referenced version identifier. |
| `generated_at` | string | ISO 8601 UTC timestamp. |
| `slicer.name` | string | Slicer entrypoint name. |
| `slicer.version` | string | Slicer implementation version. |
| `slices` | array | Ordered slice definitions. |

## Optional fields

| Field | Type | Description |
| --- | --- | --- |
| `source_transient_map_id` | string | Referenced transient map when slices were derived from transient detection. |

## Slice fields

Each slice should include:

- `slice_id`
- `start_seconds`
- `end_seconds`

Optional slice fields:

- `peak_time_seconds`
- `label`
- `confidence`

## Invariants

- `slices` should be emitted in ascending `start_seconds` order.
- `start_seconds` and `end_seconds` should be non-negative, with `end_seconds` greater than `start_seconds`.
- `peak_time_seconds`, when present, should fall within the slice range.
- `confidence`, when present, should be normalized to the `0` to `1` range.
- The contract does not encode bars, beats, measures, or clip-grid semantics.

## Example

See `contracts/examples/slice-map.json`.
