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
