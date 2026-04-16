# AnalysisReport

## Purpose

Captures measurable findings about an `AudioVersion` without prescribing edits.

## Producers

- `modules/analysis`

## Consumers

- `modules/semantics`
- `modules/planning`
- `modules/compare`
- `modules/tools`
- `modules/orchestration`

## Required fields

| Field | Type | Description |
| --- | --- | --- |
| `schema_version` | string | Contract version identifier. |
| `report_id` | string | Stable analysis report identifier. |
| `asset_id` | string | Referenced asset identifier. |
| `version_id` | string | Referenced version identifier. |
| `generated_at` | string | ISO 8601 UTC timestamp. |
| `analyzer.name` | string | Analyzer entrypoint name. |
| `analyzer.version` | string | Analyzer implementation version. |
| `summary.plain_text` | string | Human-readable analysis summary. |
| `measurements` | object | Structured measurement groups. |

## Required measurement groups

- `levels`
- `dynamics`
- `spectral_balance`
- `stereo`
- `artifacts`

## Initial required measurement fields

The initial machine-readable schema requires at least these fields inside the required groups:

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
- `artifacts.clipping_detected`
- `artifacts.noise_floor_dbfs`

Additional fields may be added without breaking this baseline.

## Optional fields

| Field | Type | Description |
| --- | --- | --- |
| `annotations` | array | Localized findings with time and frequency ranges. |
| `segments` | array | Time-ordered structural regions or events. |
| `source_character` | object | Coarse classification and confidence. |
| `material_character` | object | Conservative one-shot vs loop classification with explicit uncertainty. |
| `summary.confidence` | number | Confidence from `0` to `1`. |

## Invariants

- `measurements` must be machine-readable and not only free text.
- Every annotation must include a `kind`, time range, and severity.
- Findings must describe current state, not requested state.

## Example

See `contracts/examples/analysis-report.json`.
