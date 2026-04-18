# TransformRecord

## Purpose

Captures the exact operations applied to create a new `AudioVersion`.

## Producers

- `modules/transforms`

## Consumers

- `modules/history`
- `modules/compare`
- `modules/tools`
- `modules/orchestration`

## Required fields

| Field | Type | Description |
| --- | --- | --- |
| `schema_version` | string | Contract version identifier. |
| `record_id` | string | Stable transform record identifier. |
| `asset_id` | string | Target asset identifier. |
| `input_version_id` | string | Source version identifier. |
| `output_version_id` | string | Produced version identifier. |
| `started_at` | string | ISO 8601 UTC timestamp. |
| `finished_at` | string | ISO 8601 UTC timestamp. |
| `operations` | array | Exact executed operations and parameters. |

## Operation fields

Each operation should include:

- `operation`
- `target`
- `parameters`
- `status`

## Initial operation status enum

`operations[].status` should initially use one of these values:

- `applied`
- `skipped`
- `failed`

## Optional fields

| Field | Type | Description |
| --- | --- | --- |
| `plan_id` | string | Related `EditPlan` identifier. |
| `capability_manifest_id` | string | Runtime capability manifest linked to the originating plan when available. |
| `warnings` | array of string | Non-fatal issues during execution. |
| `runtime_ms` | number | Total execution time in milliseconds. |

## Invariants

- `output_version_id` must differ from `input_version_id`.
- Recorded parameters must reflect executed behavior, not only requested behavior.
- Recorded targets must reflect executed scope, not only requested intent.
- Operation order must match actual execution order.
- `operations[].parameters` should use the same operation-specific surface as `EditPlan.steps[].parameters`.
- Execution-time normalization may add derived fields such as `applied_gain_db`, `applied_tempo_ratio`, `duration_seconds`, `fade_out_start_seconds`, `result_duration_seconds`, or `trimmed_duration_seconds` when those values reflect the exact applied behavior. Channel-utility operations intentionally keep parameter surfaces minimal and do not add hidden remix parameters beyond the published contract.
- Layer 1 runtime effects such as `reverb`, `delay`, `echo`, `bitcrush`, `distortion`, `saturation`, `flanger`, and `phaser` record the same published caller-facing parameter surface used in `EditPlan`. Runtime-specific implementation details should stay out of the contract unless they materially describe the applied result.

## Example

See `contracts/examples/transform-record.json`.
