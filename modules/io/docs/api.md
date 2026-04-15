# IO API

## Scope

This document describes the implemented public behavior of `modules/io`.

It is intentionally more specific than the original module overview. When implementation and older design notes differ, this file reflects the current code.

## Entry points

### `inspectFileMetadata(filePath, dependencies?)`

Reads container-level metadata for a supported audio file and returns `AudioFileMetadata`.

Behavior:

- normalizes container names into a small canonical set such as `wav`, `aiff`, `mp3`, and `m4a`
- rejects unsupported containers with `UnsupportedAudioFormatError`
- prefers `music-metadata` for general parsing
- uses WAV parsing for more accurate WAV codec, bit depth, and frame count values
- uses `ffprobe` when available to fill gaps like channel layout or bit depth

Returned fields:

- `sourcePath`
- `fileSizeBytes`
- `containerFormat`
- `codec`
- `sampleRateHz`
- `channels`
- `durationSeconds`
- `frameCount`
- optional `bitDepth`
- optional `channelLayout`

Supported container formats:

- `wav`
- `flac`
- `mp3`
- `aiff`
- `aif`
- `aifc`
- `ogg`
- `m4a`
- `mp4`

Failure modes:

- `UnsupportedAudioFormatError` when the normalized container is not supported or required fields cannot be determined
- `ExternalToolError` when `ffprobe` is present but execution fails for reasons other than the binary being missing
- filesystem or parser errors from the underlying runtime dependencies

### `importAudioFromFile(inputPath, options?)`

Imports a readable source file into workspace storage and returns:

- `asset`: source-oriented `AudioAsset`
- `version`: materialized `AudioVersion`
- `sourceMetadata`: metadata from the original file
- `materializedMetadata`: metadata for the copied or transcoded output
- `outputPath`: absolute path to the stored audio artifact
- `normalized`: whether transcoding was required

Options:

- `workspaceRoot?`: base directory used for relative source and storage references. Defaults to `process.cwd()`.
- `outputDirectory?`: destination directory inside the workspace. Defaults to `storage/audio`.
- `importedAt?`: `Date` or timestamp string. Defaults to the current time.
- `normalizationTarget?`: target format for optional normalization.
- `tags?`: optional `AudioAsset.tags`.
- `notes?`: optional `AudioAsset.notes`.

Artifact behavior:

- generates opaque IDs with prefixes `asset_` and `ver_`
- computes `AudioAsset.source.checksum_sha256` from the source file bytes
- stores source metadata on `AudioAsset.media`
- stores output-file metadata on `AudioVersion.audio`
- validates both artifacts through the canonical `modules/core` runtime contracts before returning

Path behavior:

- source URIs are workspace-relative POSIX paths when the source file is inside `workspaceRoot`
- source URIs fall back to `file://` URLs when the source file is outside `workspaceRoot`
- `outputDirectory` must resolve inside `workspaceRoot`; otherwise import fails before any output is materialized
- output storage references are workspace-relative POSIX paths

Normalization behavior:

- if no `normalizationTarget` is provided, the source file is copied as-is
- if a target is provided but the source already matches it, the source file is copied as-is and `normalized` is `false`
- if the target differs, `ffmpeg` produces a new file and `normalized` is `true`

Important distinction:

- `asset.media` describes the source file
- `version.audio` describes the stored output artifact

### `createNormalizationPlan(metadata, target)`

Compares source metadata to a normalization target and reports whether transcoding is required.

The comparison currently checks:

- container format
- codec
- sample rate
- channel count

The returned `reasons` array explains each mismatch in human-readable strings such as `sample_rate 44100 -> 48000`.

### `normalizeAudioFile(inputPath, outputPath, target)`

Runs `ffmpeg` with explicit audio-only arguments to materialize a normalized file.

Current command behavior:

- drops video, subtitle, and data streams with `-vn -sn -dn`
- drops container metadata with `-map_metadata -1`
- sets sample rate with `-ar`
- sets channel count with `-ac`
- sets audio codec with `-c:a`
- overwrites the destination with `-y`

Current target support is limited to WAV outputs:

- `containerFormat: "wav"`
- `codec: "pcm_s16le" | "pcm_s24le" | "pcm_f32le"`

### `createFileSourceRef(inputPath, workspaceRoot?)`

Validates that `inputPath` points to a readable file and returns:

- absolute path
- display name
- source URI

It throws `InvalidSourceReferenceError` when the file is unreadable or not a regular file.

### `assertValidAudioAsset(value)` and `assertValidAudioVersion(value)`

Validate values against the canonical `modules/core` runtime contracts.

They throw `ContractValidationError` with flattened invariant issues when validation fails.

## Errors

The module exports these error classes:

- `IoModuleError`: base error class
- `InvalidSourceReferenceError`: invalid or unreadable source path
- `UnsupportedAudioFormatError`: unsupported container or missing required metadata
- `ExternalToolError`: `ffmpeg` or `ffprobe` execution failure
- `ContractValidationError`: contract schema validation failure

## Output guarantees

- contract validation happens before `importAudioFromFile` returns
- all workspace-relative paths are POSIX-style, even on non-POSIX hosts
- channel layout is inferred as `mono` for 1 channel and `stereo` for 2 channels when a more explicit layout is unavailable
- WAV frame counts come from WAV structure parsing instead of duration-derived estimation

## Known limitations

- bytes, streams, and asset-reference inputs are not implemented
- no dedicated export API exists yet
- only WAV normalization targets are implemented
- container support is broader than tested fixture coverage
- metadata extraction may still depend on installed system tooling for non-WAV edge cases
- timestamp normalization accepts strings and forwards them through `new Date(value).toISOString()`, so invalid date strings surface as runtime `RangeError`s rather than module-specific errors
