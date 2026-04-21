# Analysis API

## Scope

This document describes the implemented public API in `modules/analysis/src/index.ts`.

Use it when you need the current callable behavior, validation helpers, and output constraints for the analysis layer.

## Entry points

### `analyzeAudioVersion(audioVersion, options?)`

Builds a contract-aligned `AnalysisReport` for one validated `AudioVersion`.

Current behavior:

- validates the input `AudioVersion` contract before reading the file
- resolves `audio.storage_ref` relative to `options.workspaceRoot` or `process.cwd()`
- rejects paths that escape the selected workspace root
- accepts only materialized `.wav` files in the current implementation
- decodes the full WAV into memory
- verifies decoded file metadata against `AudioVersion.audio`
- measures integrated loudness and true peak through FFmpeg `loudnorm`
- runs the current deterministic levels, dynamics, spectral, stereo, artifact, segment, and source-character analyzers
- builds and schema-validates the final `AnalysisReport`

Notable output behavior:

- `generated_at` defaults to `audioVersion.lineage.created_at` unless overridden
- `report_id` is deterministic for a given input version, storage ref, analyzer name, and analyzer version
- `measurements` always includes `levels`, `dynamics`, `spectral_balance`, `stereo`, and `artifacts`
- `annotations`, `segments`, `source_character`, `material_character`, and `summary.confidence` are included only when evidence exists or the caller requests them

### `detectTransients(audioVersion, options?)`

Builds a standalone `TransientMap` from the same validated WAV-loading path used by full analysis.

Current behavior:

- validates the input `AudioVersion`
- resolves the WAV path under the workspace root
- runs short-window onset scoring and peak picking
- returns a machine-readable transient list without embedding it into `AnalysisReport`

Use this when downstream code needs slice or onset anchors without paying for the full report surface.

### `estimateTempo(audioVersion, options?)`

Builds a standalone `TempoEstimate` from transient spacing.

Current behavior:

- reuses the validated WAV-loading path
- derives a coarse BPM estimate from repeated onset intervals
- returns bounded confidence plus optional ambiguity candidates instead of forcing one exact BPM answer

This estimate is intentionally local to `modules/analysis`; it is not a shared cross-module contract artifact.

### `estimatePitchCenter(audioVersion, options?)`

Builds a standalone `PitchCenterEstimate` for material that reads as voiced or mixed.

Current behavior:

- reuses the validated WAV-loading path
- performs a conservative multi-window pitch-center pass
- returns `voicing`, bounded confidence, and optional `frequency_hz`, `midi_note`, and `note_name`
- also reports uncertainty and analyzed-window counts so downstream callers can inspect stability

### `suggestLoopBoundaries(audioVersion, options?)`

Builds a standalone `LoopBoundarySuggestionSet`.

Current behavior:

- reuses validated WAV loading and transient detection
- scores adjacent repeated spans directly in seconds
- returns one or more explicit candidates with `start_seconds`, `end_seconds`, `duration_seconds`, `confidence`, and `rationale`
- stays conservative and may return no suggestions when repetition evidence is weak

## Validation helpers

The module exports schema helpers for every currently published standalone output:

- `assertValidAnalysisReport(report)` / `isValidAnalysisReport(report)`
- `assertValidTransientMap(map)` / `isValidTransientMap(map)`
- `assertValidTempoEstimate(estimate)` / `isValidTempoEstimate(estimate)`
- `assertValidPitchCenterEstimate(estimate)` / `isValidPitchCenterEstimate(estimate)`
- `assertValidLoopBoundarySuggestionSet(set)` / `isValidLoopBoundarySuggestionSet(set)`

The `assert*` helpers throw on invalid payloads. The `isValid*` helpers return booleans only.

## Public types

`src/index.ts` re-exports the current local types for:

- `AnalysisReport`, `AnalysisMeasurements`, `AnalysisAnnotation`, and related report subtypes
- transient types such as `TransientEvent` and `TransientMap`
- tempo, pitch-center, and loop-suggestion types
- option types such as `AnalyzeAudioOptions`, `TransientDetectionOptions`, `TempoEstimationOptions`, `EstimatePitchCenterOptions`, and `LoopBoundarySuggestionOptions`

These local types describe the current implementation surface. The cross-module contract source of truth still lives under `contracts/schemas/`.

## Current assumptions

- input files must already exist on disk
- analysis currently requires `.wav` input
- `ffmpeg` must be available on `PATH`
- the decoded file metadata must match `AudioVersion.audio`
- stereo measurements inspect only the first two channels when the source has more than two channels

## Known limitations

- analysis reads the whole file into memory
- annotation and summary language remain heuristic, not perceptual-model output
- hum detection is limited to steady `50 Hz` or `60 Hz` mains-style evidence
- click detection targets very short impulsive spikes and can miss slower pops or crackle beds
- tempo, pitch-center, and loop-boundary outputs are intentionally conservative and may return ambiguity or no suggestion instead of over-claiming
