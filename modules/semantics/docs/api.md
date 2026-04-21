# Semantics API

## Scope

This document describes the implemented public API in `modules/semantics/src/index.ts`.

Use it when you need the current semantic-profile construction behavior, validation helpers, or descriptor-taxonomy exports.

## Entry points

### `buildSemanticProfile(report, options?)`

Builds a contract-aligned `SemanticProfile` from one validated `AnalysisReport`.

Current behavior:

- validates the inbound `AnalysisReport`
- runs the current rule-based descriptor assessment
- computes `generated_at` from `options.generatedAt` or the current clock
- generates a deterministic `profile_id` by hashing:
  - `report.report_id`
  - the semantics module name
  - the semantics module version
- emits:
  - `descriptors`
  - `summary`
  - optional `unresolved_terms`
- schema-validates the finished `SemanticProfile`

The module prefers unresolved output over weak descriptors when evidence is borderline or conflicting.

## Descriptor taxonomy exports

### `DESCRIPTOR_TAXONOMY`

Publishes the current descriptor grouping and metadata used by the semantics layer.

### `SUPPORTED_DESCRIPTOR_LABELS`

Publishes the current descriptor labels as a caller-friendly list.

Use these exports when another module needs to reason about the allowed semantic vocabulary without duplicating strings.

## Validation helpers

### `assertValidSemanticProfile(profile)`

Throws if a payload fails the published `SemanticProfile` contract.

### `isValidSemanticProfile(profile)`

Returns `true` when a payload satisfies the published `SemanticProfile` contract.

## Public types

`src/index.ts` re-exports the current local types for:

- `BuildSemanticProfileOptions`
- `SemanticDescriptor`
- `SemanticProfile`
- the reduced local `AnalysisReport` view the semantics layer reads

These types describe the current module-facing behavior. The shared artifact contract source of truth remains under `contracts/schemas/semantic-profile.md`.

## Current descriptor boundary

The current implementation is:

- rule-based rather than model-based
- evidence-first and conservative
- broader than the planner’s exact supported prompt surface, but still limited to descriptors justified by current measurements and annotations

The full current vocabulary and evidence notes are documented in `docs/descriptor-taxonomy.md`.

## Known limitations

- descriptor assignment depends entirely on currently implemented analysis signals
- some restoration descriptors still require explicit upstream annotations rather than aggregate metric inference alone
- summary text is convenience output, not a replacement for the structured descriptor list
