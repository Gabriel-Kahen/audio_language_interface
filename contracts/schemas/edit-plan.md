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

## Operation taxonomy

The current published contract allows these operation names in `steps[].operation`:

- `gain`
- `normalize`
- `trim`
- `fade`
- `pitch_shift`
- `parametric_eq`
- `high_pass_filter`
- `low_pass_filter`
- `compressor`
- `limiter`
- `time_stretch`
- `denoise`
- `stereo_width`

Deferred Phase 2 and future transforms are intentionally omitted from the published v1 taxonomy until they are locked and documented.

`steps[].target.scope` should initially be one of:

- `full_file`
- `time_range`
- `segment`
- `channel`
- `frequency_region`

For the locked Phase 2 batch, the intended initial target scope is `full_file` for:

- `compressor`
- `limiter`
- `stereo_width`
- `denoise`

## Parameter surfaces

`steps[].parameters` must match the named operation.

Locked Phase 2 parameter surfaces:

- `compressor`: `threshold_db`, `ratio`, `attack_ms`, `release_ms`, with optional `knee_db` and `makeup_gain_db`
- `limiter`: `ceiling_dbtp`, with optional `release_ms`, `lookahead_ms`, and `input_gain_db`
- `time_stretch`: either `stretch_ratio`, or `source_tempo_bpm` plus `target_tempo_bpm`
- `stereo_width`: `width_multiplier`
- `denoise`: `reduction_db`, with optional `noise_floor_dbfs`

The machine-readable schema also keeps the existing baseline operation shapes explicit for `gain`, `normalize`, `trim`, `fade`, `parametric_eq`, `high_pass_filter`, and `low_pass_filter`.

Published pitch-shift surface:

- `pitch_shift`: `semitones`

`pitch_shift` is currently documented as a whole-file transform that keeps duration close to the original. The runtime may record optional derived fields such as FFmpeg rate and tempo-compensation factors in the emitted `TransformRecord`.

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
