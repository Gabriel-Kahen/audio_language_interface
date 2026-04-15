# Orchestration API

## Purpose

`modules/orchestration` composes the implemented runtime modules into explicit workflows.

The current v1 surface stays thin by:

- using the existing `io`, `analysis`, `transforms`, `render`, `compare`, and `history` entrypoints directly
- composing the published `planning` and `semantics` entrypoints directly
- returning concrete artifacts and workflow traces instead of hiding state

## Public exports

- `runRequestCycle(options)`
- `importAndAnalyze(options)`
- `planAndApply(options)`
- `renderAndCompare(options)`
- `iterativeRefine(options)`
- `OrchestrationStageError`
- `defaultOrchestrationDependencies`

## Dependency injection

`defaultOrchestrationDependencies` wires the currently implemented modules:

- `importAudioFromFile`
- `analyzeAudioVersion`
- `buildSemanticProfile`
- `planEdits`
- `applyEditPlan`
- `renderPreview`
- `renderExport`
- `compareVersions`
- `compareRenders`
- `createSessionGraph`
- `recordAudioAsset`
- `recordAudioVersion`
- `recordAnalysisReport`
- `recordSemanticProfile`
- `recordEditPlan`
- `recordTransformRecord`
- `recordRenderArtifact`
- `recordComparisonReport`

Callers may still override any dependency for testing or alternate runtimes, but the default orchestration surface now tracks the implemented module APIs.

## Main workflow

`runRequestCycle(options)` supports two inputs:

- `input.kind = "import"`: import a source file, analyze it, plan edits, apply them, analyze the result, render baseline and candidate outputs, compare them, and record the session graph
- `input.kind = "existing"`: start from an existing `AudioAsset` and `AudioVersion`, then run the same downstream stages

The returned result includes:

- input and output versions
- input and output analyses
- optional semantic profile
- edit plan and transform result
- baseline and candidate render artifacts
- comparison report
- updated `SessionGraph`
- stage-level workflow trace entries

## Failure behavior

Each public flow uses stage-aware error wrapping.

- Failures throw `OrchestrationStageError`
- `error.stage` identifies the failed boundary
- `error.partialResult` contains the latest safe partial artifacts when available
- `runRequestCycle` attempts to persist any already-established history into `error.partialResult.sessionGraph`, including imported inputs, completed analysis, completed planning artifacts, and any renders produced before the failure
- `FailurePolicy` can increase per-stage attempts and add retry decisions

The default behavior is one attempt with no retries.

## Smaller helpers

`importAndAnalyze(options)`

- imports one file
- analyzes the imported version

`planAndApply(options)`

- optionally derives a semantic profile
- builds an edit plan through `modules/planning`
- applies that plan through `modules/transforms`

`renderAndCompare(options)`

- renders baseline and candidate versions as preview or final artifacts
- passes the corresponding render module options through via `baselineRenderOptions` and `candidateRenderOptions`
- compares those renders with paired analysis reports

`iterativeRefine(options)`

- repeats plan, apply, analyze, and compare
- forwards `analysisOptions` on each analysis pass
- stops when `maxIterations` is reached or `shouldContinue` returns false
