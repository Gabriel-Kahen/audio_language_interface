# Planning Heuristics

## Purpose

Document the initial deterministic request-to-plan mappings used by `modules/planning`.

## Current phrase mappings

- `darker`, `less bright` -> gentle `tilt_eq` darkening around `1200 Hz`
- `less harsh`, `smoother`, non-regional `softer` -> `notch_filter` centered on the analysis harshness annotation midpoint, or `3750 Hz` fallback
- `more relaxed`, `less aggressive`, `less intense`, `less sharp`, `less gritty`, `less fuzzy` -> conservative tonal softening only when deterministic evidence supports that grounded reading; harshness/aggressive evidence may use `notch_filter + tilt_eq`, while brightness-only evidence uses darker `tilt_eq` without inventing harshness repair
- `less distorted`, `repair clipping`, `declip` -> conservative `declip` only when analysis shows direct clipping evidence
- with `planningPolicy = "best_effort"`, subjective texture repair or softening wording without direct artifact evidence falls back to conservative tonal softening and records a best-effort constraint note instead of claiming hard artifact repair
- `less crunchy` -> conservative `less harsh` proxy only when the request does not already read as explicit clipping or distortion repair
- `cleaner`, `clean up a bit` -> conservative tonal cleanup only when analysis or semantics show harshness or muddiness; otherwise reject as underspecified
- `brighter`, `more presence` -> gentle `tilt_eq` brightening around `1200 Hz`
- `airier`, `more air` -> `high_shelf` boost around `6500 Hz`
- `less muddy`, `clean up the low mids` -> low-mid `parametric_eq` bell cut around `360 Hz`; verification uses a low-threshold broad mid-band check because the actual edit is localized, and when this is combined with an explicit darker request, the planner omits the automatic lost-air guard because the user asked for a top-end reduction
- `warmer`, `more warmth` -> `low_shelf` boost around `180 Hz`; when paired with explicit quieter wording, verification checks warmer relative tonal tilt instead of absolute low-band gain because the level move intentionally reduces the whole signal
- `rumble`, `subsonic`, `high-pass the low end` -> `high_pass_filter` at `40 Hz`
- `more controlled`, `compression`, `tighter and more controlled` -> conservative `compressor` settings with explicit threshold, ratio, attack, and release
- `louder and more controlled`, `make it louder and more controlled` -> dedicated `compressor -> normalize` path that tightens dynamics first, then raises integrated loudness with measured staging and explicit true-peak protection
- `normalize it louder but keep it controlled` -> measured `normalize` path with true-peak protection when the source already measures as tightly controlled, or the controlled-loudness path when dynamics still have room to tighten safely
- `control peaks`, `catch peaks`, `limit the peaks`, `limiter` -> conservative `limiter` settings with explicit `ceiling_dbtp`, `release_ms`, `lookahead_ms`, and no added limiter input gain by default
- explicit `normalize` / `normalise` requests -> `normalize` with integrated-loudness targeting and a `-1 dBTP` ceiling
- `remove noise`, `reduce hiss`, `denoise` -> conservative `denoise` only when analysis indicates sustained noise
- `tame sibilance`, `de-ess` -> conservative `de_esser` only when analysis or semantics show sibilance evidence, including one strong or multiple localized upper-presence harshness annotations in the de-essing range
- `remove clicks`, `declick`, `remove pops` -> conservative `declick` only when analysis or semantics show click/pop evidence
- `remove 50 Hz hum`, `remove 60 Hz hum`, `dehum 50 hz`, `dehum 60 hz` -> conservative `dehum` at the explicitly requested mains frequency only when analysis or semantics show hum evidence
- `wider`, `widen`, `more width`, `narrower`, `narrow it` -> conservative `stereo_width` only for already-stereo material with safe balance and correlation
- `speed it up`, `slow it down`, `narrow this` -> same baseline timing or stereo-width mappings as the corresponding shorter phrases
- `increase playback speed by 10%`, `decrease playback speed by 10%`, `increase tempo by 10%`, `decrease tempo by 10%` -> same conservative `time_stretch` mapping as the shorter `speed up` or `slow down` wording
- `center this more`, `center the stereo image`, `more centered`, `fix stereo imbalance` -> conservative `stereo_balance_correction` only for already-stereo material with clear but not extreme left-right imbalance
- `louder` -> conservative `gain` step limited by measured true-peak headroom to a `-1 dBTP` ceiling unless the request also explicitly asks for more control and the source is not already tightly controlled, in which case the dedicated controlled-loudness path takes precedence
- `quieter` -> conservative negative `gain` step
- `trim from Xs to Ys` -> `trim` time-range step with explicit start and end seconds
- `make the first 0.5 seconds darker`, `remove 60 Hz hum only in the last 0.5 seconds`, `make it less harsh from 0.2s to 0.7s` -> keep the same supported operation family, but ground the steps to one explicit `time_range` target instead of `full_file`
- `make the last second softer` -> region-scoped `gain` reduction rather than tonal harshness repair
- `trim the silence`, `remove silence at the beginning and end` -> full-file `trim_silence` using a conservative threshold derived from the measured noise floor
- `speed up by 10%`, `slow down by 10%`, `faster`, `slower` -> conservative `time_stretch` with explicit `stretch_ratio` and pitch-preservation verification
- `pitch up by 2 semitones`, `pitch it up 3 semitones`, `transpose it up 3 semitones`, `lower the pitch by 1 semitone`, `pitch it up a bit`, `pitch it up like a whole octave`, `pitch down by 2 semitones`, `up an octave`, `down an octave`, `transpose` -> conservative `pitch_shift` only when analysis says the source is pitched
- `fade in Xs`, `fade in for Xs`, `fade out Xs`, `fade out for Xs`, `X second fade in`, `X second fade out` -> `fade` step with explicit durations

## Compound prompt ordering

When one request maps to multiple supported operations, the baseline planner emits steps in a fixed phase order instead of preserving phrase order from the prompt:

- source selection: `trim`
- boundary cleanup: `trim_silence`
- duration shaping: `time_stretch`
- pitch shaping: `pitch_shift`
- boundary envelopes: `fade`
- restoration: `declip`, `declick`, `dehum`, `denoise`, `de_esser`
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
- Requests for dereverb and broader restoration categories outside denoise, de-ess, declip, declick, and dehum still fail explicitly.
- Requests that explicitly ask to repair clipping now require direct clipping evidence. `declip` is hard-clipping repair only; broader distortion removal still fails instead of being approximated with tonal softening.
- If a compound prompt asks for declipping without clipping evidence, the planner drops the declip objective only when another independently safe companion objective remains; isolated `less distorted` or clipping-repair prompts still fail explicitly.
- Generic cleanup wording does not automatically turn hum or click evidence into restoration steps; hum and click cleanup still require explicit supported intent.
- Denoise, de-ess, declick, and dehum only proceed when matching evidence is present; otherwise the planner rejects the request instead of guessing.
- Clipping, hum, and click verification stay conservative: the planner now prefers direct `AnalysisReport.artifacts` evidence when annotations or semantics support it and only uses coarse fallback metrics where direct artifact measurements are unavailable.
- Pitch shifting only proceeds when `AnalysisReport.source_character.pitched` is true, and time stretching keeps duration targets conservative rather than attempting broad tempo inference.
- The planner refuses explicit trim-point requests combined with automatic silence trimming so it does not guess which boundary edit should win.
- Region-targeted planning is intentionally narrower than runtime `time_range` support. The first planner-grounded cohort is limited to EQ/tonal shaping, conservative restoration, gain/normalize staging, and the current stereo cleanup steps.
- Region wording must resolve to one explicit numeric window. Supported half-second aliases include `first half second`, `first half a second`, `last half second`, and `last half a second`. Phrases such as `intro`, `outro`, `middle section`, or `ending word` still fail as `supported_but_underspecified`.
- Region-targeted requests still fail when the selected operation family is full-file-only in the baseline planner, such as `trim_silence`, `time_stretch`, `pitch_shift`, or the current dynamics-control path.
- The planner refuses louder-plus-peak-control prompts unless the request explicitly asks for normalization, rather than silently converting that into post-limiter gain staging.
- The planner refuses pure `more controlled` or `louder and more controlled` requests when the source already measures as tightly controlled, because the current one-pass baseline is more likely to degrade peak behavior than to improve it on that material. Companion non-dynamics intents such as `darker` or `less harsh` can still proceed when their own path is safe.
- The planner refuses upper-band brightening combined with de-essing, because the current one-pass phase order cannot guarantee that added air or brightness will not undermine the de-essing move.
- The planner refuses broadband denoise combined with upper-band brightening, because brightening after denoise can exaggerate cleanup artifacts in one conservative pass.
- The planner refuses hum removal combined with added warmth, because the current baseline planner does not safely combine narrow low-band cleanup with compensating low-shelf boosts in one pass.
- The planner refuses stereo narrowing plus recentering when the source is not already wide enough for both moves conservatively.
- Stereo-width changes only proceed for two-channel material that is not already too wide, too narrow, or stereo-ambiguous for a conservative move.
- Stereo-balance correction only proceeds for two-channel material when measured balance is clearly off-center but not so extreme that a one-shot conservative correction would be unsafe.
- Tonal moves are intentionally small: `1.5 dB`, `2 dB`, or `3 dB` style shelves and tilts, with notch cuts kept surgical and narrow.
- `preserve punch` keeps compressor settings conservative by using a slower attack and tighter safety constraints.
