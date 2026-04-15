# SemanticProfile

## Purpose

Maps measurable analysis evidence into interpretable descriptors with confidence and rationale.

## Producers

- `modules/semantics`

## Consumers

- `modules/planning`
- `modules/compare`
- `modules/tools`
- `modules/orchestration`

## Required fields

| Field | Type | Description |
| --- | --- | --- |
| `schema_version` | string | Contract version identifier. |
| `profile_id` | string | Stable semantic profile identifier. |
| `analysis_report_id` | string | Source `AnalysisReport` identifier. |
| `asset_id` | string | Referenced asset identifier. |
| `version_id` | string | Referenced version identifier. |
| `generated_at` | string | ISO 8601 UTC timestamp for when the semantic profile artifact was created, not when the source analysis report was generated. |
| `descriptors` | array | Semantic labels with confidence and evidence references. |
| `summary.plain_text` | string | Human-readable semantic summary. |

## Descriptor fields

Each descriptor should include:

- `label`
- `confidence`
- `evidence_refs`
- `rationale`

## Optional fields

| Field | Type | Description |
| --- | --- | --- |
| `summary.caveats` | array of string | Known ambiguities or limitations. |
| `unresolved_terms` | array of string | Terms the module could not confidently assign. |

## Invariants

- Every descriptor must trace back to measurable evidence.
- Confidence must be between `0` and `1`.
- The profile must not contain unsupported subjective claims with no evidence.

## Example

See `contracts/examples/semantic-profile.json`.
