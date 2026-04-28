# Planning Overview

## Purpose

Convert user intent and current audio state into an explicit `EditPlan`.

This module is the core of the intent layer.

The initial implementation is a deterministic baseline planner. It uses conservative keyword parsing plus analysis, semantic evidence, and the published runtime capability manifest to emit small, explicit plans that stay within the currently supported planning operation set.

## Public API surface

- `parseUserRequest(userRequest) => ParsedEditObjectives`
- `planEdits({ userRequest, audioVersion, analysisReport, semanticProfile, ... }) => EditPlan`
- `assertValidEditPlan(plan)` and `isValidEditPlan(plan)` for contract checks

See `docs/api.md` for the current failure surface, planner entrypoint behavior, and exported helper types.

## Suggested initial source files

- `src/parse-request.ts`: request normalization into planner-friendly intent
- `src/plan-edits.ts`: top-level planning entrypoint
- `src/step-builders.ts`: operation-specific step creation
- `src/safety.ts`: safety limits and policy helpers
- `src/verification-targets.ts`: compare-facing structured verification targets
- `src/index.ts`: public exports only

## Dependencies

- `modules/core`
- `modules/analysis`
- `modules/semantics`
- `modules/capabilities`
- `EditPlan` contract

## Downstream consumers

- `transforms`
- `compare`
- `history`
- `tools`
- `orchestration`

## Non-goals

- direct DSP execution
- file import or render logic
- hidden orchestration state
- open-ended planning for unsupported transform categories

## Baseline behavior

- only emits operations currently marked `planner_supported` in the runtime capability manifest: trim, `trim_silence`, fade, gain, normalize, `pitch_shift`, `time_stretch`, filtering, `parametric_eq`, surgical shelf/notch/tilt EQ, conservative compression, peak limiting, conservative restoration, and a narrow stereo/spatial slice built around `stereo_width` and `stereo_balance_correction`
- prefers small explicit steps with published parameter shapes over hidden macro behavior
- validates inbound `AudioVersion`, `AnalysisReport`, and `SemanticProfile` contracts before planning
- records the `RuntimeCapabilityManifest` identifier used to ground the plan
- uses the current `AudioVersion` duration to reject trim and fade requests that exceed the available file
- rejects combined fade requests that would overlap or cover more than half of the available file duration
- uses analysis annotations and semantic descriptors to refine frequencies and emit structured verification targets
- maps generic `cleaner` requests only when current evidence supports a conservative tonal cleanup target or the request also contains an explicit supported cleanup direction
- maps texture wording such as `more relaxed` or `less aggressive` onto conservative tonal-softening only when harshness, aggressive, or brightness evidence grounds that reading inside the current supported planner slice
- does not auto-promote generic cleanup wording into hum or click restoration; those restoration steps still require explicit supported intent
- maps conservative `more controlled` language to `compressor`, maps explicit louder-and-controlled language to measured compressor-plus-loudness staging when dynamics still have room to tighten safely, keeps explicit normalize-louder-controlled wording on a peak-protected normalize path for already-controlled sources, maps explicit peak-control language to `limiter`, and refuses pure control wording on sources that already measure as tightly controlled
- maps explicit boundary-silence requests to `trim_silence`, explicit speed-up or slow-down requests to conservative `time_stretch`, and conservative pitch requests such as explicit semitone counts, `pitch it up a bit`, or octave wording to `pitch_shift` only when the source reads as pitched
- supports compatible cross-family compounds across timing, restoration, tonal, loudness/control, and stereo families through the fixed phase order instead of phrase order in the prompt
- supports stereo recentering together with width changes when the current image is safe for both moves, and refuses that compound when the source is too narrow to recenter and narrow conservatively in one pass
- refuses compound prompts that combine upper-band brightening with de-essing, broadband denoise with upper-band brightening, or hum removal with added warmth because the current baseline planner cannot sequence those safely in one pass
- supports explicit loudness-normalization, upper-air, warmth, low-mid cleanup, high-pass rumble cleanup, harsh-ring, sibilance, clipping repair, click-cleanup, and hum-removal requests with conservative defaults grounded in the published manifest and matching current-source evidence; sibilance evidence can come from explicit sibilance semantics or localized upper-presence harshness annotations in the de-essing band
- maps `less distorted` to `declip` only when direct clipping evidence exists, drops unsupported declip from compounds when another safe tonal objective remains, and still refuses isolated clipping/distortion repair without direct clipping evidence
- supports explicit denoise requests only when analysis indicates steady noise
- prefers annotation-backed or semantic-backed restoration verification when that evidence exists, and now routes clipping/hum/click verification through direct artifact measurements before falling back to coarse proxies
- supports explicit stereo-width and centering requests, including `center the stereo image`, only for already-stereo material when the current image is safe to adjust conservatively
- now grounds explicit `time_range` region wording such as `the first 0.5 seconds`, `the first half second`, `the first half a second`, `the last 0.5 seconds`, `the last half second`, `the last half a second`, or `from 0.2s to 0.7s` for a narrow first cohort of planner operations: tonal EQ moves, conservative restoration, gain/normalize staging, and the current stereo-image cleanup steps; regional `softer` wording maps to local gain reduction
- mirrors explicit `time_range` targets onto planner-owned analysis verification targets so compare can report the result as region-local `unknown` until local-window analysis exists instead of scoring the request against whole-file deltas
- still refuses vague named regions such as `intro`, `outro`, or `ending word`, and still refuses region-scoped requests that would require full-file-only operations such as `time_stretch`, `trim_silence`, or the current dynamics-control path
- fails instead of guessing when the request cannot be mapped to an explicit supported operation
- classifies planner refusals explicitly as `supported_but_underspecified`, `unsupported`, or `supported_runtime_only_but_not_planner_enabled` so adapters can ask for clarification without pretending the runtime or planner can do more than they actually can

See `modules/planning/docs/heuristics.md` for the current phrase-to-operation mappings.

## Test expectations

- verify request-to-plan behavior for representative prompts
- verify step ordering and safety limits
- verify no plan relies on hidden defaults
- verify contract alignment for `EditPlan`
