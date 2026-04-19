# Benchmarks Overview

## Purpose

Evaluate module quality and end-to-end reliability for LLM-driven audio manipulation.

This module is the evaluation layer over the rest of the architecture.

The current implementation provides a first fixture-backed benchmark harness for compare-driven evaluation of the current supported cleanup prompt family.

The benchmark runtime is implemented under `modules/benchmarks/src` and is currently focused on a compare-driven corpus anchored to committed WAV fixtures under `fixtures/audio/phase-1/`.

## Public API surface

- define benchmark datasets and prompt suites
- run repeatable benchmark jobs
- score and summarize benchmark results

The current implementation includes a compare-focused cleanup suite for:

- `darker`
- `less harsh`
- `clean this sample up a bit`
- `reduce brightness without losing punch`
- ambiguous cleanup wording such as `clean it`

The benchmark cases now carry explicit fixture ids for the shared source loop and each candidate audio variant used by the cleanup corpus.

## Current source files

- `src/prompt-suite.ts`: fixture-backed corpus metadata, prompt collections, and curated compare inputs
- `src/run-benchmarks.ts`: benchmark execution entrypoint
- `src/scoring.ts`: metric aggregation and score policies
- `src/reporting.ts`: human-readable and machine-readable reports
- `src/types.ts`: explicit benchmark case and report shapes
- `src/index.ts`: public exports only

## Dependencies

- depends on the runtime modules being evaluated
- currently consumes `compareVersions()` and `ComparisonReport` from `modules/compare`
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

- benchmark scoring is still centered on curated `compareVersions()` inputs for the currently supported cleanup slice
- the committed WAV fixtures anchor corpus provenance and repeatability, but the harness does not yet run full analysis over those files
- fixture-backed end-to-end benchmark execution remains a later step

## Current scoring model

Each benchmark case declares explicit expected outcomes:

- exact `goal_alignment` statuses per goal string when applicable
- required semantic labels that must appear
- forbidden semantic labels that must stay absent
- required regression kinds that must appear
- forbidden regression kinds that must stay absent

Scores are simple check-pass ratios so regressions are measurable and easy to inspect in CI output.
