# Analysis Module Agent Guide

## Mission

Own measurable audio inspection and structured reporting of what is present in a signal.

## Architectural role

`analysis` is part of the audio runtime. It should describe the audio without deciding what edits to apply.

## Owns

- time-domain analysis
- spectral analysis
- loudness and dynamics analysis
- stereo and spatial analysis
- artifact detection
- source-character and event-level analysis
- localized annotations with timestamps, bands, and confidence

## Inputs

- canonical `AudioVersion` inputs, currently centered on workspace-local WAV-backed analysis

## Outputs

- `AnalysisReport`
- raw metrics
- derived findings
- localized annotations
- confidence scores

## Must not own

- subjective language mapping beyond direct measurable findings
- user-intent interpretation
- edit planning
- transform execution

## Coordination rules

- keep outputs structured and machine-readable
- expose both raw metrics and higher-level findings
- prefer reproducible measurements over vague summaries
- document assumptions, windows, thresholds, and known limitations

## Deliverables

- analyzers with documented methods
- contract definitions for analysis output
- tests using stable fixtures or synthetic signals

## Success criteria

Another module can consume analysis results and understand what exists in the audio, where it exists, and how strongly it is present.
