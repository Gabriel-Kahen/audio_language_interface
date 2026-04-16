# TempoEstimate

## Purpose

Captures standalone tempo-estimation output for one `AudioVersion` without adding beat-grid,
bar, or arrangement semantics.

## Producers

- `modules/analysis` via `estimateTempo`

## Consumers

- `modules/planning`
- `modules/tools`
- downstream app layers that need coarse BPM hints

## Required fields

| Field | Type | Description |
| --- | --- | --- |
| `bpm` | number or null | Best supported BPM, or `null` when no confident tempo is available. |
| `confidence` | number | Normalized confidence score from `0` to `1`. |

## Optional fields

| Field | Type | Description |
| --- | --- | --- |
| `beat_interval_seconds` | number | Derived beat interval for the selected BPM. |
| `ambiguity_candidates_bpm` | array | Alternate BPM candidates when confidence is low or ambiguity remains. |

## Invariants

- `confidence` must stay in the `0` to `1` range.
- `beat_interval_seconds` must be omitted when `bpm` is `null`.
- `ambiguity_candidates_bpm`, when present, should list positive BPM values only.
- The contract does not encode bars, measures, downbeats, or tempo maps.

## Example

See `contracts/examples/tempo-estimate.json`.
