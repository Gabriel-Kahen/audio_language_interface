# IntentInterpretation

## Purpose

Captures an LLM-assisted normalization of a raw user request into a structured, inspectable interpretation artifact that downstream deterministic modules can validate.

This artifact is not an `EditPlan`. It is a bounded interpretation proposal that may still be rejected by deterministic planning.

## Producers

- `modules/interpretation`

## Consumers

- `modules/planning`
- `modules/tools`
- `modules/orchestration`

## Required fields

| Field | Type | Description |
| --- | --- | --- |
| `schema_version` | string | Contract version identifier. |
| `interpretation_id` | string | Stable interpretation identifier. |
| `asset_id` | string | Referenced asset identifier. |
| `version_id` | string | Referenced version identifier. |
| `analysis_report_id` | string | Source `AnalysisReport` identifier. |
| `semantic_profile_id` | string | Source `SemanticProfile` identifier. |
| `user_request` | string | Original natural-language request from the caller. |
| `normalized_request` | string | Canonicalized request phrasing suitable for deterministic planning. |
| `request_classification` | string | Supported, ambiguous, unsupported, or runtime-only interpretation class. |
| `normalized_objectives` | array | Canonical objective labels extracted from the request. |
| `candidate_descriptors` | array | Descriptor labels the interpretation believes are relevant to the request. |
| `confidence` | number | Confidence score in the interpretation, between `0` and `1`. |
| `provider` | object | Provider metadata describing which LLM generated the interpretation. |
| `generated_at` | string | ISO 8601 UTC timestamp. |
| `rationale` | string | Brief explanation of why the request was normalized this way. |

## Optional fields

| Field | Type | Description |
| --- | --- | --- |
| `ambiguities` | array | Ambiguities the model detected in the user wording. |
| `unsupported_phrases` | array | Phrases that could not be grounded safely. |
| `clarification_question` | string | Optional follow-up question when the request needs clarification. |

## Invariants

- `normalized_request` must remain a request-level interpretation, not a transform list.
- The artifact must not contain secrets such as provider API keys.
- The artifact must stay inspectable and safe to persist.
- Downstream planning may reject the artifact even when `request_classification` is `supported`.

## Example

See `contracts/examples/intent-interpretation.json`.
