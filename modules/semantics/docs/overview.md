# Semantics Overview

## Purpose

Translate measurable findings into interpretable descriptors with evidence and confidence.

## Public API surface

- build a `SemanticProfile` from an `AnalysisReport`
- assign descriptor labels and confidence
- explain descriptor assignments with traceable evidence
- validate emitted `SemanticProfile` payloads against the published schema

## Suggested initial source files

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
