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
- optionally evaluates typed `editPlan.verification_targets`, with heuristic `editPlan.goals` as a legacy fallback only
- emits `evaluation_basis` so downstream callers can see which quality field is authoritative
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
- emits `evaluation_basis` so downstream callers can distinguish render-metadata-only comparison from analysis-backed quality evaluation
- schema-validates the final report before returning it

Use this when the comparison target is a rendered preview/export and only render metadata may be available.

## Lower-level helpers

### `computeAnalysisMetricDeltas(baseline, candidate)`

Returns ordered metric deltas for the analysis measurements currently supported by the module.

In the current baseline that includes the core level, dynamics, spectral, stereo, and artifact fields plus optional Layer 2 companion metrics such as:

- `dynamics.transient_crest_db`
- `dynamics.punch_window_ratio`
- `spectral_balance.brightness_tilt_db`
- `spectral_balance.presence_band_db`
- `spectral_balance.harshness_ratio_db`
- `artifacts.clipped_sample_count`

### `computeRenderMetricDeltas(baseline, candidate)`

Returns ordered metric deltas for render output metadata and optional loudness summary fields.

### `deriveSemanticDeltas(baseline, candidate, metricDeltas)`

Maps specific measurement patterns into a fixed semantic vocabulary. Returns an empty array when no rule threshold is crossed.

### `detectAnalysisRegressions(baseline, candidate, metricDeltas)`

Detects a small set of analysis-side failure modes:

- clipping introduced by the candidate
- excessive integrated loudness shift
- reduced true-peak headroom
- loudness increases that also reduce headroom
- stereo collapse
- measurable punch loss
- over-compression from combined crest-factor and dynamic-range reduction
- worsened peak control from higher peaks or lower sample headroom
- increased sibilance from presence/harshness growth
- lost air from upper-band loss
- added muddiness from mid-band buildup
- proxy-pattern increases in hum-like low-frequency contamination
- proxy-pattern increases in click-like clipped spikes

### `detectRenderRegressions(baseline, candidate, metricDeltas)`

Detects render metadata mismatches:

- duration changes
- channel-count changes
- sample-rate changes

### `evaluateGoalAlignment(goals, baseline, candidate, metricDeltas)`

Evaluates each goal string independently and returns `met`, `mostly_met`, `not_met`, or `unknown`.

This helper is heuristic. It does not parse planner steps or verification targets.
It now serves as the legacy fallback only when an `EditPlan` does not carry typed `verification_targets`.
When one goal string contains multiple supported intents, it evaluates each matched intent and returns the most conservative status.

Current supported Layer 2 goal families include:

- loudness increase, decrease, and stability
- sibilance reduction
- hum reduction via conservative low-band/noise-floor proxies
- click reduction via conservative clipped-sample proxies
- warmth increase
- air increase
- muddiness reduction

### `buildComparisonReport(options)`

Constructs a schema-shaped `ComparisonReport`, adds a summary string, and generates a `comparison_id` when one is not supplied.

Generated ids are derived from baseline and candidate reference type/id pairs.
The builder also emits `evaluation_basis` and treats `verification_results` as the authoritative summary source whenever structured verification exists.

## Validation helpers

### `assertValidComparisonReport(report)`

Throws if the payload fails the `ComparisonReport` JSON Schema.

### `isValidComparisonReport(report)`

Returns `true` when the payload passes schema validation.

## Public types

`src/index.ts` re-exports the module's local TypeScript types for:

- `AnalysisMeasurements`
- `AnalysisAnnotation`
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
