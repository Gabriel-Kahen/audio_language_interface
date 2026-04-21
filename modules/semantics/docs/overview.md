# Semantics Overview

## Purpose

Translate measurable findings into interpretable descriptors with evidence and confidence.

This module is part of the intent layer.

The current implementation is a conservative, rule-based mapper from `AnalysisReport` measurements and annotations into a descriptor vocabulary that is intentionally larger than the baseline planner surface, but still evidence-first. It prefers unresolved output over over-claiming.

## Public API surface

- `buildSemanticProfile(report, options?) => SemanticProfile`
- `assertValidSemanticProfile(profile)` and `isValidSemanticProfile(profile)` for contract checks
- exported descriptor taxonomy constants from `src/descriptor-taxonomy.ts`

See `docs/api.md` for the concrete profile-building behavior, validation helpers, and taxonomy exports.

## Implemented source files

- `src/build-semantic-profile.ts`: top-level semantic entrypoint
- `src/descriptor-taxonomy.ts`: canonical descriptor names and grouping
- `src/rules.ts`: mapping rules from measurements to descriptors
- `src/evidence.ts`: evidence reference utilities
- `src/summary.ts`: profile summary generation
- `src/index.ts`: public exports only

## Dependencies

- `modules/core`
- `modules/analysis`
- `SemanticProfile` contract

## Downstream consumers

- `planning`
- `compare`
- `tools`
- `orchestration`

## Non-goals

- raw signal measurement
- user request parsing
- transform parameter selection

## Test expectations

- verify descriptor assignment on representative analysis fixtures
- verify confidence and rationale formatting
- verify all descriptors trace back to evidence
- verify contract alignment for `SemanticProfile`

## Initial implementation notes

- `buildSemanticProfile(report, options?)` is the top-level entrypoint.
- Input validation is performed against the published `AnalysisReport` schema before mapping rules run.
- `generated_at` defaults to semantic profile creation time; callers may override it when deterministic timestamps are needed.
- The descriptor set is still conservative, but now covers more of the Layer 2 language needed to ground the newer runtime surface.
- Borderline evidence is surfaced via `unresolved_terms` rather than inflated confidence.
- Descriptor coverage and evidence mapping are documented in `docs/descriptor-taxonomy.md`.

## Current descriptor coverage

The currently assigned descriptor family includes:

- `bright`
- `dark`
- `balanced`
- `slightly_harsh`
- `muddy`
- `warm`
- `airy`
- `sibilant`
- `mono`
- `narrow`
- `wide`
- `off_center`
- `punchy`
- `controlled`
- `loud`
- `quiet`
- `level_unstable`
- `clipped`
- `noisy`

The semantic taxonomy includes restoration descriptors such as `hum_present` and `clicks_present`, and the current baseline analysis pipeline can now emit the matching `hum` and `click` annotations. Those labels are still assigned only when the incoming `AnalysisReport` carries strong enough explicit hum/click evidence.

## Current limitations

- Descriptor assignment is rule-based and only grounded in currently implemented analysis measurements and annotations.
- Terms like `hum_present`, `clicks_present`, and strongly explicit `sibilant` still require matching annotations from upstream analysis. The baseline analyzer now emits hum/click annotations for the current cleanup slice, but the mapper still refuses to infer those labels from broad aggregate measurements alone.
- `hum_present` is only assigned when the annotation also looks sustained and low-frequency enough to justify a hum descriptor rather than a generic tone event.
- `clicks_present` is only assigned when the annotation still looks short and impulse-like instead of becoming a broader burst region.
- `warm` and `muddy` are intentionally separated. The module only assigns `warm` when low-band weight is present without the stronger low-mid masking that would justify `muddy`.
- `controlled` is intentionally conservative. It is only assigned when dynamic range, crest factor, transient density, and sample-domain short-term RMS spread all cluster inside a restrained range without clipping.
- `loud`, `quiet`, and `level_unstable` are based on measured level and dynamics fields only. They are not mastering-value judgments and are intentionally anchored to explicit thresholds in the same sample-domain or loudness-domain measurements, rather than cross-domain offsets.
- `noisy` is only assigned when a localized `noise` annotation and an elevated `noise_floor_dbfs` agree. The aggregate floor value alone is still treated as insufficient.
- `wide` is only assigned when aggregate width, positive correlation, and sustained `stereo_width` coverage agree without competing width-ambiguity evidence.
- `noisy` now also requires sustained `noise` coverage, not just one qualifying annotation plus an elevated floor estimate.
- Borderline evidence is pushed into `unresolved_terms` instead of forcing a weak descriptor.
- Summary text is descriptive convenience output, not a substitute for the structured descriptor list.
