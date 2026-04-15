# EditPlan

## Purpose

Represents an explicit, ordered set of intended audio operations derived from user intent and current audio state.

## Producers

- `modules/planning`

## Consumers

- `modules/transforms`
- `modules/compare`
- `modules/history`
- `modules/tools`
- `modules/orchestration`

## Required fields

| Field | Type | Description |
| --- | --- | --- |
| `schema_version` | string | Contract version identifier. |
| `plan_id` | string | Stable edit plan identifier. |
| `asset_id` | string | Target asset identifier. |
| `version_id` | string | Input version identifier. |
| `user_request` | string | Natural-language request being addressed. |
| `goals` | array | Declared targets for the edit session. |
| `steps` | array | Ordered operations with explicit parameters or parameter targets. |
| `created_at` | string | ISO 8601 UTC timestamp. |

## Step fields

Each step should include:

- `step_id`
- `operation`
- `target`
- `parameters`
- `expected_effects`
- `safety_limits`

## Initial operation taxonomy

The initial implementation should use one of these operation names in `steps[].operation`:

- `gain`
- `normalize`
- `trim`
- `fade`
- `parametric_eq`
- `high_pass_filter`
- `low_pass_filter`
- `compressor`
- `limiter`
- `saturate`
- `denoise`
- `declick`
- `pitch_shift`
- `time_stretch`
- `stereo_width`

`steps[].target.scope` should initially be one of:

- `full_file`
- `time_range`
- `segment`
- `channel`
- `frequency_region`

## Optional fields

| Field | Type | Description |
| --- | --- | --- |
| `constraints` | array | User or system restrictions. |
| `verification_targets` | array | Checks for the compare module. |
| `rationale` | string | Human-readable reasoning summary. |

## Invariants

- Steps must be executable in listed order.
- No step may rely on hidden defaults that meaningfully change behavior.
- Safety bounds should be explicit when a transform can be destructive or aggressive.

## Example

See `contracts/examples/edit-plan.json`.
