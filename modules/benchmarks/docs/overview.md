# Benchmarks Overview

## Purpose

Evaluate module quality and end-to-end reliability for LLM-driven audio manipulation.

This module is the evaluation layer over the rest of the architecture.

The current implementation provides four benchmark modes for the current supported cleanup, timing, control, iterative follow-up, and interpretation prompt family:

- compare-only evaluation over curated `ComparisonReport` inputs
- interpretation-only evaluation over curated `IntentInterpretation` artifacts
- live-provider interpretation evaluation over real `interpretRequest(...)` calls
- end-to-end request-cycle evaluation over the real orchestration pipeline

The benchmark runtime is implemented under `modules/benchmarks/src` and is anchored to committed WAV fixtures under `fixtures/audio/phase-1/`.

## Public API surface

- define benchmark datasets and prompt suites
- run repeatable benchmark jobs
- score and summarize benchmark results

The benchmark scoring/reporting layer now supports four evaluation shapes:

- compare-only benchmark cases, which score direct `ComparisonReport` expectations
- interpretation benchmark cases, which score explicit `IntentInterpretation` expectations
- live interpretation benchmark cases, which execute provider-backed interpretation calls and then score the returned `IntentInterpretation`
- request-cycle benchmark cases, which score a completed orchestration cycle by separating:
  - planner correctness
  - outcome verification
  - regression avoidance

See `docs/api.md` for the exported benchmark runners, fixture helpers, scoring helpers, and report-formatting behavior.

The request-cycle benchmark runner can now exercise either:

- the orchestration module surface directly
- the published `run_request_cycle` tool surface

That keeps follow-up editing coverage honest at both the workflow-composition layer and the external adapter boundary.

The current implementation includes a compare-focused cleanup suite for:

- `darker`
- `less harsh`
- `clean this sample up a bit`
- `reduce brightness without losing punch`
- `reduce hum` with both direct-evidence and fallback compare cases
- `reduce clicks` with both direct-evidence and fallback compare cases
- ambiguous cleanup wording such as `clean it`

The benchmark cases now carry explicit fixture ids for the shared source loop and each candidate audio variant used by the cleanup corpus.

The interpretation benchmark corpus currently covers:

- supported normalization with preservation constraints
- grounded texture normalization such as `make it more relaxed`
- ambiguous cleanup under both conservative and best-effort policy
- contradictory tonal wording under both conservative and best-effort policy
- region-intent proposals
- session-aware follow-up intensity reduction
- alternate-version follow-up interpretation
- evidence-gated normalization of `less distorted` wording into `declip` when direct clipping evidence exists
- runtime-only refusal behavior

The live interpretation benchmark corpus covers the same prompt families, but stores executable `AudioVersion`, `AnalysisReport`, `SemanticProfile`, and optional session-context inputs instead of prebuilt interpretation artifacts so provider behavior can be measured directly. Its expectations are intentionally coarser than the offline interpretation corpus: it favors stable structured fields such as policy, request classification, next action, constraints, region scope, and follow-up kind over exact alternate counts or exact grounding-note strings.

## Current source files

- `src/prompt-suite.ts`: fixture-backed corpus metadata, prompt collections, and curated compare inputs
- `src/run-benchmarks.ts`: compare-only and interpretation benchmark execution entrypoint
- `src/run-live-interpretation-benchmarks.ts`: opt-in live provider evaluation for the interpretation layer
- `src/run-request-cycle-benchmarks.ts`: end-to-end request-cycle benchmark execution entrypoint
- `src/fixture-loader.ts`: fixture manifest loading and workspace materialization helpers
- `src/scoring.ts`: metric aggregation and score policies
- `src/reporting.ts`: human-readable and machine-readable reports
- `src/types.ts`: explicit benchmark case and report shapes
- `src/index.ts`: public exports only

## Dependencies

- depends on the runtime modules being evaluated
- currently consumes `compareVersions()` and `ComparisonReport` from `modules/compare`
- consumes `runRequestCycle()` from `modules/orchestration` for end-to-end benchmark execution
- consumes `executeToolRequest()` from `modules/tools` when request-cycle benchmarks target the published tool surface
- consumes `fixtures/audio/manifest.json` as the benchmark corpus source of truth for committed fixture ids and provenance

## Downstream consumers

- maintainers
- CI pipelines
- contributors validating regressions or improvements

## Non-goals

- runtime product logic
- test-only hacks inside production modules
- replacing integration tests

## Test expectations

- verify benchmark definitions are reproducible
- verify scoring behavior is stable
- verify datasets and prompt metadata remain well documented
- verify benchmark reports are easy to diff over time

## Current limitations

- compare-only benchmark scoring is still centered on curated `compareVersions()` inputs for the currently supported cleanup and restoration slice
- interpretation benchmarks are intentionally offline artifact checks; they benchmark the shape and stability of `IntentInterpretation`, not live provider/network quality
- live interpretation benchmarks are intentionally opt-in and not part of default CI because they require real provider keys, incur network latency and API cost, and are expected to surface provider drift over time
- the request-cycle benchmark corpus is intentionally small and currently focuses on stable tonal cleanup, cross-family compounds that stay honest on the committed fixtures, restoration, timing edits, stereo/spatial edits, the first explicit numeric region-targeting slice, iterative follow-up flows, peak control, and explicit clarification/failure controls, including a real clarify -> answer -> resume path
- some cross-family request-cycle cases intentionally encode mixed or unmet outcome expectations when that is what the current compare/orchestration path actually produces on the committed fixtures
- tool-surface request-cycle benchmarks still keep session state explicit by materializing `SessionGraph` and `available_versions` inside the benchmark harness rather than relying on hidden adapter persistence
- request-cycle outcome scoring is only as strong as the current compare/orchestration evidence:
  - planner correctness is inferred from the emitted `EditPlan`
  - outcome verification is inferred from version/render comparison reports and their structured-verification or goal-alignment outputs
  - regression avoidance is inferred from compare-layer regression warnings, not from listening tests
- the request-cycle harness currently benchmarks a narrow, honest prompt family rather than the full runtime capability surface

## Current scoring model

Each benchmark case declares explicit expected outcomes:

- exact `goal_alignment` statuses per goal string when applicable
- required semantic labels that must appear
- forbidden semantic labels that must stay absent
- required regression kinds that must appear
- forbidden regression kinds that must stay absent

Compare-only scores remain simple check-pass ratios so regressions are measurable and easy to inspect in CI output.

Interpretation-only scores also remain simple check-pass ratios. They intentionally score stable artifact fields such as:

- `interpretation_policy`
- `request_classification`
- `next_action`
- normalized objectives
- descriptor hypothesis labels and statuses
- constraint extraction
- region-intent scope classification
- follow-up intent kind
- clarification-question presence
- candidate-interpretation count

Request-cycle scores are intentionally split by responsibility boundary:

- planner correctness checks whether the cycle emitted the expected result kind, operations, ordering, goals, explicit `time_range` targets when applicable, or revision decision
- outcome verification checks whether the completed version/render comparisons show the expected goal statuses, verification-target statuses, semantic deltas, and structured-verification presence when required
- regression avoidance checks whether forbidden regression kinds stayed absent and whether severe regressions were avoided

The request-cycle overall score is the equal-weighted average of the non-empty category scores rather than one flat check bucket. That keeps planner mistakes, verification failures, and regression failures visible as separate failure modes.

Request-cycle reports also aggregate failed checks into category-specific failure buckets so maintainers can see quickly whether a run is failing because the planner chose the wrong operation, the compare layer could not verify the intended outcome, or regressions were introduced during execution.

For clipping, hum, and click cleanup cases, outcome verification should anchor on direct `AnalysisReport.artifacts` evidence first: `clipped_frame_count` / `clipping_severity` for declip-style checks, `hum_detected` / `hum_level_dbfs` for dehum-style checks, and `click_detected` / `click_count` for declick-style checks. Low-band, noise-floor, and clipped-sample checks remain fallback coverage for analyses that do not expose those direct artifact fields.

## Current request-cycle corpus

The first public request-cycle corpus currently covers:

- `make this loop darker and less harsh`
- `make this more relaxed`
- `make this warmer and airier`
- `make this darker, less harsh, and less muddy`
- `reduce brightness without losing punch`
- `make this less muddy`
- `tame the sibilance`
- `speed up by 10% and tame the sibilance`
- `tame the sibilance and make it darker`
- `remove 60 Hz hum`
- `clean up clicks`
- `trim the silence at the beginning and end`
- `speed up by 10%`
- `pitch up by 2 semitones`
- `make this wider`
- `narrow it a bit`
- `center this more`
- `fix the stereo imbalance`
- `center this more and make it wider`
- `make the first 0.5 seconds darker and less harsh`
- iterative follow-up requests such as `more`, `less`, `undo`, `revert to previous version`, and `try another version`
- `control the peaks without crushing it`
- `make it louder and more controlled`
- `make this a little tighter and more controlled, and darker`
- explicit clarification/failure controls such as `clean it`, `clean this sample up a bit`, `make it brighter and darker`, `make it faster and slower`, `make it wider and narrower`, and vague region wording such as `make the intro darker`

Those cases were chosen because they are stable against the committed phase-1 fixtures and expose the main Layer 2 responsibilities without overclaiming broader planner coverage. The compound tonal cases deliberately stay on the shared first-slice fixture so ordering checks can exercise multi-step planner behavior without adding a larger synthetic corpus. The newer cross-family compounds stay attached to the fixtures that already justify one side of the request: the sibilance source anchors restoration-plus-timing and restoration-plus-tonal prompts, the shared first-slice fixture anchors the current control-plus-tonal prompt and the first numeric region-targeted tonal case, and the stereo imbalance source anchors stereo-balance-plus-width coverage. When a mixed request is not honestly supported by the current planner surface, the corpus prefers an explicit refusal benchmark over an optimistic happy path. For the current region-targeting slice, the strongest benchmark signal is still planner correctness: the suite asserts the emitted `time_range` targets directly and keeps outcome expectations conservative until compare grows deeper local-window verification.
