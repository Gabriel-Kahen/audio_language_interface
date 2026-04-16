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
9. pitch-center estimation
10. source-character classification
11. report construction and schema validation

`detectTransients` uses the same decode and normalization path but skips report construction
and returns a standalone transient map.

`estimateTempo` also uses the same decode and normalization path, then:

1. runs the standalone transient detector
2. derives BPM candidates from short transient-spacing spans
3. scores each candidate against pairwise onset alignment
4. returns one best BPM plus confidence and close alternates when ambiguity remains

`estimatePitchCenter` also uses the same decode and normalization path as the report pipeline but
skips the loudness, annotation, and report-building stages.

## Shared constants

- segment window: `0.05` seconds
- spectrum window size: `512` samples
- spectrum maximum frame hops: `256`
- spectrum hop size: evenly spaced overlapping hops across the file, capped at `256` analyzed frames
- transient window: `0.02` seconds
- transient hop: `0.01` seconds
- pitch window size: `2048` samples
- pitch maximum analysis windows: `3`

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
- `transient_crest_db`: `90th percentile` of active-window `(peak dBFS - RMS dBFS)` values
- `punch_window_ratio`: fraction of active windows whose RMS exceeds `-30 dBFS` and crest is at least `9 dB`

Interpretation note: `transient_density_per_second` alone is not sufficient punch evidence. Downstream modules should combine it with `transient_crest_db`, `punch_window_ratio`, and clipping or dynamic-range context before calling material punchy.

### Transient-impact annotation

- Annotation kind: `transient_impact`
- Windowing matches the segment and short-term dynamics window: `0.05` seconds
- Active windows are windows above `-36 dBFS` RMS
- A punch-sensitive window is one above `-30 dBFS` RMS with crest at least `9 dB`
- Consecutive punch-sensitive windows are merged into one annotation
- Annotation severity is `clamp((maxCrestDb - 9) / 9, 0, 1)` within the merged region
- Band hint is `[60, 4000]` to indicate the broad low-to-presence range most relevant to first-slice punch preservation

## Transient-map detector

- Uses overlapping windows of `max(64, sampleRateHz * 0.02)` frames.
- Uses a hop of `max(32, sampleRateHz * 0.01)` frames.
- For each window, the detector measures RMS dBFS, peak dBFS, crest factor, and contrast against the immediately preceding window.
- A window qualifies as a transient candidate when it is a local score maximum, has at least `3 dB` contrast above the preceding frame, and its RMS is at least `-48 dBFS`.
- Nearby candidates are de-duplicated with a minimum separation of `0.05` seconds.
- Each transient reports a single `time_seconds` anchor, a bounded `strength`, and optional `confidence`.
- `transient_map_id` is deterministic for the version, storage reference, analyzer name/version, and the detector window settings.
- The detector is intentionally conservative and is meant for slice-map guidance, not sample-accurate edit placement.

## Tempo estimator

- Tempo estimation reuses the transient detector output instead of re-decoding or introducing a second onset path.
- At least `3` transient events are required before the estimator will return any BPM.
- Candidate BPMs come from transient-pair spacings across spans up to `4` pulses, plus half-time and double-time variants for each base spacing.
- The default search window is `60 BPM` through `200 BPM`.
- Candidate alignment is evaluated against pairwise transient intervals:
  - intervals may align to integer beat multiples from `1` through `8`
  - alignment tolerance is `12%` of the tested beat period
  - longer beat multiples are penalized so direct one-beat spacing wins over equally valid half-time or double-time explanations
- Confidence combines:
  - the best candidate's alignment score: 65%
  - separation from the next-best candidate: 20%
  - transient-count support: 15%
- When confidence falls below `0.35`, the estimator returns `bpm: null` and only surfaces the top candidate list as ambiguity evidence.

Important limitation: this is still a coarse onset-spacing heuristic. It is designed for clear rhythmic material such as click tracks, drum loops, or pulse-driven fixtures. It does not infer musical meter, does not disambiguate subdivision-heavy material reliably, and can expose half-time or double-time alternates even when one BPM is chosen as the best fit.

## Spectrum analyzer

- Operates on the mono signal.
- Uses a Hann window and a direct DFT implementation.
- Analysis frames use evenly spaced overlapping hops and stop after at most `256` analyzed frames.
- Bands are:
  - low: `<250 Hz`
  - mid: `250 Hz` to `<4000 Hz`
  - high: `>=4000 Hz`
- Additional evidence bands are:
  - low-mid support: `250 Hz` to `<2000 Hz`
  - presence: `2500 Hz` to `<6000 Hz`
- `spectral_centroid_hz` is the magnitude-weighted frequency centroid.
- `brightness_tilt_db` is `high_band_db - low_band_db`.
- `presence_band_db` is the average dB value of the presence band.
- `harshness_ratio_db` is `presence_band_db - low_mid_band_db`.
- If no full frame fits the file, all band levels are returned as `-120` and centroid as `0`.

### Brightness annotation

- Severity is `clamp((frameHighDb - frameLowDb - 8) / 10, 0, 1)` on each analysis frame.
- A frame only qualifies when the local centroid is at least `2200 Hz`.
- Consecutive qualifying frames are merged into one `brightness` annotation.
- The annotation uses the band hint `[4000, 12000]`.

### Harshness annotation

- Severity is `clamp((framePresenceDb - frameLowMidDb - 4) / 8, 0, 1)` on each analysis frame.
- A frame only qualifies when the local centroid is at least `1800 Hz`.
- Consecutive qualifying frames are merged into one `harshness` annotation.
- The annotation uses the band hint `[2500, 6000]`.

## Stereo analyzer

- Mono or single-channel files return width `0`, correlation `1`, and balance `0`.
- For multi-channel files, only the first two channels are inspected.
- Mid is `(L + R) / 2`; side is `(L - R) / 2`.
- `width` is `rms(side) / (rms(mid) + rms(side))`.
- `balance_db` is `leftRmsDbfs - rightRmsDbfs`.

### Stereo width annotations

- Windowing matches the segment and short-term dynamics window: `0.05` seconds.
- Only windows at or above `-42 dBFS` combined stereo RMS are considered, so quiet tails or silence do not create width evidence by themselves.
- `stereo_width` marks windows where local width is at least `0.33`, correlation stays between `0.15` and `0.98`, and left-right balance stays within `4.5 dB`.
- `stereo_ambiguity` marks windows where local width is at least `0.28` while correlation falls below `0.1`.
- Consecutive qualifying windows are merged into one annotation, but merged regions shorter than `0.10` seconds are discarded.
- These annotations are intended to separate stable width evidence from potentially phase-sensitive width evidence.

## Artifact analyzer

- A frame is clipped when any channel has absolute amplitude `>= 0.999`.
- `clipped_sample_count` is the number of clipped channel samples at that threshold.
- If clipping is found, one annotation is emitted from the first clipped frame to the last clipped frame.
- Clipping severity is `clamp(clippedFrames / max(frameCount * 0.01, 1), 0, 1)`.
- `noise_floor_dbfs` is estimated as the 10th-percentile fixed-window RMS dBFS value.

### Noise annotation

- Windowing matches the segment and short-term dynamics window: `0.05` seconds.
- A window qualifies as `noise` when all of these hold:
  - estimated severity is at least `0.25`
  - RMS is at least `-72 dBFS`
  - RMS is no more than `8 dB` above the file-level `noise_floor_dbfs`
  - crest factor is at most `6 dB`
  - zero-crossing ratio is at least `0.12`
- Consecutive qualifying windows are merged, but regions shorter than `0.12` seconds are discarded.
- The annotation uses the band hint `[2000, 12000]` to reflect that the current heuristic is mainly tuned for hiss-like broadband noise, not low-frequency hum.
- Noise evidence strings now include duration and how far the region rises above the estimated file-level floor so downstream modules can distinguish sustained floor evidence from a barely raised bed.
- Important limitation: this is still a heuristic low-level broadband detector. It does not separate noise from foreground content and should not be treated as a calibrated SNR estimate.

Threshold summary for downstream modules:

- silence threshold: `-50 dBFS` window RMS
- transient gate: rise `> 6 dB` and current window `> -24 dBFS`
- transient-impact window: RMS `> -30 dBFS` and crest `>= 9 dB`
- transient-map candidate gate: local contrast `>= 3 dB`, window RMS `>= -48 dBFS`, and onset strength `>= 0.35`
- clipping threshold: absolute sample amplitude `>= 0.999`
- stereo-width annotation threshold: local width `>= 0.33` with correlation `>= 0.15`
- stereo-ambiguity threshold: local width `>= 0.28` with correlation `< 0.1`
- brightness annotation threshold: severity `> 0.2` with local centroid `>= 2200 Hz`
- harshness annotation threshold: severity `> 0.2` with local centroid `>= 1800 Hz`
- noise annotation threshold: severity `>= 0.25`, crest `<= 6 dB`, zero-crossing ratio `>= 0.12`, and RMS near the estimated floor
- tempo search window: `60 BPM` to `200 BPM` by default
- tempo confidence floor for emitting a BPM: `0.35`
- pitch active-window threshold: RMS `>= -42 dBFS`
- pitch candidate threshold: normalized autocorrelation-style score `>= 0.68`
- voiced pitch-center threshold: voiced-window ratio `>= 0.6`, uncertainty `<= 35 cents`, confidence `>= 0.7`
- mixed pitch-center threshold: voiced-window ratio `>= 0.25`, uncertainty `<= 80 cents`, confidence `>= 0.45`

## Pitch-center estimation

- Operates on the mono signal.
- Samples up to `3` evenly spaced `2048`-sample windows across the file instead of only the beginning.
- Only windows at or above `-42 dBFS` RMS are considered active enough for pitch estimation.
- Searches lags corresponding roughly to `80 Hz` through `1000 Hz`.
- For each active window, the estimator keeps the strongest normalized autocorrelation-style candidate when its score is at least `0.68`.
- Window candidates are merged with a score-weighted center in MIDI space, then converted back to `frequency_hz`.
- `uncertainty_cents` is the score-weighted average absolute deviation from that center.
- `voicing` is:
  - `voiced` when enough active windows agree on a stable center
  - `mixed` when some windows support a center but stability or coverage is weaker
  - `unvoiced` when no conservative center is available
- `midi_note` is the nearest integer MIDI note to the estimated center, and `note_name` is the corresponding chromatic note label with octave.

Important limitation: this estimator still assumes a roughly stable center inside each analysis
window. Strong vibrato, fast glides, dense polyphony, or inharmonic material can degrade the
reported confidence or push the result to `mixed` or `unvoiced`.

## Source-character classification

Classification is heuristic and rule-based:

- `drum_loop` when transient density is at least `1.5` and the signal is not pitched
- `tonal_phrase` when the signal is pitched and transient density is below `1`
- `ambience` when active-frame ratio is below `0.5`, spectral centroid is below `1500 Hz`, and stereo width is above `0.2`
- otherwise `mixed_program`

The current source-character path treats a non-`unvoiced` pitch-center estimate as pitched.

Confidence values are fixed by class in the current implementation:

- `drum_loop`: `0.85`
- `tonal_phrase`: `0.78`
- `ambience`: `0.7`
- `mixed_program`: `0.55`

## Summary generation

The summary is generated from measurement heuristics only.

- brightness descriptor:
  - `bright` when `brightness_tilt_db > 6`
  - `dark` when `brightness_tilt_db < -6`
  - otherwise `balanced`
- stereo descriptor:
  - `mono` when width `< 0.05`
  - `narrow stereo` when width `< 0.2`
  - otherwise `wide stereo`
- transient phrase:
  - `with strong transient impact` when transient density is at least `1.5` or `transient_crest_db >= 10`
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
