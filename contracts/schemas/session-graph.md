# SessionGraph

## Purpose

Represents session-level provenance across assets, versions, plans, transforms, renders, and comparisons.

## Producers

- `modules/history`

## Consumers

- `modules/tools`
- `modules/orchestration`
- `modules/benchmarks`

## Required fields

| Field | Type | Description |
| --- | --- | --- |
| `schema_version` | string | Contract version identifier. |
| `session_id` | string | Stable session identifier. |
| `created_at` | string | ISO 8601 UTC timestamp. |
| `updated_at` | string | ISO 8601 UTC timestamp. |
| `nodes` | array | Graph nodes for session artifacts. |
| `edges` | array | Directed relationships between nodes. |
| `active_refs` | object | Currently selected asset and version references. |

## Node fields

Each node should include:

- `node_id`
- `node_type`
- `ref_id`
- `created_at`

## Edge fields

Each edge should include:

- `from_node_id`
- `to_node_id`
- `relation`

## Initial enum vocabulary

`nodes[].node_type` should initially use one of:

- `audio_asset`
- `audio_version`
- `analysis_report`
- `semantic_profile`
- `edit_plan`
- `transform_record`
- `render_artifact`
- `comparison_report`

`edges[].relation` should initially use one of:

- `has_version`
- `analyzed_as`
- `described_as`
- `planned_from`
- `executed_as`
- `produced`
- `rendered_as`
- `compared_to`
- `belongs_to`

`active_refs` should initially support:

- `asset_id`
- `version_id`
- optional `branch_id`

## Optional fields

| Field | Type | Description |
| --- | --- | --- |
| `metadata` | object | Session-level annotations plus structured history state. |

## Metadata fields

`metadata` remains open to caller-owned keys, but the following history-owned fields are now part of the published contract:

- `branches[]`: branch records with `branch_id`, `head_version_id`, `source_version_id`, `created_at`, and optional `label`
- `snapshots[]`: snapshot records with `snapshot_id`, `version_id`, `created_at`, and optional `branch_id` and `label`
- `active_ref_history[]`: ordered active selection history entries with `asset_id`, `version_id`, `changed_at`, and optional `branch_id` and `reason`
- `active_ref_history_index`: zero-based pointer into `active_ref_history`
- `plan_requests`: map keyed by `plan_id` storing the original user request text needed for safe `more`-style follow-up resolution
- `provenance`: map keyed by artifact `ref_id` with structured lineage links used by branch and revert helpers

Important provenance fields:

- version entries may include `asset_id`, `version_id`, optional `parent_version_id`, optional `plan_id`, and optional `transform_record_id`
- transform entries may include `asset_id`, `input_version_id`, `output_version_id`, and optional `plan_id`
- comparison entries may include `baseline_ref_id`, `baseline_ref_type`, `candidate_ref_id`, and `candidate_ref_type`

## Invariants

- `node_id` values must be unique within a session.
- Every edge must reference existing nodes.
- `active_refs.version_id` should refer to a known version node when present.
- `metadata.active_ref_history_index` should point at an existing history entry when present.
- `metadata.provenance` entries should be keyed by known artifact refs.
- Version provenance should preserve direct transform linkage when a version was produced by a transform.

## Example

See `contracts/examples/session-graph.json`.
