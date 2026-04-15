# Analysis Measurement Semantics

## Scope

This document records the actual semantics of the current `modules/analysis` implementation so downstream modules do not over-interpret the baseline output.

## Pipeline order

`analyzeAudioVersion` runs analyzers in this order:

1. WAV decode and normalization
2. FFmpeg loudness measurement
3. levels
4. segments
5. dynamics
6. spectrum
7. stereo
8. artifacts
9. pitched-signal detection
10. source-character classification
11. report construction and schema validation

## Shared constants

- segment window: `0.05` seconds
- spectrum window size: `512` samples
- spectrum maximum frame hops: `256`

## File loading and normalization

- Only `.wav` files are accepted.
- The loader resolves `audio.storage_ref` relative to the workspace root and rejects paths that escape it.
- The decoded file is converted to `32f` samples.
- Mono analysis input is produced by averaging all channels sample-by-sample.
- Analysis fails before report construction when the decoded sample rate, channel count, frame count, or duration do not match the input `AudioVersion` metadata. Duration comparison allows at most one decoded frame of tolerance.

Important contract note: `AudioVersion` is intentionally format-agnostic, but this module's current baseline implementation is not. Downstream callers should treat non-WAV support as out of scope for `modules/analysis` until the loader contract is widened deliberately.

## Levels analyzer

- `integrated_lufs`: FFmpeg `loudnorm` `input_i` reading for the source file
- `true_peak_dbtp`: FFmpeg `loudnorm` `input_tp` reading for the source file
- `rms_dbfs`: duplicate of the full-file mono RMS dBFS value
- `sample_peak_dbfs`: duplicate of the full-file mono sample peak dBFS value
- `headroom_db`: negative of `sample_peak_dbfs`

Measurement notes:

- FFmpeg is invoked as `ffmpeg -hide_banner -nostats -i <path> -af loudnorm=I=-24:TP=-2:LRA=7:print_format=json -f null -`.
- The `I`, `TP`, and `LRA` filter settings are only measurement targets for the filter invocation. The module consumes the reported input metrics and does not perform a normalization render.
- `rms_dbfs`, `sample_peak_dbfs`, and `headroom_db` are sample-domain companion metrics, not substitutes for LUFS or true peak.

## Segment analyzer

- Uses fixed windows of `max(64, sampleRateHz * 0.05)` frames.
- Each window is labeled `active` when window RMS is above `-50 dBFS`; otherwise `silence`.
- Consecutive windows of the same state are merged into one segment.
- If the entire file is one `active` segment, the output is replaced with a synthetic `loop` segment spanning the full file.
- `transientDensityPerSecond` counts windows where level rises more than `6 dB` over the previous window and the current window exceeds `-24 dBFS`.
- `activeFrameRatio` is the fraction of active windows across the file.

## Dynamics analyzer

- `crest_factor_db`: sample peak dBFS minus RMS dBFS of the mono signal
- `transient_density_per_second`: forwarded from the segment analyzer
- `rms_short_term_dbfs`: median of fixed-window RMS dBFS values
- `dynamic_range_db`: `95th percentile - 10th percentile` of those window RMS dBFS values

## Spectrum analyzer

- Operates on the mono signal.
- Uses a Hann window and a direct DFT implementation.
- Analysis frames advance by `max(windowSize, floor(totalFrames / 256))`, which caps the number of hops.
- Bands are:
  - low: `<250 Hz`
  - mid: `250 Hz` to `<4000 Hz`
  - high: `>=4000 Hz`
- `spectral_centroid_hz` is the magnitude-weighted frequency centroid.
- If no full frame fits the file, all band levels are returned as `-120` and centroid as `0`.

### Harshness annotation

- Severity is `clamp((highBandDb - midBandDb - 3) / 12, 0, 1)`.
- An annotation is emitted when severity exceeds `0.2`.
- The annotation spans the entire file and uses the band hint `[3000, 4500]`.

## Stereo analyzer

- Mono or single-channel files return width `0`, correlation `1`, and balance `0`.
- For multi-channel files, only the first two channels are inspected.
- Mid is `(L + R) / 2`; side is `(L - R) / 2`.
- `width` is `rms(side) / (rms(mid) + rms(side))`.
- `balance_db` is `leftRmsDbfs - rightRmsDbfs`.

## Artifact analyzer

- A frame is clipped when any channel has absolute amplitude `>= 0.999`.
- `clipped_sample_count` is the number of clipped channel samples at that threshold.
- If clipping is found, one annotation is emitted from the first clipped frame to the last clipped frame.
- Clipping severity is `clamp(clippedFrames / max(frameCount * 0.01, 1), 0, 1)`.
- `noise_floor_dbfs` is estimated as the 10th-percentile fixed-window RMS dBFS value.

Threshold summary for downstream modules:

- silence threshold: `-50 dBFS` window RMS
- transient gate: rise `> 6 dB` and current window `> -24 dBFS`
- clipping threshold: absolute sample amplitude `>= 0.999`
- harshness annotation threshold: severity `> 0.2`, where severity is based on `highBandDb - midBandDb`
- pitched-signal threshold: normalized autocorrelation-style score `> 0.65`

## Pitched-signal detection

- Uses up to the first `4096` mono samples only.
- Searches lags corresponding roughly to `80 Hz` through `1000 Hz`.
- Returns `true` when the best normalized autocorrelation-style score exceeds `0.65`.

Important limitation: if pitch evidence occurs later in the file, the current detector may miss it.

## Source-character classification

Classification is heuristic and rule-based:

- `drum_loop` when transient density is at least `1.5` and the signal is not pitched
- `tonal_phrase` when the signal is pitched and transient density is below `1`
- `ambience` when active-frame ratio is below `0.5`, spectral centroid is below `1500 Hz`, and stereo width is above `0.2`
- otherwise `mixed_program`

Confidence values are fixed by class in the current implementation:

- `drum_loop`: `0.85`
- `tonal_phrase`: `0.78`
- `ambience`: `0.7`
- `mixed_program`: `0.55`

## Summary generation

The summary is generated from measurement heuristics only.

- brightness descriptor:
  - `bright` when `high_band_db - low_band_db > 6`
  - `dark` when `high_band_db - low_band_db < -6`
  - otherwise `balanced`
- stereo descriptor:
  - `mono` when width `< 0.05`
  - `narrow stereo` when width `< 0.2`
  - otherwise `wide stereo`
- transient phrase:
  - `with strong transient activity` when transient density is at least `1.5`
  - otherwise `with restrained transient activity`
- clipping sentence:
  - `Clipping is present.` or `No clipping was detected.`

## Summary confidence

Summary confidence is a bounded heuristic combination of:

- source-character confidence: 60%
- stereo correlation term: 10%
- stereo balance term: 10%
- noise-floor term: 20%

This score is useful as a coarse internal confidence signal, not as a calibrated probability.
