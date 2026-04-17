# IO Overview

## Purpose

`modules/io` is the file-ingestion boundary for the platform.

It is part of the audio runtime layer.

The current implementation takes a readable audio file path, inspects container-level metadata, optionally materializes a normalized copy, and emits contract-validated `AudioAsset` and `AudioVersion` artifacts.

## Current public API

- `inspectFileMetadata(filePath)`: read file/container metadata for a supported audio file.
- `importAudioFromFile(inputPath, options)`: import a source file into workspace storage and create initial `AudioAsset` and `AudioVersion` records.
- `createNormalizationPlan(metadata, target)`: report whether a file would need transcoding to match a normalization target.
- `normalizeAudioFile(inputPath, outputPath, target)`: run `ffmpeg` to materialize a normalized output file.
- `createFileSourceRef(inputPath, workspaceRoot)`: validate a readable file path and generate a source reference.
- `assertValidAudioAsset(value)` and `assertValidAudioVersion(value)`: validate artifacts against the published JSON schemas.

See `docs/api.md` for detailed behavior, supported formats, guarantees, and limitations.

## Implemented source layout

- `src/contracts.ts`: `modules/core` type re-exports plus IO-specific validation wrappers.
- `src/errors.ts`: module-specific error types.
- `src/import-audio.ts`: file import entrypoint and artifact creation.
- `src/normalize-audio.ts`: normalization planning and `ffmpeg` command execution.
- `src/read-metadata.ts`: metadata inspection via `music-metadata`, WAV parsing, and optional `ffprobe` enrichment.
- `src/source-ref.ts`: readable-file validation and workspace-relative path handling.
- `src/index.ts`: public exports.

## Supported inputs

Current implementation support is intentionally narrow:

- readable local file paths
- supported audio containers: `wav`, `flac`, `mp3`, `aiff`, `aif`, `aifc`, `ogg`, `m4a`, `mp4`

The module guidance mentions bytes, streams, and asset references, but those inputs are not implemented yet.

## Output guarantees

- metadata inspection returns normalized container names such as `wav`, `aiff`, `mp3`, and `m4a`
- imported artifacts are validated against `contracts/schemas/json/audio-asset.schema.json` and `contracts/schemas/json/audio-version.schema.json`
- imported `AudioVersion.audio.storage_ref` is a workspace-relative POSIX path
- `importAudioFromFile` rejects `outputDirectory` values that resolve outside `workspaceRoot` before creating directories or files
- initial versions created by `importAudioFromFile` always set:
  - `lineage.created_by` to `modules/io`
  - `lineage.reason` to `initial import`
  - `state.is_original` to `true`
  - `state.is_preview` to `false`
- source-file checksums are SHA-256 hashes of the original input bytes

## Dependency assumptions

- Node.js file system access is available for the source file and destination directory.
- `music-metadata` is available for baseline container parsing.
- `wavefile` is used for WAV-specific codec, bit-depth, and frame-count extraction.
- `ffprobe` is optional during metadata inspection. If it is missing from `PATH`, inspection still proceeds when `music-metadata` and WAV parsing provide enough required fields.
- `ffmpeg` is required for actual transcoding in `normalizeAudioFile` and for imports that request normalization and need a transcode.
- `modules/core` provides the canonical `AudioAsset` and `AudioVersion` models and runtime validators consumed here.

## Current limitations

- only file-path imports are implemented
- normalization targets are limited to WAV output with codecs `pcm_s16le`, `pcm_s24le`, or `pcm_f32le`
- metadata inspection validates the source container but does not guarantee every codec inside that container is accepted by downstream tools
- imported `AudioAsset.media` describes the source file metadata, while `AudioVersion.audio` describes the materialized output metadata when normalization occurs
- `importAudioFromFile` copies source files byte-for-byte when no transcode is required; it does not rewrite metadata or container structure in that case
- no streaming import path, byte-buffer import path, or explicit export API exists yet

## Downstream consumers

- `analysis`
- `render`
- `history`
- `tools`
- `orchestration`

## Non-goals

- deep signal analysis
- semantic interpretation
- edit planning
- transform decision-making
- workflow orchestration

## Tests

`modules/io/tests/io.test.ts` currently covers:

- WAV metadata inspection without `ffprobe`
- explicit `ffprobe` and `ffmpeg` command construction
- normalization planning decisions
- file import behavior and emitted contract-aligned artifacts
