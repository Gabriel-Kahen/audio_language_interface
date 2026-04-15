# Compare API

## Entry points

### `compareVersions(options)`

Produces a `ComparisonReport` from:

- `baselineVersion`
- `candidateVersion`
- `baselineAnalysis`
- `candidateAnalysis`
- optional `editPlan`
- optional `comparisonId`
- optional `generatedAt`

Behavior:

- requires distinct baseline and candidate version ids
- requires the baseline and candidate versions to share the same `asset_id`
- requires each paired `AnalysisReport` to match its `AudioVersion` by `asset_id` and `version_id`
- requires an optional `editPlan` to match the baseline version by `asset_id` and `version_id`
- requires paired analysis reports
- computes analysis-backed metric deltas
- derives semantic deltas and analysis regressions
- optionally evaluates `editPlan.goals`
- schema-validates the final report before returning it

Use this when the comparison target is an `AudioVersion` and analysis reports already exist.

### `compareRenders(options)`

Produces a `ComparisonReport` from:

- `baselineRender`
- `candidateRender`
- optional `baselineAnalysis`
- optional `candidateAnalysis`
- optional `editPlan`
- optional `comparisonId`
- optional `generatedAt`

Behavior:

- requires distinct baseline and candidate render ids
- requires the baseline and candidate renders to share the same `asset_id`
- rejects one-sided analysis input; analysis-backed render comparison requires both paired analysis reports
- requires each paired `AnalysisReport` to match its `RenderArtifact` by `asset_id` and `version_id`
- requires an optional `editPlan` to match the baseline render by `asset_id` and `version_id`
- always computes render-level deltas and render regressions
- upgrades to analysis-backed comparison only when both analysis reports are present
- only evaluates goals when an `editPlan` and both analysis reports are present
- schema-validates the final report before returning it

Use this when the comparison target is a rendered preview/export and only render metadata may be available.

## Lower-level helpers

### `computeAnalysisMetricDeltas(baseline, candidate)`

Returns ordered metric deltas for the analysis measurements currently supported by the module.

### `computeRenderMetricDeltas(baseline, candidate)`

Returns ordered metric deltas for render output metadata and optional loudness summary fields.

### `deriveSemanticDeltas(baseline, candidate, metricDeltas)`

Maps specific measurement patterns into a fixed semantic vocabulary. Returns an empty array when no rule threshold is crossed.

### `detectAnalysisRegressions(baseline, candidate, metricDeltas)`

Detects a small set of analysis-side failure modes:

- clipping introduced by the candidate
- excessive integrated loudness shift
- reduced true-peak headroom
- stereo collapse
- measurable punch loss
- over-compression from combined crest-factor and dynamic-range reduction
- worsened peak control from higher peaks or lower sample headroom

### `detectRenderRegressions(baseline, candidate, metricDeltas)`

Detects render metadata mismatches:

- duration changes
- channel-count changes
- sample-rate changes

### `evaluateGoalAlignment(goals, baseline, candidate, metricDeltas)`

Evaluates each goal string independently and returns `met`, `mostly_met`, `not_met`, or `unknown`.

This helper is heuristic. It does not parse planner steps or verification targets.
When one goal string contains multiple supported intents, it evaluates each matched intent and returns the most conservative status.

### `buildComparisonReport(options)`

Constructs a schema-shaped `ComparisonReport`, adds a summary string, and generates a `comparison_id` when one is not supplied.

Generated ids are derived from baseline and candidate reference type/id pairs.

## Validation helpers

### `assertValidComparisonReport(report)`

Throws if the payload fails the `ComparisonReport` JSON Schema.

### `isValidComparisonReport(report)`

Returns `true` when the payload passes schema validation.

## Public types

`src/index.ts` re-exports the module's local TypeScript types for:

- `AnalysisMeasurements`
- `AnalysisReport`
- `AudioVersion`
- `CompareRendersOptions`
- `CompareVersionsOptions`
- `ComparisonReport`
- `EditPlan`
- `GoalAlignment`
- `GoalStatus`
- `MetricDelta`
- `MetricDirection`
- `RegressionWarning`
- `RenderArtifact`
- `SemanticDelta`

Important note:

These local types are designed around the fields currently consumed by `modules/compare`. They are not a full in-module replacement for the richer repository-wide contract documentation under `contracts/`.
