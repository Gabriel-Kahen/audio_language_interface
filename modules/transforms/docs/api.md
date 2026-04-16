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

Target support:

- `full_file` only

Fixed execution behavior:

- FFmpeg `atempo` is used to preserve pitch while changing duration
- the reciprocal tempo factor is decomposed into a deterministic comma-separated filter chain when needed
- the module does not estimate tempo; it only applies an explicit requested match
- `outputVersion.audio.duration_seconds` and `frame_count` are updated from the applied ratio

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
