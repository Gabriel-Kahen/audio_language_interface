# Render API

## Scope

This document describes the implemented public API in `modules/render/src/index.ts`.

Use it when you need the current render entrypoints, metadata helpers, path rules, or FFmpeg execution behavior.

## Main entry points

### `renderPreview(options)`

Renders a preview artifact from one validated `AudioVersion`.

Current behavior:

- validates the input `AudioVersion`
- resolves `AudioVersion.audio.storage_ref` under `workspaceRoot`
- requires the source file to exist
- renders MP3 output through `libmp3lame`
- defaults preview bitrate to `128k`
- defaults output sample rate and channel count to the source version unless overridden
- probes the materialized output with `ffprobe`
- validates the output metadata and returns `{ command, artifact }`

### `renderExport(options)`

Renders a final export artifact from one validated `AudioVersion`.

Current behavior:

- validates the input `AudioVersion`
- resolves the source path under `workspaceRoot`
- supports final formats `wav` and `flac`
- defaults to `wav`
- defaults output sample rate and channel count to the source version unless overridden
- probes and validates the materialized output before returning `{ command, artifact }`

## FFmpeg helpers

### `buildFfmpegRenderCommand(options)`

Builds the explicit `ffmpeg` command for one render.

Current behavior:

- disables video streams with `-vn`
- sets channel count with `-ac`
- sets sample rate with `-ar`
- sets audio codec with `-c:a`
- adds bitrate only when the selected render format requires it

### `executeFfmpegCommand(command, executor?)`

Creates the output directory if needed, runs the prepared command, and throws `RenderExecutionError` when FFmpeg exits non-zero.

### `extractFfmpegWarnings(stderr)`

Returns only stderr lines that look like actual warnings.

## Output metadata helpers

### `probeOutputMetadata(options)`

Runs `ffprobe` and returns the actual rendered output metadata:

- `format`
- `codec`
- `sampleRateHz`
- `channels`
- `durationSeconds`

It throws `RenderMetadataProbeError` on probe failure.

### `readOutputFileSize(absolutePath)`

Returns the file size when the output exists, or `undefined` when it does not.

### `validateRenderedOutput(options)`

Checks the rendered file against the requested output shape.

Current behavior:

- throws when the extension does not match the expected format
- throws when the probed format does not match the expected format
- throws when the file is empty
- emits warnings rather than hard failures for sample-rate, channel-count, or duration drift

### `assembleRenderArtifact(options)`

Builds a contract-aligned `RenderArtifact` from one validated output metadata payload.

## Path helpers

### `resolveRenderOutputPath(options)`

Builds a workspace-contained output path and returns:

- `renderId`
- `absolutePath`
- `relativePath`
- `fileName`

Current behavior:

- defaults output directory to `renders`
- defaults filename to `<render_id>.<extension>`
- normalizes artifact paths to workspace-relative POSIX form
- rejects paths that escape the workspace root
- rejects explicit filenames whose extension conflicts with the selected format

### `resolveSourceAudioPath(workspaceRoot, storageRef)`

Validates that `storageRef` is a workspace-relative POSIX path and resolves it to an absolute source path under the workspace root.

## Errors

The module exports these current error classes:

- `RenderExecutionError`
- `RenderMetadataProbeError`
- `RenderOutputValidationError`

## Public types and constants

`src/index.ts` re-exports the current render option, command, executor, metadata, result, and artifact types, plus `CONTRACT_SCHEMA_VERSION`.

## Current limitations

- preview rendering is fixed to MP3
- final export rendering is limited to WAV and FLAC
- loudness data is caller-supplied metadata passthrough; this module does not calculate it
- the module relies on system-installed `ffmpeg` and `ffprobe`
