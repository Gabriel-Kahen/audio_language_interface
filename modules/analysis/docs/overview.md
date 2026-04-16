# Analysis Overview

## Purpose

Measure what is present in an audio signal and publish the result as an `AnalysisReport`,
plus standalone transient-event data for downstream slice-map consumers.

This module is currently a deterministic baseline analyzer for materialized WAV audio referenced by an `AudioVersion`. It produces contract-aligned measurements, annotations, segments, and a coarse source classification without making edit recommendations.

## Public API surface

- `analyzeAudioVersion(audioVersion, options?) => Promise<AnalysisReport>`
- `detectTransients(audioVersion, options?) => TransientMap`
- `assertValidAnalysisReport(report)` and `isValidAnalysisReport(report)` for contract checks
- exported contract-aligned types from `src/types.ts`

## Entry point

Import from the published package name:

```ts
import { analyzeAudioVersion, detectTransients } from "@audio-language-interface/analysis";
```

`analyzeAudioVersion` performs the full baseline analysis pipeline:

1. validates the input `AudioVersion` against the published JSON Schema
2. resolves `audio.storage_ref` relative to `options.workspaceRoot` or the current working directory and rejects paths that would escape the workspace root
3. loads PCM data from a `.wav` file
4. verifies the decoded WAV metadata against `AudioVersion.audio` before analysis continues
5. measures integrated loudness and true peak with FFmpeg `loudnorm`
6. runs levels, segments, dynamics, spectrum, stereo, artifact, and source-character analyzers
7. builds a contract-aligned `AnalysisReport`
8. validates the final report against the `AnalysisReport` schema before returning it

`detectTransients` reuses the same input validation and normalized WAV loading path, then
returns a standalone transient map built from short-window onset scoring and peak picking.

## Input assumptions

- Input must satisfy the `AudioVersion` contract.
- `audio.storage_ref` must remain inside the selected workspace root after resolution. This baseline analyzer only accepts `.wav` files and rejects other container formats explicitly.
- The referenced WAV file must exist and be decodable by `wavefile`.
- `ffmpeg` must be available on `PATH` because integrated loudness and true peak are measured through the `loudnorm` filter.
- The decoded file metadata is treated as the source of truth. Analysis fails if `audio.sample_rate_hz`, `audio.channels`, `audio.duration_seconds`, or `audio.frame_count` do not match the decoded WAV within a one-frame duration tolerance.
- Analysis uses decoded floating-point PCM samples and derives a mono view by averaging channels.

## Output shape

The emitted `AnalysisReport` always includes these measurement families:

- `levels`
- `dynamics`
- `spectral_balance`
- `stereo`
- `artifacts`

It may also include:

- `annotations` for clipping, localized brightness, localized harshness, and transient-impact hotspots
- `annotations` for clipping, localized brightness, localized harshness, transient-impact hotspots, sustained noise-like regions, and localized stereo-width or width-ambiguity evidence
- `segments` describing `silence`, `active`, or a synthetic full-file `loop` segment
- `source_character` for a coarse baseline class such as `drum_loop`, `tonal_phrase`, `ambience`, or `mixed_program`
- `summary.confidence` as a bounded heuristic confidence score from `0` to `1`

The standalone transient detector does not extend `AnalysisReport`; it returns a separate
machine-readable `TransientMap` with transient timestamps and bounded strengths that can be
consumed by downstream slice derivation.

## Measurement semantics

This baseline is intentionally simple and should be treated as a reproducible heuristic layer rather than a full mastering analyzer.

- `levels.integrated_lufs` comes from FFmpeg `loudnorm` `input_i`, which is an integrated loudness estimate in LUFS.
- `levels.true_peak_dbtp` comes from FFmpeg `loudnorm` `input_tp`, which is a true-peak estimate in dBTP.
- `levels.headroom_db` is the negated sample peak dBFS value.
- `levels.rms_dbfs` and `levels.sample_peak_dbfs` remain direct decoded-sample measurements and are included so downstream modules can distinguish heuristic sample-domain values from FFmpeg loudness values.
- `dynamics.rms_short_term_dbfs` is the median RMS of fixed 50 ms windows.
- `dynamics.dynamic_range_db` is `p95(window RMS) - p10(window RMS)` over those fixed windows.
- `dynamics.transient_density_per_second` comes from the segment analyzer and counts windows whose level rises by more than 6 dB and exceeds `-24 dBFS`.
- `dynamics.transient_crest_db` is the 90th-percentile peak-minus-RMS crest value across active 50 ms windows, and `dynamics.punch_window_ratio` is the fraction of active windows whose crest is at least 9 dB at levels above `-30 dBFS`.
- `spectral_balance` comes from a simple windowed DFT on the mono signal using a Hann window, 512-sample frames, and at most 256 overlapping analysis hops.
- Spectral bands are hard-coded as low `<250 Hz`, mid `250 Hz to <4000 Hz`, and high `>=4000 Hz`.
- `spectral_balance.brightness_tilt_db` is `high_band_db - low_band_db`.
- `spectral_balance.presence_band_db` measures average energy in the `2500 Hz to <6000 Hz` band.
- `spectral_balance.harshness_ratio_db` is `presence_band_db - low_mid_band_db`, where `low_mid_band_db` is measured over `250 Hz to <2000 Hz`.
- `stereo.width` is side RMS divided by `mid RMS + side RMS` for the first two channels.
- `stereo.correlation` is a simple Pearson-style correlation of the first two channels.
- `stereo.balance_db` is left RMS dBFS minus right RMS dBFS.
- `artifacts.noise_floor_dbfs` is the 10th-percentile fixed-window RMS estimate, not a separated noise-only model.
- `noise` annotations require sustained low-level windows with elevated zero-crossing activity and low crest factor. They are intended as denoise-oriented evidence, not as a source-separation claim.
- `stereo_width` and `stereo_ambiguity` annotations localize width-related evidence or conflict. They inspect only the first two channels, ignore very quiet windows, and should be treated as phase-risk heuristics rather than a full stereo imaging model.
- Summary wording only calls material `wide stereo` when sustained `stereo_width` evidence supports it. Ambiguous or weakly supported spread is described more cautiously.
- `artifacts.clipping_detected` flags frames where any channel reaches absolute amplitude `>= 0.999`, and `clipped_sample_count` counts the total clipped channel samples at that threshold.

See `modules/analysis/docs/measurement-semantics.md` for thresholds, windows, and classification rules.

## Deterministic behavior

- The implementation is deterministic and uses no randomization, but it does invoke `ffmpeg` as an external subprocess for loudness measurement.
- Given the same decoded WAV samples, analyzer version, and `generatedAt` option, the module produces the same measurements, annotations, segments, and summary text.
- `report_id` is deterministic for a given `version_id`, `audio.storage_ref`, analyzer name, and analyzer version.
- `generated_at` defaults to `audioVersion.lineage.created_at`, so callers get a stable report timestamp unless they intentionally override it with `options.generatedAt`.

## Suggested initial source files

- `src/analyze-audio.ts`: top-level analysis entrypoint
- `src/analyzers/levels.ts`: peaks, loudness, headroom
- `src/analyzers/dynamics.ts`: RMS, crest factor, transient density
- `src/analyzers/spectrum.ts`: band energy and centroid metrics
- `src/analyzers/stereo.ts`: width, correlation, balance
- `src/analyzers/artifacts.ts`: clipping, noise, hum, click detection
- `src/analyzers/segments.ts`: silence, onsets, sections, events
- `src/analyzers/transients.ts`: transient-map detection and event picking
- `src/analyzers/source-character.ts`: coarse source classification
- `src/detect-transients.ts`: public transient-map entrypoint
- `src/report-builder.ts`: `AnalysisReport` construction
- `src/index.ts`: public exports only

## Dependencies

- `modules/core`
- `modules/io` for normalized input assumptions
- `AnalysisReport` contract
- runtime packages: `ajv`, `ajv-formats`, `execa`, `wavefile`
- system dependency: `ffmpeg` on `PATH`

## Downstream consumers

- `semantics`
- `planning`
- `compare`
- `tools`
- `orchestration`

## Non-goals

- semantic descriptor assignment not directly tied to measurement
- planning edits
- transform execution

## Current limitations

- Only `.wav` inputs are supported by the baseline loader even though `AudioVersion` itself is container-agnostic.
- Analysis reads the entire file into memory.
- Multi-channel files beyond stereo are loaded, but stereo metrics only inspect the first two channels.
- Brightness, harshness, and transient-impact annotations are threshold-based heuristics, not perceptual models.
- Transient-map events are short-window local-contrast heuristics, not a source-separation model or a replacement for slice-accurate manual edits.
- Noise annotations are broadband-floor heuristics and can miss tonal hum, sparse clicks, or noise that only appears under louder foreground material.
- Stereo-width annotations are local side-versus-mid heuristics gated to active windows, so brief or very low-level spread may remain intentionally unannotated. They do not model perceptual spaciousness or all phase artifacts.
- Segment detection is energy-threshold based and only emits `active`, `silence`, or a synthetic full-length `loop` segment.
- Source classification is a coarse heuristic and not a trained classifier.
- Pitch detection uses a short autocorrelation-like pass over the beginning of the file only.
- Summary text is generated from heuristics and should not be treated as a complete verbal description of the signal.

## Test expectations

- validate analyzers against synthetic fixtures where possible
- verify reproducibility of measurement outputs
- verify annotation structure and confidence handling
- verify contract alignment for `AnalysisReport`

Current coverage in `modules/analysis/tests/analyze-audio.test.ts` validates:

- contract alignment for generated reports
- silence and active segment emission on a simple stereo fixture
- pitched signal classification on a tonal fixture
- clipping detection and transient density on a pulse-heavy fixture
- localized brightness annotations and brightness tilt measurements
- localized harshness annotations and presence-band evidence
- transient-impact annotations and punch-window metrics
- sustained noise annotations tied to elevated broadband floor evidence
- localized stereo-width and stereo-ambiguity annotations
- transient-map event detection with stable onset timestamps
