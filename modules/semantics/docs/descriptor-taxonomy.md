# Descriptor Taxonomy

## Scope

The initial `semantics` implementation only assigns labels that can be traced directly to current `AnalysisReport` fields or supported annotations.

## Supported descriptors

| Label | Evidence source | Assignment intent |
| --- | --- | --- |
| `bright` | `measurements.spectral_balance` | High-band energy clearly exceeds low-band energy and centroid is elevated. |
| `dark` | `measurements.spectral_balance` | Low-band energy dominates and centroid stays comparatively low. |
| `balanced` | `measurements.spectral_balance` | No strong low/high tonal tilt is present. |
| `slightly_harsh` | `annotations[*].kind == harshness` plus `measurements.spectral_balance` | Upper-mid emphasis is explicitly annotated with non-trivial severity. |
| `mono` | `measurements.stereo` | Width is effectively collapsed. |
| `narrow` | `measurements.stereo` | Some stereo spread exists, but it remains constrained. |
| `wide` | `measurements.stereo` | Side energy is meaningfully present and channel correlation remains materially positive. |
| `punchy` | `measurements.dynamics` | Crest factor and transient density are both elevated. |
| `clipped` | `measurements.artifacts` | Clipping was directly detected. |

## Conservative behavior

- The module does not infer descriptors like `muddy`, `warm`, `dry`, or `compressed` yet because the current analysis baseline does not expose enough direct evidence to justify them reliably.
- The module does not map `artifacts.noise_floor_dbfs` directly to `clean` or `noisy`, because the analysis docs define that field as a low-percentile level estimate rather than a separated noise-only measurement.
- `balanced` requires both near-neutral low/high band tilt and a mid-range spectral centroid, so unusually high or low centroids remain unresolved instead of being over-normalized.
- `slightly_harsh` requires both a harshness annotation and enough upper-mid excess to keep the label tied to measurable evidence.
- Borderline evidence is recorded under `unresolved_terms` instead of forcing a descriptor. This now includes near-threshold `bright`, `dark`, `wide`, `punchy`, and `slightly_harsh` cases.
- Every assigned descriptor includes one or more `evidence_refs` back to the source `AnalysisReport`.
