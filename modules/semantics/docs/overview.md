# Semantics Overview

## Purpose

Translate measurable findings into interpretable descriptors with evidence and confidence.

The current implementation is a conservative, rule-based mapper from `AnalysisReport` measurements and annotations into a small descriptor vocabulary. It prefers unresolved output over over-claiming.

## Public API surface

- `buildSemanticProfile(report, options?) => SemanticProfile`
- `assertValidSemanticProfile(profile)` and `isValidSemanticProfile(profile)` for contract checks
- exported descriptor taxonomy constants from `src/descriptor-taxonomy.ts`

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
- The initial descriptor set is intentionally small and conservative.
- Borderline evidence is surfaced via `unresolved_terms` rather than inflated confidence.
- Descriptor coverage and evidence mapping are documented in `docs/descriptor-taxonomy.md`.

## Current descriptor coverage

The currently assigned descriptor family is intentionally narrow:

- `bright`
- `dark`
- `balanced`
- `slightly_harsh`
- `mono`
- `narrow`
- `wide`
- `punchy`
- `clipped`
- `noisy`

## Current limitations

- The module does not yet assign broader studio-language descriptors like `muddy`, `warm`, `dry`, `compressed`, or `clean`.
- Descriptor assignment is rule-based and only grounded in currently implemented analysis measurements and annotations.
- `noisy` is only assigned when a localized `noise` annotation and an elevated `noise_floor_dbfs` agree. The aggregate floor value alone is still treated as insufficient.
- Borderline evidence is pushed into `unresolved_terms` instead of forcing a weak descriptor.
- Summary text is descriptive convenience output, not a substitute for the structured descriptor list.
