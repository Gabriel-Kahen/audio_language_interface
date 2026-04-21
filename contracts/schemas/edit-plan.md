# EditPlan

## Purpose

Represents an explicit, ordered set of intended audio operations derived from user intent and current audio state.

Every published plan should also record which `RuntimeCapabilityManifest` it was grounded against.

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
| `capability_manifest_id` | string | Published runtime capability manifest used during planning. |
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
- `trim_silence`
- `fade`
- `pitch_shift`
- `parametric_eq`
- `high_pass_filter`
- `low_pass_filter`
- `high_shelf`
- `low_shelf`
- `notch_filter`
- `tilt_eq`
- `compressor`
- `limiter`
- `transient_shaper`
- `clipper`
- `gate`
- `time_stretch`
- `reverse`
- `mono_sum`
- `pan`
- `channel_swap`
- `channel_remap`
- `stereo_balance_correction`
- `mid_side_eq`
- `denoise`
- `stereo_width`
- `de_esser`
- `declick`
- `dehum`
- `reverb`
- `delay`
- `echo`
- `bitcrush`
- `distortion`
- `saturation`
- `flanger`
- `phaser`

`steps[].target.scope` should initially be one of:

- `full_file`
- `time_range`
- `segment`
- `channel`
- `frequency_region`

Current runtime support is intentionally narrower than the full target taxonomy.
The runtime capability manifest is the source of truth for which target scopes are valid for each operation.

In the current baseline, the capability manifest exposes `time_range` for a conservative first cohort of segment-safe operations, including:

- `gain`
- `normalize`
- `fade`
- `pitch_shift`
- the EQ family (`parametric_eq`, `high_pass_filter`, `low_pass_filter`, `high_shelf`, `low_shelf`, `notch_filter`, `tilt_eq`)
- the dynamics/control family (`compressor`, `limiter`, `transient_shaper`, `clipper`, `gate`)
- `reverse`
- selected stereo cleanup and restoration operations (`channel_swap`, `stereo_balance_correction`, `mid_side_eq`, `stereo_width`, `denoise`, `de_esser`, `declick`, `dehum`)
- selected drive/modulation operations (`bitcrush`, `distortion`, `saturation`, `flanger`, `phaser`)

The capability manifest still restricts these operations to `full_file`:

- `trim_silence`
- `time_stretch`
- `mono_sum`
- `pan`
- `channel_remap`
- `reverb`
- `delay`
- `echo`

## Parameter surfaces

`steps[].parameters` must match the named operation.

Current expanded parameter surfaces:

- `compressor`: `threshold_db`, `ratio`, `attack_ms`, `release_ms`, with optional `knee_db` and `makeup_gain_db`
- `limiter`: `ceiling_dbtp`, with optional `release_ms`, `lookahead_ms`, and `input_gain_db`
- `time_stretch`: either `stretch_ratio`, or `source_tempo_bpm` plus `target_tempo_bpm`
- `reverse`: no parameters
- `mono_sum`: no parameters
- `pan`: `position`, with runtime-recorded `resolved_mode`, `left_gain`, and `right_gain`
- `channel_swap`: no parameters
- `channel_remap`: `output_channels` and `routes`
- `stereo_balance_correction`: `target_channel` and `correction_db`
- `mid_side_eq`: at least one of `mid_bands` or `side_bands`
- `stereo_width`: `width_multiplier`
- `denoise`: `reduction_db`, with optional `noise_floor_dbfs`
- `de_esser`: `intensity`, with optional `max_reduction` and `frequency_hz`
- `declick`: `window_ms`, with optional `overlap_percent`, `ar_order`, `threshold`, `burst_fusion`, and `method`
- `dehum`: `fundamental_hz`, with optional `harmonics`, `q`, and `mix`
- `high_shelf`: `frequency_hz`, `gain_db`, and `q`
- `low_shelf`: `frequency_hz`, `gain_db`, and `q`
- `notch_filter`: `frequency_hz` and `q`
- `tilt_eq`: `pivot_frequency_hz`, `gain_db`, and `q`
- `reverb`: `pre_delay_ms`, `reflection_spacing_ms`, `tail_taps`, and `decay`, with optional `dry_mix` and `wet_mix`
- `delay`: `delay_ms`, with optional `dry_mix` and `wet_mix`
- `echo`: `delay_ms` and `decay`, with optional `dry_mix` and `wet_mix`
- `bitcrush`: `bit_depth` and `sample_hold_samples`, with optional `mix` and `mode`
- `distortion`: `drive_db` and `threshold`, with optional `output_gain_db` and `oversample_factor`
- `saturation`: `drive_db`, with optional `curve`, `output_gain_db`, and `oversample_factor`
- `flanger`: `delay_ms`, `depth_ms`, `feedback_percent`, `mix_percent`, and `rate_hz`, with optional `waveform`
- `phaser`: `delay_ms`, `decay`, and `rate_hz`, with optional `input_gain_db`, `output_gain_db`, and `waveform`

The machine-readable schema also keeps the existing baseline operation shapes explicit for `gain`, `normalize`, `trim`, `fade`, `parametric_eq`, `high_pass_filter`, and `low_pass_filter`. `normalize` now supports both peak and integrated-loudness modes, and execution-time payloads may add derived fields such as `applied_gain_db`, `estimated_integrated_lufs`, `estimated_true_peak_dbtp`, and `gain_limited_by_true_peak`.

`trim_silence` is a separate full-file operation for deterministic edge cropping. It keeps manual time-range trimming (`trim`) distinct from silence-detection-driven auto-cropping.

`trim_silence` parameters:

- `threshold_dbfs`
- `trim_leading`
- `trim_trailing`
- optional `window_seconds`

`window_seconds`, when provided, must stay within `0.001` to `10`.

Execution-time payloads may also add derived fields such as `result_duration_seconds` and `trimmed_duration_seconds`. `result_duration_seconds` may be `0` when silence trimming removes the entire file.

Published pitch-shift surface:

- `pitch_shift`: `semitones`

`pitch_shift` is currently documented as a whole-file transform that keeps duration close to the original. The runtime may record optional derived fields such as FFmpeg rate and tempo-compensation factors in the emitted `TransformRecord`.

The current baseline planner now includes a conservative timing-edit slice across `trim_silence`, `time_stretch`, and `pitch_shift` in addition to the surgical tone-shaping operations `high_shelf`, `low_shelf`, `notch_filter`, and `tilt_eq`, plus the restoration operations `de_esser`, `declick`, and `dehum`. Stereo-routing operations, transient/control operations, and most Layer 1 effect operations remain `runtime_only` and are still valid in the contract surface for explicit technical callers without being selected automatically by the baseline planner.

## Optional fields

| Field | Type | Description |
| --- | --- | --- |
| `constraints` | array | User or system restrictions. |
| `verification_targets` | array | Optional structured checks for the compare module. Legacy string items remain valid for older callers, but the baseline planner now emits typed verification targets. |
| `rationale` | string | Human-readable reasoning summary. |

## Invariants

- The plan must only use operations and target scopes allowed by `capability_manifest_id`.
- Steps must be executable in listed order.
- No step may rely on hidden defaults that meaningfully change behavior.
- Safety bounds should be explicit when a transform can be destructive or aggressive.

## Example

See `contracts/examples/edit-plan.json`.
