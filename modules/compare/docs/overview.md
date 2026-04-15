# Compare Overview

## Purpose

`modules/compare` measures how a candidate audio state differs from a baseline and packages those changes into a contract-aligned `ComparisonReport`.

The module currently focuses on:

- deterministic metric deltas
- a small evidence-based semantic vocabulary
- regression warnings for a few clear failure modes
- optional goal-alignment checks driven by `EditPlan.goals`

## Public API

The public entrypoints are exported from `src/index.ts`.

### Top-level comparison entrypoints

- `compareVersions(options)`
  Compares two `AudioVersion` values using paired `AnalysisReport` inputs. This is the full comparison path and produces metric deltas, semantic deltas, regression warnings, optional goal alignment, and a summary.
- `compareRenders(options)`
  Compares two `RenderArtifact` values. If both paired analysis reports are also provided, it uses the same analysis-driven comparison path as `compareVersions`. If analysis is omitted, it performs a thin render-only comparison from render metadata and optional loudness summary values.

### Supporting exports

- `computeAnalysisMetricDeltas()`
- `computeRenderMetricDeltas()`
- `deriveSemanticDeltas()`
- `detectAnalysisRegressions()`
- `detectRenderRegressions()`
- `evaluateGoalAlignment()`
- `buildComparisonReport()`
- `assertValidComparisonReport()`
- `isValidComparisonReport()`

See `modules/compare/docs/api.md` for the concrete exported shapes and behavior notes.

## Input contracts

The module consumes these contract families:

- `AnalysisReport`
- `EditPlan`
- `RenderArtifact`
- `AudioVersion`

The module emits:

- `ComparisonReport`

Contract references:

- `contracts/schemas/analysis-report.md`
- `contracts/schemas/edit-plan.md`
- `contracts/schemas/render-artifact.md`
- `contracts/schemas/comparison-report.md`

## Current comparison flow

### Version comparison

`compareVersions()` requires paired analysis reports and uses them to:

1. compute numeric deltas from `measurements`
2. derive semantic labels from those deltas and raw measurements
3. detect analysis regressions
4. optionally score each `EditPlan.goal`
5. build and schema-validate a `ComparisonReport`

### Render comparison

`compareRenders()` always computes render-level deltas from `RenderArtifact.output` and optional `loudness_summary` fields.

If both `baselineAnalysis` and `candidateAnalysis` are provided, the function switches to the analysis-driven metric set for the report body and additionally derives semantic deltas, analysis regressions, and optional goal alignment.

If analysis reports are not provided, the comparison remains intentionally thin:

- no semantic deltas
- no goal alignment
- only render-level regressions

## Metric delta vocabulary

The current implementation emits deltas with `direction` set to `increased`, `decreased`, or `unchanged` and a rounded numeric `delta` equal to `candidate - baseline`.

### Analysis metrics

- `levels.integrated_lufs`
- `levels.true_peak_dbtp`
- `dynamics.crest_factor_db`
- `dynamics.transient_density_per_second`
- `spectral_balance.low_band_db`
- `spectral_balance.mid_band_db`
- `spectral_balance.high_band_db`
- `spectral_balance.spectral_centroid_hz`
- `stereo.width`
- `stereo.correlation`
- `stereo.balance_db` when present in both reports
- `artifacts.noise_floor_dbfs`
- `artifacts.clipped_sample_count` when present in both reports

### Render metrics

- `output.sample_rate_hz`
- `output.channels`
- `output.duration_seconds`
- `output.file_size_bytes` when present in both renders
- `loudness_summary.integrated_lufs` when present in both renders
- `loudness_summary.true_peak_dbtp` when present in both renders

## Semantic delta vocabulary

Semantic deltas are evidence-based labels, not free-form interpretations. The current vocabulary is intentionally small:

- `darker`
- `brighter`
- `less_harsh`
- `more_harsh`
- `less_punchy`
- `more_punchy`
- `narrower`
- `wider`
- `cleaner`
- `noisier`

Each item includes:

- `label`
- `confidence`
- `evidence`

Important behavior:

- labels only appear when a hard-coded threshold is crossed
- confidence is derived from magnitude and clamped to `0..1`
- semantic output is unavailable on render-only comparisons that omit analysis reports

## Regression vocabulary

The current regression warning kinds are:

### Analysis regressions

- `introduced_clipping`
- `excessive_loudness_shift`
- `reduced_true_peak_headroom`
- `stereo_collapse`

### Render regressions

- `render_duration_mismatch`
- `render_channel_change`
- `render_sample_rate_change`

Regression warnings include:

- `kind`
- `severity`
- `description`

The warning set is deliberately narrow. Absence of a warning does not mean the candidate is globally safe or high quality.

## Goal alignment behavior

Goal alignment is currently heuristic and keyword-driven. `evaluateGoalAlignment()` scans each goal string for fragments and maps it to one of a small set of checks.

### Supported goal families

- harshness reduction: matches fragments like `harsh` or `upper-mid`
- darkening / brightness reduction: matches fragments like `bright`, `darker`, or `darken`
- punch preservation: matches fragments like `punch`, `transient`, or `attack`
- width increase: matches fragments like `wide` or `wider`
- noise reduction: matches fragments like `noise`, `clean`, or `denoise`
- clipping avoidance: matches fragments like `clip` or `clipping`
- loudness stability: matches fragments like `loud`, `quieter`, or `volume`

### Status values

- `met`
- `mostly_met`
- `not_met`
- `unknown`

### Important implementation notes

- Goal matching is substring-based, not schema-driven or ontology-driven.
- Unsupported goal wording returns `unknown`.
- The current implementation only supports width increase, not width reduction.
- Brightness-related matching is currently biased toward darkening goals.
- Loudness-related matching currently checks magnitude of change more than direction of intent.
- Punch-related goals are treated as preservation checks, not as explicit punch-increase requests.

## Summary generation

`buildComparisonReport()` generates a plain-text summary by combining:

- up to two semantic labels when present
- a count of satisfied or mostly satisfied goals when goal alignment exists
- a list of regression warning kinds, or an explicit no-regressions sentence

The summary is intentionally compact and should be treated as a convenience field, not as the canonical machine-readable source of truth.

## Current limitations and assumptions

- The module compares structured metadata and analysis measurements. It does not inspect raw audio directly.
- `compareVersions()` requires analysis reports and does not fall back to a thinner path.
- `compareRenders()` only derives semantic deltas and goal alignment when both analysis reports are provided.
- Metric coverage is intentionally limited to the fields hard-coded in `src/deltas.ts`.
- Semantic interpretation is intentionally limited to a fixed rule set in `src/semantic-deltas.ts`.
- Goal alignment uses string heuristics instead of `EditPlan.steps`, `verification_targets`, or explicit planner-provided evaluation rules.
- The local TypeScript `EditPlan` type is narrower than the repository contract and currently models only the fields that `compare` consumes directly.
- The local TypeScript `RenderArtifact.loudness_summary` type is broader than the contract and is treated as a generic numeric map, though the current implementation only reads integrated loudness and true peak.
- Comparison IDs are deterministic only when baseline and candidate references are the same; changing timestamps, metrics, or goal inputs does not change the generated ID.

## Source layout

- `src/compare-versions.ts`: version-level entrypoint
- `src/compare-renders.ts`: render-level entrypoint
- `src/deltas.ts`: metric delta computation
- `src/semantic-deltas.ts`: evidence-based semantic labeling
- `src/regressions.ts`: regression detection rules
- `src/goal-alignment.ts`: heuristic goal checks
- `src/report-builder.ts`: `ComparisonReport` construction and summary text
- `src/utils/schema.ts`: schema validation helpers
- `src/index.ts`: public exports only

## Test expectations

The module tests currently verify:

- contract-valid `ComparisonReport` output
- metric delta computation for version and render comparisons
- semantic labels for supported evidence patterns
- regression detection for clipping, loudness, true-peak headroom, stereo collapse, and render mismatches
- goal-alignment output for supported goal phrasing
