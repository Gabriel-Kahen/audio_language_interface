# Transforms Overview

## Purpose

`modules/transforms` executes deterministic audio edits against an input `AudioVersion` and emits:

- a new `AudioVersion`
- a contract-aligned `TransformRecord`
- the explicit FFmpeg command or command sequence used to materialize the output

This module is the pipeline execution layer. It does not decide whether an edit is desirable, infer semantic intent, or inspect audio to derive transform parameters.

## Current public API

Primary entry points:

- `applyOperation(options)`: apply one explicit transform to an input `AudioVersion`
- `applyEditPlan(options)`: execute ordered `EditPlan.steps` sequentially
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
- `fade`
- `parametric_eq`
- `high_pass_filter`
- `low_pass_filter`
- `compressor`
- `limiter`
- `stereo_width`
- `denoise`

Anything else listed in the module agent guide is still a future capability and is not implemented in `src/` yet.

## Operation and target support

Target support is intentionally narrow in the initial implementation:

- `gain`, `normalize`, `parametric_eq`, `high_pass_filter`, and `low_pass_filter` only accept `full_file`
- `compressor` and `limiter` only accept `full_file`
- `stereo_width` only accepts `full_file` and requires stereo 2-channel input
- `denoise` only accepts `full_file`
- `fade` only accepts `full_file`
- `trim` supports `time_range` via `target.start_seconds` and `target.end_seconds`, or explicit `parameters.start_seconds` and `parameters.end_seconds`

The module validates parameters before building a filter chain and throws on unsupported target scopes or invalid numeric ranges.

## FFmpeg execution assumptions

The implementation assumes:

- `ffmpeg` is installed on `PATH` unless `ffmpegPath` is provided
- the module can write outputs inside the workspace root
- output audio is always rendered as PCM WAV using `pcm_s16le`
- video, subtitle, and data streams are ignored with `-vn`, `-sn`, and `-dn`
- input metadata is stripped with `-map_metadata -1`
- each transform is represented as an `-af` filter chain

The default command shape is:

```bash
ffmpeg -y -i <input> -vn -sn -dn -map_metadata -1 -af <filters> -ar <sample_rate> -ac <channels> -c:a pcm_s16le <output.wav>
```

`applyEditPlan` executes one FFmpeg command per step in order. It materializes intermediate WAV files for non-final steps before producing the final output file.

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

- Saturation, pitch, and time-stretch operations are still not implemented.
- `compressor` exposes only downward RMS compression with explicit threshold, ratio, attack, release, and optional makeup gain. It does not expose upward compression, dry/wet mixing, sidechain input, or alternate detection/link modes.
- `limiter` exposes only ceiling, attack, and release. Automatic gain staging is disabled deliberately so the emitted `TransformRecord` stays explicit and inspectable.
- `stereo_width` uses FFmpeg `extrastereo` with clipping disabled and only supports stereo 2-channel material. It is intended for subtle widening or narrowing, not aggressive spatial effects or multichannel imaging.
- `denoise` uses FFmpeg `afftdn` with a fixed broadband profile, explicit reduction, explicit or defaulted noise floor, and adaptive tracking disabled. It is intentionally conservative and is best suited to steady broadband noise rather than clicks, hum removal, or profile-learned restoration.
- No automatic loudness or peak measurement. `normalize` requires caller-supplied `measured_peak_dbfs`.
- `normalize` supports only `mode: "peak"`.
- `parametric_eq` supports only bell bands.
- Filter output format is fixed to 16-bit PCM WAV; the module does not preserve original codec or container.
- The module validates that ffmpeg materially created a non-empty output file before returning success.
- `applyEditPlan` leaves intermediate step files on disk; it does not currently clean them up.
- The executor layer only wraps command execution. It does not retry, probe FFmpeg capabilities, or validate codec/filter availability.

## Tests

Module-local tests cover:

- FFmpeg command construction
- operation normalization and metadata updates
- single-operation application output shape
- ordered edit plan execution
- workspace-relative output path behavior
- real compressor, limiter, stereo width, and denoise output verification
- JSON Schema alignment for emitted `AudioVersion` and `TransformRecord`
