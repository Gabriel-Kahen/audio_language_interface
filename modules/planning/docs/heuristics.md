# Planning Heuristics

## Purpose

Document the initial deterministic request-to-plan mappings used by `modules/planning`.

## Current phrase mappings

- `darker`, `less bright` -> gentle `tilt_eq` darkening around `1200 Hz`
- `less harsh`, `smoother` -> `notch_filter` centered on the analysis harshness annotation midpoint, or `3750 Hz` fallback
- `cleaner`, `clean up a bit` -> conservative tonal cleanup only when analysis or semantics show harshness or muddiness; otherwise reject as underspecified
- `brighter`, `more presence` -> gentle `tilt_eq` brightening around `1200 Hz`
- `airier`, `more air` -> `high_shelf` boost around `6500 Hz`
- `less muddy` -> `low_shelf` cut around `220 Hz`
- `warmer`, `more warmth` -> `low_shelf` boost around `180 Hz`
- `rumble`, `subsonic` -> `high_pass_filter` at `40 Hz`
- `more controlled`, `compression`, `tighter and more controlled` -> conservative `compressor` settings with explicit threshold, ratio, attack, and release
- `louder and more controlled`, `make it louder and more controlled` -> dedicated `compressor -> normalize` path that tightens dynamics first, then raises integrated loudness with measured staging and explicit true-peak protection
- `control peaks`, `catch peaks`, `limiter` -> conservative `limiter` settings with explicit `ceiling_dbtp`, `release_ms`, `lookahead_ms`, and no added limiter input gain by default
- explicit `normalize` / `normalise` requests -> `normalize` with integrated-loudness targeting and a `-1 dBTP` ceiling
- `remove noise`, `reduce hiss`, `denoise` -> conservative `denoise` only when analysis indicates sustained noise
- `tame sibilance`, `de-ess` -> conservative `de_esser`
- `remove clicks`, `declick`, `remove pops` -> conservative `declick`
- `remove 50 Hz hum`, `remove 60 Hz hum`, `dehum 50 hz`, `dehum 60 hz` -> conservative `dehum` at the explicitly requested mains frequency
- `wider`, `widen`, `more width`, `narrower`, `narrow it` -> conservative `stereo_width` only for already-stereo material with safe balance and correlation
- `speed it up`, `slow it down`, `narrow this` -> same baseline timing or stereo-width mappings as the corresponding shorter phrases
- `center this more`, `more centered`, `fix stereo imbalance` -> conservative `stereo_balance_correction` only for already-stereo material with clear but not extreme left-right imbalance
- `louder` -> conservative `gain` step limited by measured true-peak headroom to a `-1 dBTP` ceiling unless the request also explicitly asks for more control, in which case the dedicated controlled-loudness path takes precedence
- `quieter` -> conservative negative `gain` step
- `trim from Xs to Ys` -> `trim` time-range step with explicit start and end seconds
- `make the first 0.5 seconds darker`, `remove 60 Hz hum only in the last 0.5 seconds`, `make it less harsh from 0.2s to 0.7s` -> keep the same supported operation family, but ground the steps to one explicit `time_range` target instead of `full_file`
- `trim the silence`, `remove silence at the beginning and end` -> full-file `trim_silence` using a conservative threshold derived from the measured noise floor
- `speed up by 10%`, `slow down by 10%`, `faster`, `slower` -> conservative `time_stretch` with explicit `stretch_ratio` and pitch-preservation verification
- `pitch up by 2 semitones`, `pitch down by 2 semitones`, `transpose` -> conservative `pitch_shift` only when analysis says the source is pitched
- `fade in Xs`, `fade out Xs` -> `fade` step with explicit durations

## Compound prompt ordering

When one request maps to multiple supported operations, the baseline planner emits steps in a fixed phase order instead of preserving phrase order from the prompt:

- source selection: `trim`
- boundary cleanup: `trim_silence`
- duration shaping: `time_stretch`
- pitch shaping: `pitch_shift`
- boundary envelopes: `fade`
- restoration: `declick`, `dehum`, `denoise`, `de_esser`
- filters: `high_pass_filter`
- tonal balance: EQ and filter-toning steps such as `tilt_eq`, `notch_filter`, `high_shelf`, `low_shelf`
- dynamics: `compressor`, `limiter`, or the dedicated controlled-loudness path
- stereo image: `stereo_balance_correction`, `stereo_width`
- loudness: `normalize`, `gain`

Compatible compounds that the baseline planner now supports explicitly include:

- timing plus restoration such as `trim_silence + declick`
- timing plus tonal such as `time_stretch + tilt_eq`
- restoration plus tonal when the moves do not directly fight each other, such as `declick + tilt_eq`
- tonal plus controlled loudness such as `tilt_eq + compressor + normalize`
- stereo centering plus width changes when the source is already stereo, materially off-center, and not too narrow for both moves
- stereo plus tonal shaping such as `tilt_eq + stereo_balance_correction`

## Safety posture

- The baseline planner only emits operations currently implemented by `modules/transforms`.
- Requests that are vague, contradictory, or blocked by missing evidence are classified as `supported_but_underspecified`.
- Time-based requests are checked against the current `AudioVersion` duration before a plan is emitted.
- Combined `fade in` and `fade out` coverage must not overlap and must stay at or below `50%` of the available duration.
- Compound timing verification composes earlier duration-changing edits first, so `time_stretch` and `pitch_shift` guards use post-trim or post-silence-trim expected durations rather than raw source duration.
- If a request cannot be mapped to an explicit supported operation, planning fails instead of guessing.
- Requests for runtime-available but non-planner-enabled operations such as `reverb`, `delay`, `echo`, `bitcrush`, `distortion`, `saturation`, `flanger`, `phaser`, or `reverse` are classified as `supported_runtime_only_but_not_planner_enabled`.
- Requests for declip, dereverb, and broader restoration categories outside denoise, de-ess, declick, and dehum still fail explicitly.
- Generic cleanup wording does not automatically turn hum or click evidence into restoration steps; hum and click cleanup still require explicit supported intent.
- Denoise only proceeds when steady-noise evidence is present; otherwise the planner rejects the request instead of guessing.
- Hum and click verification stay conservative: the planner now prefers direct `AnalysisReport.artifacts` evidence when annotations or semantics support it and only uses coarse low-band or clipped-sample fallbacks where direct artifact measurements are unavailable.
- Pitch shifting only proceeds when `AnalysisReport.source_character.pitched` is true, and time stretching keeps duration targets conservative rather than attempting broad tempo inference.
- The planner refuses explicit trim-point requests combined with automatic silence trimming so it does not guess which boundary edit should win.
- Region-targeted planning is intentionally narrower than runtime `time_range` support. The first planner-grounded cohort is limited to EQ/tonal shaping, conservative restoration, gain/normalize staging, and the current stereo cleanup steps.
- Region wording must resolve to one explicit numeric window. Phrases such as `intro`, `outro`, `middle section`, or `ending word` still fail as `supported_but_underspecified`.
- Region-targeted requests still fail when the selected operation family is full-file-only in the baseline planner, such as `trim_silence`, `time_stretch`, `pitch_shift`, or the current dynamics-control path.
- The planner refuses louder-plus-peak-control prompts unless the request explicitly asks for normalization, rather than silently converting that into post-limiter gain staging.
- The planner refuses upper-band brightening combined with de-essing, because the current one-pass phase order cannot guarantee that added air or brightness will not undermine the de-essing move.
- The planner refuses broadband denoise combined with upper-band brightening, because brightening after denoise can exaggerate cleanup artifacts in one conservative pass.
- The planner refuses hum removal combined with added warmth, because the current baseline planner does not safely combine narrow low-band cleanup with compensating low-shelf boosts in one pass.
- The planner refuses stereo narrowing plus recentering when the source is not already wide enough for both moves conservatively.
- Stereo-width changes only proceed for two-channel material that is not already too wide, too narrow, or stereo-ambiguous for a conservative move.
- Stereo-balance correction only proceeds for two-channel material when measured balance is clearly off-center but not so extreme that a one-shot conservative correction would be unsafe.
- Tonal moves are intentionally small: `1.5 dB`, `2 dB`, or `3 dB` style shelves and tilts, with notch cuts kept surgical and narrow.
- `preserve punch` keeps compressor settings conservative by using a slower attack and tighter safety constraints.
