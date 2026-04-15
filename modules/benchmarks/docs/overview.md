# Benchmarks Overview

## Purpose

Evaluate module quality and end-to-end reliability for LLM-driven audio manipulation.

## Public API surface

- define benchmark datasets and prompt suites
- run repeatable benchmark jobs
- score and summarize benchmark results

## Suggested initial source files

- `src/datasets.ts`: dataset definitions and metadata
- `src/prompt-suite.ts`: prompt collections and expected outcomes
- `src/run-benchmarks.ts`: benchmark execution entrypoint
- `src/scoring.ts`: metric aggregation and score policies
- `src/reporting.ts`: human-readable and machine-readable reports
- `src/index.ts`: public exports only

## Dependencies

- depends on whichever runtime modules are being evaluated
- consumes `ComparisonReport` and other published artifacts when available

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
