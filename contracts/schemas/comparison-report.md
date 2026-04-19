# ComparisonReport

## Purpose

Describes measurable and semantic deltas between two audio states.

## Producers

- `modules/compare`

## Consumers

- `modules/planning`
- `modules/history`
- `modules/tools`
- `modules/orchestration`
- `modules/benchmarks`

## Required fields

| Field | Type | Description |
| --- | --- | --- |
| `schema_version` | string | Contract version identifier. |
| `comparison_id` | string | Stable comparison identifier. |
| `baseline.ref_type` | string | One of `version` or `render`. |
| `baseline.ref_id` | string | Baseline artifact identifier. |
| `candidate.ref_type` | string | One of `version` or `render`. |
| `candidate.ref_id` | string | Candidate artifact identifier. |
| `generated_at` | string | ISO 8601 UTC timestamp. |
| `metric_deltas` | array | Measured deltas. |
| `summary.plain_text` | string | Human-readable summary. |

## Optional fields

| Field | Type | Description |
| --- | --- | --- |
| `semantic_deltas` | array | Qualitative delta statements grounded in metrics. |
| `regressions` | array | Undesirable changes or warnings. |
| `verification_results` | array | Optional structured verification results evaluated from `EditPlan.verification_targets`. |
| `goal_alignment` | array | Optional goal-level rollup derived from structured verification when available, or from legacy heuristic goal scoring otherwise. |

## Initial delta item fields

The initial machine-readable schema defines these baseline fields:

- `metric_deltas[]`: `metric`, `direction`, `delta`
- `semantic_deltas[]`: `label`, `confidence`, `evidence`
- `regressions[]`: `kind`, `severity`, `description`
- `verification_results[]`: `target_id`, `goal`, `label`, `kind`, `comparison`, `status`, plus observed evidence fields when available
- `goal_alignment[]`: `goal`, `status`

`goal_alignment[].status` should initially use one of:

- `met`
- `mostly_met`
- `not_met`
- `unknown`

## Invariants

- Baseline and candidate must not reference the same artifact.
- Metric deltas must specify what measurement changed and in which direction.
- Semantic deltas must be grounded in measured or referenced evidence.

## Example

See `contracts/examples/comparison-report.json`.
