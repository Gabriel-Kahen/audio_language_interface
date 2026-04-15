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
| `wide` | `measurements.stereo` plus `annotations[*].kind == stereo_width` | Side energy is meaningfully present, stable width evidence is sustained, and ambiguity stays limited. |
| `punchy` | `measurements.dynamics` | Crest factor and transient density are both elevated. |
| `clipped` | `measurements.artifacts` | Clipping was directly detected. |
| `noisy` | `annotations[*].kind == noise` plus `measurements.artifacts` | Sustained broadband-like floor evidence covers a meaningful region and the estimated floor is elevated. |

## Conservative behavior

- The module does not infer descriptors like `muddy`, `warm`, `dry`, or `compressed` yet because the current analysis baseline does not expose enough direct evidence to justify them reliably.
- The module does not map `artifacts.noise_floor_dbfs` directly to `clean`, and it only maps `noisy` when a localized `noise` annotation agrees with the aggregate floor estimate.
- `balanced` requires both near-neutral low/high band tilt and a mid-range spectral centroid, so unusually high or low centroids remain unresolved instead of being over-normalized.
- `slightly_harsh` requires both a harshness annotation and enough upper-mid excess to keep the label tied to measurable evidence.
- `wide` also requires width evidence to stay materially positive and not conflict with localized width-ambiguity or major left-right imbalance.
- When explicit `stereo_ambiguity` evidence is present, `wide` remains unresolved rather than being dropped silently, even if the aggregate correlation is too risky for assignment.
- `wide` additionally requires sustained `stereo_width` coverage so a brief spread event does not become a whole-file semantic claim.
- `punchy` also requires localized transient-impact evidence and avoids assignment when clipping or very low short-term dynamic range conflicts with the transient measurements.
- `noisy` additionally requires sustained coverage from `noise` annotations so a single short region does not become a whole-file claim.
- Borderline evidence is recorded under `unresolved_terms` instead of forcing a descriptor. This now includes near-threshold `bright`, `dark`, `wide`, `punchy`, `slightly_harsh`, and `noisy` cases.
- Every assigned descriptor includes one or more `evidence_refs` back to the source `AnalysisReport`.
