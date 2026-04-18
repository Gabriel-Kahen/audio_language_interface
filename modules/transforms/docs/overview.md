# Transforms Overview

## Purpose

`modules/transforms` executes deterministic audio edits against an input `AudioVersion` and emits:

- a new `AudioVersion`
- a contract-aligned `TransformRecord` for standard edit operations, or a local slice-extraction record for batch slicing
- the explicit FFmpeg command or command sequence used to materialize the output

This module is part of the audio runtime. It executes explicit edits deterministically and does not decide whether an edit is desirable, infer semantic intent, or inspect audio to derive transform parameters.
It should stay independent of planning or adapter policy.

## Current public API

Primary entry points:

- `applyOperation(options)`: apply one explicit transform to an input `AudioVersion`
- `applyEditPlan(options)`: execute ordered `EditPlan.steps` sequentially
- `extractSlice(options)`: extract one explicit slice from an input `AudioVersion`
- `extractSlices(options)`: extract one or many slices from an input `AudioVersion`
- `buildOperation(audio, operation, parameters, target)`: validate and normalize a single operation into an inspectable FFmpeg audio filter chain plus updated output metadata

Supporting exports:

- `buildFfmpegTransformCommand(...)`: construct the exact FFmpeg invocation payload
- `executeFfmpegCommand(...)`: run a command through the default or injected executor
- `resolveTransformOutputPath(...)`: enforce workspace-relative output placement
- `createOutputVersionId()` and `createTransformRecordId()`: generate contract-shaped identifiers
- `createAppliedOperation(...)` and `createTransformRecord(...)`: build `TransformRecord` payloads

See `docs/api.md` for parameter details and examples.

## Supported operation set

The implemented operation set is currently:

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
- `stereo_width`
- `denoise`
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

Anything else listed in the module agent guide is still a future capability and is not implemented in `src/` yet.

The published source of truth for runtime discovery is `modules/capabilities`, not this overview alone.

Slice extraction is implemented separately from the published edit-plan operation list. It reuses the deterministic `trim` filter path internally, emits a local `slice_extract` transform record operation, and exposes a helper to derive a contract-aligned `SliceMap` from a `TransientMap`.

## Operation and target support

Target support is intentionally conservative in the current implementation:

- `gain`, `normalize`, `fade`, `pitch_shift`, `parametric_eq`, `high_pass_filter`, `low_pass_filter`, `high_shelf`, `low_shelf`, `notch_filter`, and `tilt_eq` accept `full_file` and `time_range`
- `compressor`, `limiter`, `transient_shaper`, `clipper`, and `gate` accept `full_file` and `time_range`
- `time_stretch` only accepts `full_file`, using either `stretch_ratio` or `source_tempo_bpm` plus `target_tempo_bpm`
- `reverse` accepts `full_file` and `time_range`
- `mono_sum` only accepts `full_file`
- `pan` only accepts `full_file` and currently supports mono or stereo input only
- `channel_swap` accepts `full_file` and `time_range`, and requires stereo 2-channel input
- `channel_remap` only accepts `full_file`
- `stereo_balance_correction`, `mid_side_eq`, and `stereo_width` accept `full_file` and `time_range`, and require stereo 2-channel input
- `denoise`, `de_esser`, `declick`, and `dehum` accept `full_file` and `time_range`
- `bitcrush`, `distortion`, `saturation`, `flanger`, and `phaser` accept `full_file` and `time_range`
- `reverb`, `delay`, and `echo` only accept `full_file`
- `trim_silence` only accepts `full_file`
- `trim` supports `time_range` via `target.start_seconds` and `target.end_seconds`, or explicit `parameters.start_seconds` and `parameters.end_seconds`

For the current `time_range` cohort, region targeting is implemented by trimming the selected window, applying the existing deterministic full-file operation to that window, trimming the processed region back to the requested window duration, and concatenating it with the untouched prefix and suffix. That keeps the runtime contract explicit and deterministic, but it also means:

- operations that change duration are still `full_file` only
- operations that change channel topology are still `full_file` only
- tail-bearing ambience effects remain `full_file` only until the runtime grows a stronger spill/tail model
- region boundaries are hard cuts unless the caller adds separate fades explicitly

`trim_silence` removes only leading and/or trailing silence. It preserves interior gaps by composing `silenceremove` with `areverse` rather than using `silenceremove` stop-period modes directly.

Slice extraction support:

- `extractSlice` accepts one `slice` with `slice_id`, `start_seconds`, and `end_seconds`
- `deriveSliceMapFromTransients` converts a `TransientMap` into a contract-aligned `SliceMap`
- `extractSlices` accepts either `slices[]` or a contract-aligned `sliceMap`
- slice boundaries must be non-negative, ascending, meaningfully positive in duration, and inside the source duration
- each derived output gets its own output version, transform record, and lineage reason

The module validates parameters before building a filter chain and throws on unsupported target scopes or invalid numeric ranges.

## FFmpeg execution assumptions

The implementation assumes:

- `ffmpeg` is installed on `PATH` unless `ffmpegPath` is provided
- the module can write outputs inside the workspace root
- output audio is always rendered as PCM WAV using `pcm_s16le`
- video, subtitle, and data streams are ignored with `-vn`, `-sn`, and `-dn`
- input metadata is stripped with `-map_metadata -1`
- each transform is represented as an `-af` filter chain
- `trim_silence` additionally probes the rendered WAV with `ffprobe` so output duration metadata matches the actual cropped file

The default command shape is:

```bash
ffmpeg -y -i <input> -vn -sn -dn -map_metadata -1 -af <filters> -ar <sample_rate> -ac <channels> -c:a pcm_s16le <output.wav>
```

`applyEditPlan` executes one FFmpeg command per step in order. It materializes intermediate WAV files for non-final steps before producing the final output file.

`extractSlices` executes one FFmpeg command per slice and returns one derived output item for each slice.

## Output conventions

By default, rendered files are written under `storage/audio/` relative to the workspace root.

- single operations default to `storage/audio/<outputVersionId>.wav`
- plan steps use `storage/audio/<outputVersionId>.step-<n>.wav` for intermediates
- final plan output uses `storage/audio/<outputVersionId>.wav`

The module rejects output paths that resolve outside the workspace root.

The returned `AudioVersion`:

- uses `schema_version: "1.0.0"`
- sets `parent_version_id` to the input version
- sets `lineage.created_by` to `modules/transforms`
- preserves `state.is_preview` from the input version
- sets `state.is_original` to `false`

The returned `TransformRecord`:

- stores one operation entry per applied step
- records the executed `target` for each applied step
- records `runtime_ms`
- includes normalized, non-routine FFmpeg stderr lines in `warnings` when execution emits actionable diagnostics
- omits `warnings` entirely when FFmpeg emits only routine logging

## Contract alignment

This module consumes and emits repository contracts directly:

- input `AudioVersion` must match `contracts/schemas/json/audio-version.schema.json`
- `applyEditPlan` consumes an `EditPlan` aligned with `contracts/schemas/json/edit-plan.schema.json`
- execution emits a `TransformRecord` aligned with `contracts/schemas/json/transform-record.schema.json`

`applyEditPlan` additionally checks that `plan.asset_id` and `plan.version_id` match the input `AudioVersion` before any step runs.

## Current limitations

- The new Layer 1 effects intentionally publish coarse, explicit caller-facing controls first. They do not yet expose tempo sync, automation lanes, or multi-tap graph construction through the contract surface.
- `compressor` exposes only downward RMS compression with explicit threshold, ratio, attack, release, and optional makeup gain. It does not expose upward compression, dry/wet mixing, sidechain input, or alternate detection/link modes.
- `limiter` exposes only ceiling, attack, and release. Automatic gain staging is disabled deliberately so the emitted `TransformRecord` stays explicit and inspectable.
- `transient_shaper` exposes a single signed, compand-based transient-bias amount plus threshold and timing controls. It is best suited to transient-rich material, may still reshape sustained content above threshold, and does not yet expose separate sustain control, overshoot shaping, or multiband operation.
- `clipper` exposes deterministic hard clipping with explicit ceiling, optional input/output gain, and oversampling. It does not yet expose soft-curve families or multiband clipping.
- `gate` exposes downward RMS gating with explicit threshold, range, ratio, and timing. It does not yet expose hysteresis, hold time, key filters, or sidechain input.
- `time_stretch` uses FFmpeg `atempo` with explicit caller-supplied timing parameters. Tempo matching is supported only when the caller already knows `source_tempo_bpm` and `target_tempo_bpm`; this module does not estimate tempo itself.
- `reverse` uses FFmpeg `areverse` over the full rendered stream. It does not expose partial reverse regions or block-wise tape-style reversal.
- `mono_sum` renders a mono file by averaging all input channels equally. It does not preserve the original channel count or expose alternate downmix matrices.
- `pan` currently supports two modes only: mono-to-stereo placement and stereo balance adjustment. It does not expose automation, multichannel panning, or surround speaker positioning.
- `channel_swap` is locked to stereo 2-channel material and only swaps left and right. It does not expose arbitrary multichannel remapping.
- `channel_remap` exposes an explicit route matrix with optional per-route gain for up to 8 output channels. It does not yet expose named speaker-layout presets or implicit mix rules.
- `stereo_balance_correction` attenuates one named stereo channel by an explicit amount. It does not auto-measure the source imbalance or boost the quieter channel.
- `mid_side_eq` requires stereo input and currently supports only bell bands on the mid and/or side components. It does not yet expose shelves, filters, or dynamics in M/S space.
- `stereo_width` uses FFmpeg `extrastereo` with clipping disabled and only supports stereo 2-channel material. It is intended for subtle widening or narrowing, not aggressive spatial effects or multichannel imaging.
- `denoise` uses FFmpeg `afftdn` with a fixed broadband profile, explicit reduction, explicit or defaulted noise floor, and adaptive tracking disabled. It is intentionally conservative and is best suited to steady broadband noise rather than clicks, hum removal, or profile-learned restoration.
- `de_esser` is a thin FFmpeg `deesser` wrapper. It reduces sibilant energy deterministically, but it is not speech-aware, multiband, or source-selective.
- `declick` is a thin FFmpeg `adeclick` wrapper. It is aimed at short impulsive clicks and pops, not broadband denoise or full declipping.
- `dehum` is an explicit harmonic notch stack built from `bandreject`. It works best for steady mains hum and harmonics, not drifting buzz or complex electrical contamination.
- `trim_silence` uses a fixed RMS detector with `start_mode=all`; callers control only threshold, optional analysis window, and whether to crop the head, tail, or both.
- `pitch_shift` uses FFmpeg `asetrate`, `aresample`, and an explicit `atempo` compensation chain to keep duration close to the original. It is deterministic and inspectable, but it is not formant-preserving and is best suited to moderate shifts rather than transparent vocal correction.
- `normalize` now supports `mode: "peak"` and `mode: "integrated_lufs"`, and `applyOperation` / `applyEditPlan` can auto-measure missing peak or loudness inputs at execution time. Direct `buildOperation(...)` calls still require explicit measurement fields because they only build an inspectable filter chain and do not have file access.
- `parametric_eq` supports only bell bands.
- `high_shelf`, `low_shelf`, and `notch_filter` expose one band per operation and do not yet support band stacks.
- `tilt_eq` exposes one tilt pivot plus a single signed gain control. It does not yet expose alternate slope models or multi-band tilt shapes.
- `time_stretch` uses FFmpeg `atempo` with an explicit `stretch_ratio` surface and preserves pitch while changing duration deterministically.
- Filter output format is fixed to 16-bit PCM WAV; the module does not preserve original codec or container.
- The module validates that ffmpeg materially created a non-empty output file before returning success.
- `applyEditPlan` leaves intermediate step files on disk; it does not currently clean them up.
- `extractSlices` is intentionally local to `modules/transforms`; its `slice_extract` record operation is not yet part of the published `EditPlan` contract.
- The executor layer only wraps command execution. It does not retry, probe FFmpeg capabilities, or validate codec/filter availability.

## Tests

Module-local tests cover:

- FFmpeg command construction
- operation normalization and metadata updates
- single-operation application output shape
- ordered edit plan execution
- workspace-relative output path behavior
- real measurement-aware normalize, dynamics/control, stereo/routing, restoration, and selected effect output verification
- real time stretch, reverse, mono-sum, pitch-shift, and region-targeted output verification
- JSON Schema alignment for emitted `AudioVersion` and `TransformRecord`
