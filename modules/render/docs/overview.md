# Render Overview

## Purpose

Render previews and final outputs from an `AudioVersion` into contract-aligned `RenderArtifact` records.

## Public API surface

- `renderPreview(options)`: render a lossy preview artifact
- `renderExport(options)`: render a final export artifact
- `buildFfmpegRenderCommand(options)`: build the explicit `ffmpeg` invocation used for a render
- `executeFfmpegCommand(command, executor?)`: execute a prepared render command
- `resolveRenderOutputPath(options)`: resolve and validate a workspace-local output path
- `assembleRenderArtifact(options)`: construct a contract-aligned `RenderArtifact`

## Suggested initial source files

- `src/render-preview.ts`: fast preview rendering
- `src/render-export.ts`: final-quality export rendering
- `src/output-metadata.ts`: rendered file metadata extraction
- `src/path-policy.ts`: output naming and storage policy
- `src/index.ts`: public exports only

## Dependencies

- `modules/core`
- `modules/io`
- `RenderArtifact` contract
- system-installed `ffmpeg` via `execa`

## Downstream consumers

- `compare`
- `history`
- `tools`
- `orchestration`

## Non-goals

- edit planning
- DSP transform logic
- semantic comparison

## Current behavior

- Preview renders are always `mp3` and currently encode via `libmp3lame`.
- Preview bitrate defaults to `128k` and can be overridden.
- Final renders currently support only `wav` and `flac`.
- Final renders default to `wav` and currently encode with `pcm_s16le` audio.
- Both render paths preserve the source `AudioVersion` duration in the emitted artifact.
- Both render paths can override sample rate and channel count at render time.
- The returned `RenderArtifact.output.path` is a workspace-relative POSIX-style path.

## FFmpeg assumptions

- The module calls a system-installed `ffmpeg` binary.
- `ffmpeg` is resolved from `PATH` by default.
- Callers may override the executable path with `ffmpegPath`.
- `ffprobe` is used after a successful render to describe the actual output file.
- The module builds direct argument arrays rather than using a wrapper library.

## Path policy

- Render outputs default to the `renders/` directory under the workspace root.
- Output paths are rejected if they escape the workspace root.
- Output paths are normalized to POSIX separators before being written into artifacts.
- Source audio is resolved from `AudioVersion.audio.storage_ref` relative to `workspaceRoot`.
- Source `audio.storage_ref` values must satisfy the workspace-relative POSIX path contract and are rejected if they escape the workspace root.
- User-supplied output filenames must either omit an extension or match the selected render format.

## Metadata behavior

- `output.format`, `output.codec`, `output.sample_rate_hz`, `output.channels`, and `output.duration_seconds` are probed from the rendered file via `ffprobe`.
- `output.codec` reflects the rendered stream codec name returned by `ffprobe`, not the encoder library configured for `ffmpeg`.
- `output.file_size_bytes` is populated from a filesystem stat after the render succeeds.
- `warnings` contains only stderr lines that appear to be real warnings.
- `loudness_summary` is passed through from caller-provided data; this module does not calculate loudness itself.

## Current limitations

- Preview format support is fixed to MP3 in the current implementation.
- Final export format support is limited to WAV and FLAC.

## Test expectations

- verify preview and final render metadata
- verify path and format handling
- verify rendered outputs match declared artifact metadata
- verify contract alignment for `RenderArtifact`

## Additional docs

- `docs/current-behavior.md`: implementation-level behavior, assumptions, and known limitations
