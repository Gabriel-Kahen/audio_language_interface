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
| `muddy` | `measurements.spectral_balance` | Low-mid energy clearly outweighs upper-band presence. |
| `warm` | `measurements.spectral_balance` | Low-band weight is present without stronger muddy masking. |
| `airy` | `measurements.spectral_balance` | Upper-band lift is open and extended without strong harshness conflict. |
| `sibilant` | explicit `annotations[*]` in an upper-presence band plus `measurements.spectral_balance` | Sibilant upper-presence emphasis is explicit enough to justify a restoration-oriented label. |
| `mono` | `measurements.stereo` | Width is effectively collapsed. |
| `narrow` | `measurements.stereo` | Some stereo spread exists, but it remains constrained. |
| `wide` | `measurements.stereo` plus `annotations[*].kind == stereo_width` | Side energy is meaningfully present, stable width evidence is sustained, and ambiguity stays limited. |
| `punchy` | `measurements.dynamics` | Crest factor and transient density are both elevated. |
| `controlled` | `measurements.dynamics` plus `measurements.levels` | Dynamic swings, crest factor, and short-term level spread all remain contained. |
| `loud` | `measurements.levels` plus `measurements.dynamics` | Integrated loudness, RMS level, and true peak all sit in a high-output range. |
| `quiet` | `measurements.levels` plus `measurements.dynamics` | Integrated loudness and RMS level both sit well below the current conservative output range. |
| `level_unstable` | `measurements.levels` plus `measurements.dynamics` | Dynamic range and short-term level spread suggest unstable overall level. |
| `clipped` | `measurements.artifacts` | Clipping was directly detected. |
| `noisy` | `annotations[*].kind == noise` plus `measurements.artifacts` | Sustained broadband-like floor evidence covers a meaningful region and the estimated floor is elevated. |
| `hum_present` | explicit `annotations[*]` from upstream analysis | A steady hum-like artifact is explicitly annotated strongly enough to support a restoration term. |
| `clicks_present` | explicit `annotations[*]` from upstream analysis | Short impulsive click/pop artifacts are explicitly annotated strongly enough to support a restoration term. |

## Conservative behavior

- The module does not map `artifacts.noise_floor_dbfs` directly to `clean`, and it only maps `noisy` when a localized `noise` annotation agrees with the aggregate floor estimate.
- `balanced` requires both near-neutral low/high band tilt and a mid-range spectral centroid, so unusually high or low centroids remain unresolved instead of being over-normalized.
- `muddy` requires both low-mid buildup and reduced upper-band support. A bass-heavy source alone is not enough.
- `warm` is intentionally narrower than generic bass-heavy. If low-mid masking is too strong, the module prefers `muddy` and leaves `warm` unresolved.
- `airy` requires elevated top-end extension without stronger sibilance or harshness evidence that would make the descriptor misleading.
- `sibilant`, `hum_present`, and `clicks_present` stay unresolved unless upstream analysis emits explicit supporting annotations. The semantics layer does not invent those restoration descriptors from broad aggregate measurements.
- `slightly_harsh` requires both a harshness annotation and enough upper-mid excess to keep the label tied to measurable evidence.
- `wide` also requires width evidence to stay materially positive and not conflict with localized width-ambiguity or major left-right imbalance.
- When explicit `stereo_ambiguity` evidence is present, `wide` remains unresolved rather than being dropped silently, even if the aggregate correlation is too risky for assignment.
- `wide` additionally requires sustained `stereo_width` coverage so a brief spread event does not become a whole-file semantic claim.
- `punchy` also requires localized transient-impact evidence and avoids assignment when clipping or very low short-term dynamic range conflicts with the transient measurements.
- `controlled` is intentionally assigned only in a restrained region of the dynamics space. The module prefers unresolved output over calling moderately dynamic material "controlled" too early.
- `loud`, `quiet`, and `level_unstable` are descriptive level states, not quality judgments. Near-threshold cases remain unresolved.
- `noisy` additionally requires sustained coverage from `noise` annotations so a single short region does not become a whole-file claim.
- Borderline evidence is recorded under `unresolved_terms` instead of forcing a descriptor. This now includes near-threshold `bright`, `dark`, `muddy`, `warm`, `airy`, `sibilant`, `wide`, `punchy`, `controlled`, `loud`, `quiet`, `level_unstable`, `slightly_harsh`, `noisy`, `hum_present`, and `clicks_present` cases.
- Every assigned descriptor includes one or more `evidence_refs` back to the source `AnalysisReport`.
