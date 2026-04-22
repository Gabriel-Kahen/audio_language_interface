# Benchmarks API

## Scope

This document describes the implemented public API in `modules/benchmarks/src/index.ts`.

Use it when you need to load the committed fixture corpus, run the current benchmark modes, or score/report benchmark results programmatically.

## Fixture helpers

### `loadAudioFixtureManifest(manifestPath?, repoRoot?)`

Loads and parses the committed audio fixture manifest.

Current behavior:

- defaults to `fixtures/audio/manifest.json`
- resolves the manifest relative to `BENCHMARK_REPO_ROOT`
- requires the parsed payload to expose `fixtures[]`
- throws when the manifest is missing or malformed

### `resolveAudioFixture(manifest, fixtureId)`

Returns one fixture entry by `fixture_id`.

It throws when the requested fixture id is unknown.

### `resolveAudioFixtureSourcePath(fixture, repoRoot?)`

Resolves the absolute source path for one manifest entry under `fixtures/audio/`.

### `materializeAudioFixture(fixture, workspaceRoot, repoRoot?)`

Copies one committed fixture into a benchmark workspace.

Returns:

- `sourceFixturePath`
- `inputPath`

This keeps benchmark runs workspace-local instead of mutating the committed fixture tree.

## Built-in corpora and prompt suites

The module exports the current committed benchmark constants and corpora:

- `FIRST_PROMPT_FAMILY_CORPUS_ID`
- `FIRST_PROMPT_FAMILY_REQUEST_CYCLE_CORPUS_ID`
- `INTERPRETATION_CORPUS_ID`
- `FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH`
- `FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID`
- `firstPromptFamilyFixtureCorpus`
- `firstPromptFamilyPromptSuite`
- `firstPromptFamilyRequestCycleCorpus`
- `firstPromptFamilyRequestCycleSuite`
- `interpretationBenchmarkCorpus`
- `interpretationBenchmarkSuite`

These objects are the default benchmark inputs used when a caller does not supply a custom corpus.

## Compare benchmark execution

### `runComparisonBenchmarkCase(benchmarkCase)`

Runs one compare-only benchmark case by calling `compareVersions(benchmarkCase.compareOptions)` and then scoring the resulting `ComparisonReport`.

### `runComparisonBenchmarks(benchmarkInput?)`

Runs a compare-only corpus or ad hoc array of cases.

Current behavior:

- defaults to `firstPromptFamilyFixtureCorpus`
- accepts either a full `ComparisonBenchmarkCorpus` or a raw case array
- aggregates passed checks, total checks, and `overallScore`
- uses the corpus metadata when present, otherwise falls back to the first-prompt-family defaults

## Interpretation benchmark execution

### `runInterpretationBenchmarkCase(benchmarkCase)`

Scores one explicit `IntentInterpretation` benchmark case against its declared expectations.

### `runInterpretationBenchmarks(benchmarkInput?)`

Runs an interpretation corpus or ad hoc array of interpretation cases.

Current behavior:

- defaults to `interpretationBenchmarkCorpus`
- accepts either a full `InterpretationBenchmarkCorpus` or a raw case array
- scores stable artifact fields such as `interpretation_policy`, `request_classification`, `next_action`, normalized objectives, descriptor hypotheses, constraints, region scopes, clarification presence, follow-up kind, and candidate count
- aggregates passed checks, total checks, and `overallScore`

## Request-cycle benchmark execution

### `runRequestCycleBenchmarkCase(benchmarkCase, options?)`

Runs one end-to-end request-cycle benchmark case.

Current behavior:

- creates a temporary benchmark workspace when `options.workspaceRoot` is not supplied
- resolves and materializes the requested fixture into that workspace
- supports `executionSurface = "orchestration"` or `executionSurface = "tool"`
- can run an optional `setup_sequence` before the main prompt
- stores materialized `AudioVersion` artifacts so follow-up and alternate-version cases remain explicit
- returns either a successful `requestCycleResult` or a structured serialized error payload
- deletes the temporary workspace unless `preserveWorkspace` is true

### `runRequestCycleBenchmarks(benchmarkInput?, options?)`

Runs a request-cycle corpus or ad hoc array of request-cycle cases.

Current behavior:

- defaults to `firstPromptFamilyRequestCycleCorpus`
- loads the fixture manifest automatically unless one is supplied in `options`
- runs cases sequentially
- aggregates total duration, success/failure counts, passed checks, total checks, and `overallScore`

## Scoring helpers

### `scoreComparisonReport(report, expectation)`

Scores one `ComparisonReport` against explicit goal, semantic-label, and regression expectations.

### `scoreComparisonBenchmarkCase(benchmarkCase, report)`

Wraps `scoreComparisonReport(...)` and returns the case-level score object.

### `scoreIntentInterpretation(interpretation, expectation)`

Scores one `IntentInterpretation` against explicit interpretation expectations.

### `scoreInterpretationBenchmarkCase(benchmarkCase)`

Wraps `scoreIntentInterpretation(...)` and returns the case-level score object.

### `scoreRequestCycleBenchmarkCase(benchmarkCase, result, error?, setupResults?)`

Scores one request-cycle case across three separate responsibility buckets:

- planner correctness
- outcome verification
- regression avoidance

This helper returns:

- flat passed-check and total-check counts
- overall case score
- category score breakdown
- failure buckets grouped for report readability

## Reporting

### `formatBenchmarkMarkdownReport(result)`

Formats any current benchmark mode as Markdown.

Current behavior:

- auto-detects compare-only, interpretation, and request-cycle result shapes
- prints overall score, per-case summaries, and failure buckets
- includes category-specific summaries for request-cycle runs

## Public types

`src/index.ts` re-exports the benchmark manifest, case, expectation, score, failure, and result types used by the current harness.

Those types are implementation-facing shapes for the benchmark layer. They are not shared production contracts under `contracts/schemas/`.

## Current limitations

- compare-only benchmarks are still centered on curated `ComparisonReport` inputs rather than arbitrary corpus generation
- interpretation benchmarks are currently offline artifact checks rather than live-provider evaluations
- request-cycle benchmarks currently run sequentially
- request-cycle outcome scoring is only as strong as the current compare/orchestration evidence
- the built-in corpora are intentionally small and focused on the repo’s current supported slice
