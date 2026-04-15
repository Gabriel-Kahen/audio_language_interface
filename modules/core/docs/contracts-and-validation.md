# Core Contracts And Validation

## Scope

This note explains how `modules/core` relates to the published `AudioAsset` and `AudioVersion` contracts.

`core` is not a schema-generation layer. It is the runtime implementation that materializes and validates those contracts inside application code.

The runtime validators consume the canonical JSON Schemas under `contracts/schemas/json/` and then apply a small number of stricter invariants that are currently repository policy rather than raw schema shape.

## Validation Model

Each public artifact follows the same pattern:

- `create...` builds a value, fills local defaults, then validates it.
- `validate...` returns `ValidationResult<T>` for boundary-safe error handling.
- `assertValid...` throws a formatted error for callers that treat invalid state as exceptional.
- `is...` reuses the validator as a type guard.

This gives downstream modules one validation path instead of separate creation-time and parse-time rules.

## Error Shape

Validation failures use this stable structure:

- `code`: always `validation_error`
- `message`: artifact-level summary such as `Invalid AudioAsset.`
- `issues`: a list of per-field issues with `instancePath`, `keyword`, and `message`

The issue format is intentionally close to JSON Schema and Ajv output, but small enough to stay independent of a specific validator implementation.

## Important Runtime Guarantees

### `AudioAsset`

- source metadata always includes `imported_at`
- generated assets always include `schema_version`
- unknown top-level and nested properties are rejected
- optional `checksum_sha256` must be a 64-character hexadecimal digest

### `AudioVersion`

- lineage always includes `created_at` and `created_by`
- generated versions always include `schema_version`
- `parent_version_id` cannot point to the same version
- `audio.storage_ref` must stay workspace-relative and POSIX-style
- `audio.frame_count` and `audio.duration_seconds` must agree within one frame at the declared sample rate

## Known Gaps Versus Full Domain Integrity

The validators deliberately stop short of cross-object checks.

They do not prove that:

- an `asset_id` exists in storage or history
- a `parent_version_id` refers to a real parent
- `plan_id` or `transform_record_id` resolve to real records
- audio metadata matches bytes on disk

Those checks belong in higher-level modules that have access to persistence, decoded media, or execution history.

## Guidance For Other Modules

- Use the contract docs in `contracts/` as the cross-module source of truth for payload shape.
- Use `modules/core` when working with runtime values inside TypeScript.
- If a new invariant should apply repository-wide, add it here and update the corresponding contract docs and examples in the same change.
