# Transforms API

## `applyOperation(options)`

Applies one explicit operation to an input `AudioVersion` and renders a new WAV file.

Required inputs:

- `workspaceRoot`: absolute workspace root used to resolve input and output paths
- `version`: input `AudioVersion`
- `operation`: one of the supported operation names
- `parameters`: operation-specific parameter object

Optional inputs:

- `target`: defaults to `{ scope: "full_file" }`
- `outputDir`: workspace-relative output directory, default `storage/audio`
- `outputVersionId`: explicit output version id
- `recordId`: explicit transform record id
- `createdAt`: clock override for deterministic tests or callers that need a fixed timestamp
- `ffmpegPath`: explicit FFmpeg binary path
- `executor`: injected command runner for tests or alternate execution environments

Returns `ApplyTransformsResult`:

- `outputVersion`
- `transformRecord`
- `commands`: one FFmpeg command
- `warnings`

## `applyEditPlan(options)`

Executes `plan.steps` in order. Each step is materialized to disk before the next step runs.

Additional behavior:

- rejects plans whose `asset_id` does not match `version.asset_id`
- rejects plans whose `version_id` does not match `version.version_id`
- emits one `TransformRecord.operations[]` item per applied step
- returns every FFmpeg command used, including intermediate step renders

## `extractSlice(options)`

Extracts one explicit slice from an `AudioVersion`.

Required inputs:

- `workspaceRoot`
- `version`
- `slice`: an object with `slice_id`, `start_seconds`, and `end_seconds`

Optional inputs:

- `outputDir`
- `outputVersionId`
- `recordId`
- `createdAt`
- `ffmpegPath`
- `executor`

Returns one derived output item with:

- `outputVersion`
- `transformRecord`
- `commands`
- `warnings`
- `source_range`

## `extractSlices(options)`

Extracts one or many slices from an `AudioVersion`.

Required inputs:

- `workspaceRoot`
- `version`

Provide exactly one of:

- `slices`: an ordered array of explicit slice definitions
- `sliceMap`: a contract-aligned slice map with ordered `slices[]`

Optional inputs:

- `outputDir`
- `outputVersionIds`
- `recordIds`
- `createdAt`
- `ffmpegPath`
- `executor`

Behavior:

- slice-map asset and version IDs must match the input `AudioVersion`
- each slice is validated before execution starts
- slice boundaries must be non-negative, ascending, meaningfully positive in duration, and inside the source duration
- each derived output gets a separate FFmpeg render, output version, and local transform record
- the emitted local record operation name is `slice_extract`

## `deriveSliceMapFromTransients(options)`

Derives a contract-aligned `SliceMap` from an analysis `TransientMap`.

Required inputs:

- `version`
- `transientMap`

Optional inputs:

- `generatedAt`
- `preRollSeconds`
- `postRollSeconds`
- `minimumSliceDurationSeconds`

Behavior:

- the transient map must reference the same asset and version as the input audio version
- transient anchors are sorted by `time_seconds`
- each slice starts at the transient anchor minus optional preroll and ends at the next transient or file end
- the result records `source_transient_map_id` and a deterministic `slice_map_id`

## `buildOperation(audio, operation, parameters, target)`

Validates one operation and converts it into an inspectable intermediate form:

- `filterChain`: FFmpeg `-af` value
- `effectiveParameters`: normalized parameters recorded in the `TransformRecord`
- `nextAudio`: output audio metadata after the operation

This function does not touch the filesystem and does not run FFmpeg.

For the Layer 1 effect family (`reverb`, `delay`, `echo`, `bitcrush`, `distortion`, `saturation`, `flanger`, and `phaser`) and the transient/control family (`transient_shaper`, `clipper`, and `gate`), the published contract surface is the caller-facing parameter object plus the recorded `TransformRecord` parameters. Some operations also record derived values such as generated reverb tap timings or normalized defaults when those values describe the exact applied result.

## Operation reference

### `gain`

Parameters:

- `gain_db: number`

Target support:

- `full_file` only

FFmpeg filter:

```text
volume=<gain_db>dB
```

### `normalize`

Parameters:

- `mode: "peak"` only
- `target_peak_dbfs: number`
- `measured_peak_dbfs: number`

Rules:

- both peak values must be `<= 0`
- applied gain is computed as `target_peak_dbfs - measured_peak_dbfs`
- the module does not measure peaks itself

Target support:

- `full_file` only

### `trim`

Parameters:

- optional `start_seconds`
- optional `end_seconds`

Alternate targeting:

- `target.scope: "time_range"`
- `target.start_seconds`
- `target.end_seconds`

Rules:

- `end_seconds` must be greater than `start_seconds`
- `end_seconds` must not exceed the current audio duration
- output `duration_seconds` and `frame_count` are updated

FFmpeg filter:

```text
atrim=start=<start>:end=<end>,asetpts=N/SR/TB
```

### `trim_silence`

Parameters:

- `threshold_dbfs: number`
- `trim_leading: boolean`
- `trim_trailing: boolean`
- optional `window_seconds: number`, default `0.02`

Rules:

- target support is `full_file` only
- at least one of `trim_leading` or `trim_trailing` must be `true`
- `threshold_dbfs` must be between `-80` and `0`
- `window_seconds` must be between `0.001` and `10` when provided
- the emitted `TransformRecord` adds `result_duration_seconds` and `trimmed_duration_seconds`, and `result_duration_seconds` may be `0` when the crop removes the full file

Fixed execution behavior:

- silence detection uses FFmpeg `silenceremove`
- detector mode is fixed to `rms`
- channel trigger mode is fixed to `all`
- trailing silence removal is implemented by reversing the file, applying the same start-trim logic, then reversing back
- the module probes the rendered output with `ffprobe` before finalizing `AudioVersion.audio`

### `fade`

Parameters:

- optional `fade_in_seconds`
- optional `fade_out_seconds`

Rules:

- at least one fade value is required
- `fade_out_seconds` must not exceed the current audio duration
- when a fade-out is present, the module records `fade_out_start_seconds`

Target support:

- `full_file` only

### `pitch_shift`

Parameters:

- `semitones: number`

Rules:

- supports values from `-24` to `24`
- uses FFmpeg `asetrate`, `aresample`, and one or more `atempo` stages to keep duration close to the original
- records derived backend values in the emitted `TransformRecord`: `pitch_ratio`, `asetrate_hz`, `tempo_ratio`, and `atempo_factors`

Target support:

- `full_file` only

FFmpeg filter shape:

```text
asetrate=<derived_rate_hz>,aresample=<input_rate_hz>,atempo=<factor>[,atempo=<factor>...]
```

### `parametric_eq`

Parameters:

- `bands`: non-empty array of bell bands

Supported band shape:

```json
{
  "type": "bell",
  "frequency_hz": 3800,
  "gain_db": -2,
  "q": 1.2
}
```

Rules:

- only `type: "bell"` is supported
- `frequency_hz` must be between `0` and Nyquist
- `q` must be greater than `0`

Target support:

- `full_file` only

### `high_pass_filter`

Parameters:

- `frequency_hz` or `cutoff_hz`

Rules:

- effective recorded parameter is normalized to `frequency_hz`
- cutoff must be between `0` and Nyquist

Target support:

- `full_file` only

### `low_pass_filter`

Parameters:

- `frequency_hz` or `cutoff_hz`

Rules:

- effective recorded parameter is normalized to `frequency_hz`
- cutoff must be between `0` and Nyquist

Target support:

- `full_file` only

### `compressor`

Parameters:

- `threshold_db: number`
- `ratio: number`
- `attack_ms: number`
- `release_ms: number`
- optional `knee_db: number`, default `3`
- optional `makeup_gain_db: number`, default `0`

Rules:

- `threshold_db` must be between `-60` and `0`
- `ratio` must be between `1` and `20`
- `attack_ms` must be between `0.01` and `2000`
- `release_ms` must be between `0.01` and `9000`
- `knee_db` must be between `0` and `24`
- `makeup_gain_db` must be between `0` and `20`
- the module records the normalized caller-facing parameter surface only

Target support:

- `full_file` only

Fixed execution behavior:

- FFmpeg filter: `acompressor`
- `mode=downward`
- `link=maximum`
- `detection=rms`
- `mix=1`
- `level_in=1`
- `knee` defaults to `3 dB` when omitted

### `limiter`

Parameters:

- `ceiling_dbtp: number`
- optional `lookahead_ms: number`, default `5`
- optional `release_ms: number`, default `80`
- optional `input_gain_db: number`, default `0`

Rules:

- `ceiling_dbtp` must be between `-24` and `0`
- `lookahead_ms` must be between `0.1` and `80`
- `release_ms` must be between `1` and `8000`
- `input_gain_db` must be between `-24` and `24`
- the module records the normalized caller-facing parameter surface only

Target support:

- `full_file` only

Fixed execution behavior:

- FFmpeg filter: `alimiter`
- `level_in=1`
- `level_out=1`
- `asc=false`
- `asc_level=0.5`
- `level=false`
- `latency=true`

### `time_stretch`

Parameters:

- either `stretch_ratio: number`
- or `source_tempo_bpm: number` plus `target_tempo_bpm: number`

Rules:

- `stretch_ratio` uses the convention `output_duration / input_duration`
- `stretch_ratio` must be between `0.25` and `4`
- values greater than `1` lengthen the output
- values less than `1` shorten the output
- tempo-match mode derives `stretch_ratio = source_tempo_bpm / target_tempo_bpm`
- `source_tempo_bpm` and `target_tempo_bpm` must both be finite numbers greater than `0`
- callers must provide either the ratio or the tempo pair, not both
- the module records the derived `stretch_ratio` and `applied_tempo_ratio` in the `TransformRecord`

### `reverse`

Parameters:

- none

Rules:

- input and output metadata stay the same apart from file identity and lineage

Target support:

- `full_file` only

Fixed execution behavior:

- FFmpeg filter: `areverse`

### `mono_sum`

Parameters:

- none

Rules:

- output audio is always rendered as mono with `channels = 1` and `channel_layout = "mono"`
- all input channels are averaged equally into the mono output

Target support:

- `full_file` only

Fixed execution behavior:

- FFmpeg filter: `pan`
- each input channel gets an equal coefficient of `1 / input_channel_count`

### `channel_swap`

Parameters:

- none

Rules:

- input audio must be stereo with exactly `2` channels
- the output keeps stereo metadata and swaps left and right content explicitly

Target support:

- `full_file` only

Fixed execution behavior:

- FFmpeg filter: `pan=stereo|c0=c1|c1=c0`

### `stereo_balance_correction`

Parameters:

- `target_channel: "left" | "right"`
- `correction_db: number`

Rules:

- `correction_db` must be between `0.01` and `24`
- input audio must be stereo with exactly `2` channels
- the named `target_channel` is attenuated by the requested amount
- the quieter side is never auto-boosted

Target support:

- `full_file` only

Fixed execution behavior:

- FFmpeg filter: `pan`
- `target_channel: "left"` attenuates `c0`
- `target_channel: "right"` attenuates `c1`

### `stereo_width`

Parameters:

- `width_multiplier: number`

Rules:

- `width_multiplier` must be between `0` and `2`
- input audio must be stereo with exactly `2` channels
- the module records the exact executed `width_multiplier`

Target support:

- `full_file` only

Fixed execution behavior:

- FFmpeg filter: `extrastereo`
- clipping is disabled explicitly with `c=false`
- `width_multiplier = 1` preserves the current width
- `width_multiplier = 0` collapses the side signal fully to mono

### `denoise`

Parameters:

- `reduction_db: number`
- optional `noise_floor_dbfs: number`, default `-50`

Rules:

- `reduction_db` must be between `0.01` and `24`
- `noise_floor_dbfs` must be between `-80` and `-20`
- the module records the normalized caller-facing parameter surface only

Target support:

- `full_file` only

Fixed execution behavior:

- FFmpeg filter: `afftdn`
- adaptive tracking is disabled with `tn=0` and `tr=0`
- the implementation uses a fixed broadband denoise profile rather than learned noise capture
- this is intentionally conservative and best suited to steady broadband noise

### `reverb`

Parameters:

- `pre_delay_ms: number`
- `reflection_spacing_ms: number`
- `tail_taps: integer`
- `decay: number`
- optional `dry_mix: number`, default `0.82`
- optional `wet_mix: number`, default `0.35`

Rules:

- `pre_delay_ms` and `reflection_spacing_ms` must stay between `1` and `250`
- `tail_taps` must stay between `2` and `8`
- `decay` must stay between `0.01` and `0.95`
- `dry_mix` and `wet_mix` must stay between `0` and `1` when provided
- the emitted `TransformRecord` also records the derived `tap_delays_ms` and `tap_decays`

Target support:

- `full_file` only

### `delay`

Parameters:

- `delay_ms: number`
- optional `dry_mix: number`, default `0.85`
- optional `wet_mix: number`, default `0.35`

Rules:

- `delay_ms` must stay between `1` and `5000`
- `dry_mix` and `wet_mix` must stay between `0` and `1` when provided

Target support:

- `full_file` only

### `echo`

Parameters:

- `delay_ms: number`
- `decay: number`
- optional `dry_mix: number`, default `0.8`
- optional `wet_mix: number`, default `0.4`

Rules:

- `delay_ms` must stay between `1` and `5000`
- `decay` must stay between `0.01` and `0.95`
- `dry_mix` and `wet_mix` must stay between `0` and `1` when provided

Target support:

- `full_file` only

### `bitcrush`

Parameters:

- `bit_depth: integer`
- `sample_hold_samples: integer`
- optional `mix: number`, default `1`
- optional `mode: "lin" | "log"`, default `"lin"`

Rules:

- `bit_depth` must stay between `1` and `24`
- `sample_hold_samples` must stay between `1` and `250`
- `mix` must stay between `0` and `1` when provided

Target support:

- `full_file` only

### `distortion`

Parameters:

- `drive_db: number`
- `threshold: number`
- optional `output_gain_db: number`
- optional `oversample_factor: integer`, default `2`

Rules:

- `drive_db` must stay between `0` and `36`
- `threshold` must stay between `0.01` and `1`
- `output_gain_db` must stay between `-24` and `24` when provided
- `oversample_factor` must stay between `1` and `8` when provided
- the emitted `TransformRecord` also records `clip_mode: "hard"`

Target support:

- `full_file` only

### `saturation`

Parameters:

- `drive_db: number`
- optional `curve: "tanh" | "atan" | "cubic"`, default `"tanh"`
- optional `output_gain_db: number`
- optional `oversample_factor: integer`, default `2`

Rules:

- `drive_db` must stay between `0` and `24`
- `output_gain_db` must stay between `-24` and `24` when provided
- `oversample_factor` must stay between `1` and `8` when provided

Target support:

- `full_file` only

### `flanger`

Parameters:

- `delay_ms: number`
- `depth_ms: number`
- `rate_hz: number`
- `feedback_percent: number`
- `mix_percent: number`
- optional `waveform: "sinusoidal" | "triangular"`, default `"sinusoidal"`

Rules:

- `delay_ms` must stay between `0` and `30`
- `depth_ms` must stay between `0` and `10`
- `rate_hz` must stay between `0.1` and `10`
- `feedback_percent` must stay between `-95` and `95`
- `mix_percent` must stay between `0` and `100`

Target support:

- `full_file` only

### `phaser`

Parameters:

- `delay_ms: number`
- `decay: number`
- `rate_hz: number`
- optional `input_gain_db: number`, default `-8`
- optional `output_gain_db: number`, default `-2`
- optional `waveform: "sinusoidal" | "triangular"`, default `"sinusoidal"`

Rules:

- `delay_ms` must stay between `0` and `5`
- `decay` must stay between `0` and `0.99`
- `rate_hz` must stay between `0.1` and `2`
- `input_gain_db` must stay between `-60` and `0` when provided
- `output_gain_db` must stay between `-60` and `24` when provided

Target support:

- `full_file` only

### `transient_shaper`

Parameters:

- `attack_amount_db: number`
- `threshold_db: number`
- optional `attack_ms`, default `5`
- optional `release_ms`, default `80`

Rules:

- positive `attack_amount_db` emphasizes attack transients; negative values soften them
- `threshold_db` must stay between `-60` and `0`
- `attack_ms` and `release_ms` must stay inside the published runtime ranges when provided

Target support:

- `full_file` only

FFmpeg filter family:

```text
compand=...
```

### `clipper`

Parameters:

- `ceiling_dbfs: number`
- optional `input_gain_db`, default `0`
- optional `output_gain_db`, default `0`
- optional `oversample_factor`, default `2`

Rules:

- `ceiling_dbfs` must stay between `-24` and `0`
- optional gain controls must stay inside the published runtime range
- `oversample_factor` must be an integer between `1` and `8`

Target support:

- `full_file` only

FFmpeg filter family:

```text
volume=...,asoftclip=...
```

### `gate`

Parameters:

- `threshold_db: number`
- optional `range_db`, default `60`
- optional `ratio`, default `8`
- optional `attack_ms`, default `5`
- optional `release_ms`, default `80`

Rules:

- `threshold_db` must stay between `-80` and `0`
- `range_db` must stay between `0` and `96`
- `ratio` must be greater than `1`
- timing parameters must stay inside the published runtime ranges when provided

Target support:

- `full_file` only

FFmpeg filter family:

```text
agate=...
```

### `time_stretch`

Parameters:

- `stretch_ratio: number`

Rules:

- `stretch_ratio` must be between `0.25` and `4`
- values greater than `1` lengthen the output
- values less than `1` shorten the output
- the module records `applied_tempo_ratio` as the exact FFmpeg `atempo` factor

Target support:

- `full_file` only

Fixed execution behavior:

- FFmpeg `atempo` is used to preserve pitch while changing duration
- the reciprocal tempo factor is decomposed into a deterministic comma-separated filter chain when needed
- `outputVersion.audio.duration_seconds` and `frame_count` are updated from the requested ratio

## Path and file conventions

`resolveTransformOutputPath(...)` normalizes output paths to workspace-relative POSIX-style `storage_ref` values.

Important constraints:

- `outputDir` must not be empty
- outputs must remain inside `workspaceRoot`
- default filenames end in `.wav`

## FFmpeg adapter behavior

`buildFfmpegTransformCommand(...)` is a pure builder.

`executeFfmpegCommand(...)`:

- creates the parent output directory if needed
- uses the injected executor when provided
- otherwise runs `execa(command.executable, command.args, { reject: false })`
- throws `TransformExecutionError` when FFmpeg exits non-zero

## Example

```ts
import { applyOperation } from "modules/transforms/src/index.js";

const result = await applyOperation({
  workspaceRoot,
  version,
  operation: "gain",
  parameters: { gain_db: 3 },
});
```
