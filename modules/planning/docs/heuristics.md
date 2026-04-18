# Planning Heuristics

## Purpose

Document the initial deterministic request-to-plan mappings used by `modules/planning`.

## Current phrase mappings

- `darker`, `less bright` -> broad high-band `parametric_eq` cut around `6500 Hz`
- `less harsh`, `smoother` -> bell-cut `parametric_eq` band centered on the analysis harshness annotation, or `3750 Hz` fallback
- `cleaner`, `clean up a bit` -> conservative tonal cleanup only when analysis or semantics show harshness or muddiness; otherwise reject as underspecified
- `brighter`, `more presence` -> broad high-band `parametric_eq` boost around `5000 Hz`
- `less muddy` -> bell-cut `parametric_eq` band around `280 Hz`
- `warmer`, `more warmth` -> bell-boost `parametric_eq` band around `180 Hz`
- `rumble`, `subsonic` -> `high_pass_filter` at `40 Hz`
- `more controlled`, `compression`, `tighter and more controlled` -> conservative `compressor` settings with explicit threshold, ratio, attack, and release
- `control peaks`, `catch peaks`, `limiter` -> conservative `limiter` settings with explicit `ceiling_dbtp`, `release_ms`, `lookahead_ms`, and no added limiter input gain by default
- `remove noise`, `reduce hiss`, `denoise`, `remove hum` -> conservative `denoise` only when analysis indicates sustained noise
- `wider`, `widen`, `more width`, `narrower` -> conservative `stereo_width` only for already-stereo material with safe balance and correlation
- `louder` -> conservative `gain` step limited by measured true-peak headroom to a `-1 dBTP` ceiling
- `quieter` -> conservative negative `gain` step
- `trim from Xs to Ys` -> `trim` time-range step with explicit start and end seconds
- `fade in Xs`, `fade out Xs` -> `fade` step with explicit durations

## Safety posture

- The baseline planner only emits operations currently implemented by `modules/transforms`.
- Requests that are vague, contradictory, or blocked by missing evidence are classified as `supported_but_underspecified`.
- Time-based requests are checked against the current `AudioVersion` duration before a plan is emitted.
- Combined `fade in` and `fade out` coverage must not overlap and must stay at or below `50%` of the available duration.
- If a request cannot be mapped to an explicit supported operation, planning fails instead of guessing.
- Requests for runtime-available but non-planner-enabled operations such as `reverb`, `delay`, `echo`, `bitcrush`, `distortion`, `saturation`, `flanger`, `phaser`, `pitch_shift`, `time_stretch`, or `reverse` are classified as `supported_runtime_only_but_not_planner_enabled`.
- Requests for declick, declip, dereverb, and other restoration categories outside steady-noise reduction still fail explicitly.
- Denoise only proceeds when steady-noise evidence is present; otherwise the planner rejects the request instead of guessing.
- Stereo-width changes only proceed for two-channel material that is not already too wide, too narrow, or stereo-ambiguous for a conservative move.
- EQ moves are intentionally small: `1.5 dB`, `2 dB`, or `3 dB` depending on request intensity.
- `preserve punch` keeps compressor settings conservative by using a slower attack and tighter safety constraints.
