# Benchmarks Overview

## Purpose

Evaluate module quality and end-to-end reliability for LLM-driven audio manipulation.

The current implementation provides a first benchmark harness for compare-driven evaluation of the initial prompt family. It is not yet backed by committed real audio fixtures.

This area is still documentation-first. The repository does not currently include a benchmark runtime implementation under `modules/benchmarks/src`.

## Public API surface

- define benchmark datasets and prompt suites
- run repeatable benchmark jobs
- score and summarize benchmark results

The initial implementation now includes a compare-focused first-slice suite for:

- `darker`
- `less harsh`
- `clean this sample up a bit`
- `reduce brightness without losing punch`
- ambiguous cleanup wording such as `clean it`

## Current source files

- `src/prompt-suite.ts`: prompt collections and expected outcomes
- `src/run-benchmarks.ts`: benchmark execution entrypoint
- `src/scoring.ts`: metric aggregation and score policies
- `src/reporting.ts`: human-readable and machine-readable reports
- `src/types.ts`: explicit benchmark case and report shapes
- `src/index.ts`: public exports only

## Dependencies

- depends on the runtime modules being evaluated
- currently consumes `compareVersions()` and `ComparisonReport` from `modules/compare`

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

- benchmark cases are still synthetic-first
- fixture-backed end-to-end benchmark runs are a later step
- current scoring is centered on compare outputs for the first supported prompt family

## Current scoring model

Each benchmark case declares explicit expected outcomes:

- exact `goal_alignment` statuses per goal string when applicable
- required semantic labels that must appear
- forbidden semantic labels that must stay absent
- required regression kinds that must appear
- forbidden regression kinds that must stay absent

Scores are simple check-pass ratios so regressions are measurable and easy to inspect in CI output.

## Current limitations

- No benchmark harness has been implemented yet.
- No shared prompt suite or scoring runtime exists in code yet.
- Contributors should treat this module's docs as planning guidance, not as an implemented package surface.
