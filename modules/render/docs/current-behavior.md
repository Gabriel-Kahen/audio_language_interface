# Render Current Behavior

## Scope

This document records the current implemented behavior of `modules/render` so callers can rely on what exists today rather than planned future behavior.

## Preview vs final

Preview renders and final renders share the same execution model:

- resolve an input file path from `AudioVersion.audio.storage_ref`
- resolve a workspace-local output path
- build an explicit `ffmpeg` command
- execute it through an injected executor or the default `execa` executor
- assemble a `RenderArtifact`

The two public render entry points differ in format policy:

- `renderPreview()` always renders MP3 and currently uses `libmp3lame` for encoding
- `renderPreview()` defaults to bitrate `128k`
- `renderExport()` renders either WAV or FLAC
- `renderExport()` defaults to WAV and currently uses `pcm_s16le` audio

Both entry points let callers override sample rate and channel count.

## Comparison previews

`renderComparisonPreview()` is the engine-level A/B preview path for fair before/after listening.

It produces four preview `RenderArtifact`s:

- original preview
- edited preview
- loudness-matched original preview
- loudness-matched edited preview

The function measures integrated LUFS and true peak with FFmpeg `loudnorm` unless callers provide `originalLoudness` and `editedLoudness`. It then chooses a target integrated LUFS value. By default the target is the quieter source loudness so the comparison does not prefer the louder file. If a caller provides `targetIntegratedLufs`, the engine still lowers that target when required to preserve the configured true-peak ceiling.

Matched previews are rendered with an explicit `volume=<gain>dB` filter followed by `alimiter=limit=<linear true peak cap>`. After rendering, the module measures both matched previews and records:

- match method
- target integrated LUFS
- max true peak dBTP
- tolerance LUFS
- applied gain per side
- estimated true peak per side
- measured matched loudness per side
- warnings for target capping, tolerance misses, or post-render true-peak guard violations

Comparison preview matching is preview-only. It does not create new `AudioVersion`s, rewrite source audio, or replace final export rendering.

## FFmpeg execution assumptions

- The module assumes `ffmpeg` is installed on the host system.
- The module assumes `ffprobe` is installed on the host system.
- The default executable name is `ffmpeg`.
- Callers can provide `ffmpegPath` to use another executable location.
- Callers can provide `ffprobePath` to use another executable location.
- The module creates the output directory before invoking `ffmpeg`.
- Non-zero `ffmpeg` exit codes raise `RenderExecutionError` with the command and captured process output attached.
- Successful renders are followed by an `ffprobe` metadata probe.

## Path policy

Render outputs:

- default to `renders/<render_id>.<ext>`
- may use a caller-supplied `outputDir`
- may use a caller-supplied `outputFileName`
- append the selected extension when `outputFileName` has no extension
- reject `outputFileName` when its extension does not match the selected render format
- are resolved against `workspaceRoot`
- must remain inside `workspaceRoot`
- are emitted into artifacts as workspace-relative POSIX paths

Input source paths:

- must satisfy the `AudioVersion.audio.storage_ref` workspace-relative POSIX path contract before resolution
- are resolved with `path.resolve(workspaceRoot, version.audio.storage_ref)`
- must exist before rendering starts
- must remain inside `workspaceRoot`

## Metadata behavior

The module assembles `RenderArtifact.output` from the produced file after a successful render:

- `format`, `codec`, `sample_rate_hz`, `channels`, and `duration_seconds` come from `ffprobe`
- `codec` is the probed stream codec name, not the `ffmpeg` encoder library label
- `file_size_bytes` is read from the output file after rendering
- renders fail if the output file is missing, empty, or probed as a different format than requested

## Warnings and stderr

- Successful renders ignore routine `ffmpeg` stderr logging.
- Stderr lines containing `warning` are preserved in `warnings`.
- Additional validation warnings are emitted when the materialized file differs from the requested sample rate, channel count, or expected duration.
- If neither stderr warnings nor validation warnings are present, the `warnings` field is omitted.

## Loudness summary behavior

- `loudness_summary` is optional passthrough data.
- Regular `renderPreview()` and `renderExport()` calls do not compute loudness values.
- `renderComparisonPreview()` computes preview loudness values and attaches them to all four returned `RenderArtifact`s.
- If a caller does not provide loudness data to regular preview/export calls, the field is omitted from the artifact.

## Known limitations

- No preview formats other than MP3 are supported.
- No final formats other than WAV and FLAC are supported.
- The module does not expose container-specific encoding options beyond the current small config surface.
- Comparison previews are limited to full-file matching. Region-specific A/B loudness matching is not implemented.
