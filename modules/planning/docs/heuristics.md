# Planning Heuristics

## Purpose

Document the initial deterministic request-to-plan mappings used by `modules/planning`.

## Current phrase mappings

- `darker`, `less bright` -> broad high-band `parametric_eq` cut around `6500 Hz`
- `less harsh`, `smoother` -> bell-cut `parametric_eq` band centered on the analysis harshness annotation, or `3750 Hz` fallback
- `brighter`, `more presence` -> broad high-band `parametric_eq` boost around `5000 Hz`
- `less muddy` -> bell-cut `parametric_eq` band around `280 Hz`
- `warmer`, `more warmth` -> bell-boost `parametric_eq` band around `180 Hz`
- `rumble`, `subsonic` -> `high_pass_filter` at `40 Hz`
- `louder` -> conservative `gain` step limited by measured true-peak headroom to a `-1 dBTP` ceiling
- `quieter` -> conservative negative `gain` step
- `trim from Xs to Ys` -> `trim` time-range step with explicit start and end seconds
- `fade in Xs`, `fade out Xs` -> `fade` step with explicit durations

## Safety posture

- The baseline planner only emits operations currently implemented by `modules/transforms`.
- Time-based requests are checked against the current `AudioVersion` duration before a plan is emitted.
- Combined `fade in` and `fade out` coverage must not overlap and must stay at or below `50%` of the available duration.
- If a request cannot be mapped to an explicit supported operation, planning fails instead of guessing.
- EQ moves are intentionally small: `1.5 dB`, `2 dB`, or `3 dB` depending on request intensity.
- `preserve punch` currently adds constraints and verification targets rather than dynamics processing, because compressor and limiter planning are not yet supported by the transform implementation.
