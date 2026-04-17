# Render Module Agent Guide

## Mission

Own preview generation, export rendering, and render metadata.

## Architectural role

`render` is part of the audio runtime. It turns audio versions into artifacts suitable for audition, sharing, or downstream comparison.

## Owns

- fast preview renders, currently centered on MP3 previews
- final-quality export renders, currently centered on WAV and FLAC
- render format selection and render-time metadata
- waveform or summary artifacts that assist inspection

## Inputs

- `AudioVersion`
- render configuration

## Outputs

- `RenderArtifact`
- preview files
- final export files
- render metadata and warnings

## Must not own

- planning edits
- transform decision-making
- high-level workflow policy
- semantic labeling

## Coordination rules

- separate render concerns from core audio processing logic
- document differences between preview and final render paths
- keep outputs easy for comparison and tooling layers to consume

## Deliverables

- render APIs
- render artifact contracts
- tests for format correctness and reproducibility where applicable

## Success criteria

Any audio version can be rendered into predictable preview and export artifacts without hidden behavior.
