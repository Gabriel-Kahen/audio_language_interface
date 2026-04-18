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
- `control peaks`, `catch peaks`, `limiter` -> conservative `limiter` settings with explicit `ceiling_dbtp`, `release_ms`, `lookahead_ms`, and no added limiter input gain by default
- `louder and more even`, `normalize`, `more even level` -> `normalize` with integrated-loudness targeting and a `-1 dBTP` ceiling
- `remove noise`, `reduce hiss`, `denoise` -> conservative `denoise` only when analysis indicates sustained noise
- `tame sibilance`, `de-ess` -> conservative `de_esser`
- `remove clicks`, `declick`, `remove pops` -> conservative `declick`
- `remove hum`, `reduce buzz`, `dehum` -> conservative `dehum`, defaulting to `60 Hz` when the request does not specify `50 Hz` or `60 Hz`
- `wider`, `widen`, `more width`, `narrower` -> conservative `stereo_width` only for already-stereo material with safe balance and correlation
- `louder` -> conservative `gain` step limited by measured true-peak headroom to a `-1 dBTP` ceiling
- `quieter` -> conservative negative `gain` step
- `trim from Xs to Ys` -> `trim` time-range step with explicit start and end seconds
- `fade in Xs`, `fade out Xs` -> `fade` step with explicit durations

## Safety posture

- The baseline planner only emits operations currently implemented by `modules/transforms`.
- Time-based requests are checked against the current `AudioVersion` duration before a plan is emitted.
- Combined `fade in` and `fade out` coverage must not overlap and must stay at or below `50%` of the available duration.
- If a request cannot be mapped to an explicit supported operation, planning fails instead of guessing.
- Requests for declip, dereverb, and broader restoration categories outside denoise, de-ess, declick, and dehum still fail explicitly.
- Denoise only proceeds when steady-noise evidence is present; otherwise the planner rejects the request instead of guessing.
- Stereo-width changes only proceed for two-channel material that is not already too wide, too narrow, or stereo-ambiguous for a conservative move.
- Tonal moves are intentionally small: `1.5 dB`, `2 dB`, or `3 dB` style shelves and tilts, with notch cuts kept surgical and narrow.
- `preserve punch` keeps compressor settings conservative by using a slower attack and tighter safety constraints.
