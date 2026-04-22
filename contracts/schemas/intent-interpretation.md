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
| `interpretation_policy` | string | Ambiguity-handling policy used to produce the artifact: `conservative` or `best_effort`. |
| `asset_id` | string | Referenced asset identifier. |
| `version_id` | string | Referenced version identifier. |
| `analysis_report_id` | string | Source `AnalysisReport` identifier. |
| `semantic_profile_id` | string | Source `SemanticProfile` identifier. |
| `user_request` | string | Original natural-language request from the caller. |
| `normalized_request` | string | Canonicalized request phrasing suitable for deterministic planning. |
| `request_classification` | string | Supported, ambiguous, unsupported, or runtime-only interpretation class. |
| `next_action` | string | Planner-facing decision surface: `plan`, `clarify`, or `refuse`. |
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
| `descriptor_hypotheses` | array | Evidence-linked descriptor hypotheses with status such as `supported`, `weak`, `contradicted`, or `unresolved`. |
| `constraints` | array | Structured constraints extracted from the request, such as preservation, avoidance, safety, or intensity cues. |
| `region_intents` | array | Optional region-scoping proposals derived from user wording. Explicit `time_range` intents can now be grounded by deterministic planning for the current first-cohort region-safe operations, while free-form segment references remain advisory. |
| `candidate_interpretations` | array | Ranked alternate interpretations for ambiguity analysis. These are inspectable alternatives, not planner inputs. |
| `follow_up_intent` | object | Optional follow-up interpretation metadata such as `reduce_previous_intensity` or `try_another_version`. |
| `grounding_notes` | array | Compact notes explaining how session or evidence context influenced the interpretation. |

## Invariants

- `normalized_request` must remain a request-level interpretation, not a transform list.
- The artifact must not contain secrets such as provider API keys.
- The artifact must stay inspectable and safe to persist.
- Producers should default `interpretation_policy` to `conservative` when callers do not choose explicitly.
- Downstream planning may reject the artifact even when `request_classification` is `supported`.
- Under `conservative`, grounded ambiguity should usually preserve `next_action = "clarify"` instead of guessing.
- Under `best_effort`, ordinary ambiguity should usually still return `next_action = "plan"` with explicit `ambiguities`, optional `candidate_interpretations`, and `grounding_notes`. `refuse` should remain reserved for unsupported, unsafe, or planner-disabled requests.
- `next_action` makes clarification and refusal explicit, but it does not bypass deterministic planning.
- `candidate_interpretations` are advisory only. The selected top-level interpretation remains the only planner-facing candidate.
- `region_intents` remain proposals unless deterministic planning can map them to one explicit `time_range`.
- Free-form `segment_reference` region intents such as `intro` or `ending word` remain advisory and may still be refused until a deterministic segment resolver exists.
- Provider metadata may include cache or latency hints such as `cached` and `response_ms`, but never hidden provider state.

## Example

See `contracts/examples/intent-interpretation.json`.
