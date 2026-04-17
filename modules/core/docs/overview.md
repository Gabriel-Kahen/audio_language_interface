# Core Overview

## Purpose

`modules/core` defines the canonical shared primitives that the rest of the repository uses to talk about audio assets and versions.

This module belongs to the shared/foundation layer.

This module is intentionally small. It owns stable shared types, identifier and timestamp helpers, schema-backed validation helpers, and the repository's baseline result envelope. It does not own any I/O, DSP, orchestration, or workflow policy.

## Public API

The package exports five groups of functionality from `src/index.ts`:

### `AudioAsset`

- `createAudioAsset(input)` creates a contract-aligned `AudioAsset` with generated defaults for `asset_id` and `source.imported_at`.
- `validateAudioAsset(value)` returns `ValidationResult<AudioAsset>` instead of throwing.
- `assertValidAudioAsset(value)` validates and throws a formatted error if invalid.
- `isAudioAsset(value)` is a type guard built on the same validator.
- `SCHEMA_VERSION` is currently fixed to `1.0.0`.

### `AudioVersion`

- `createAudioVersion(input)` creates a contract-aligned `AudioVersion` with generated defaults for `version_id` and `lineage.created_at`.
- `validateAudioVersion(value)` returns `ValidationResult<AudioVersion>`.
- `assertValidAudioVersion(value)` throws a formatted error if invalid.
- `isAudioVersion(value)` is a type guard built on the same validator.

### Identifiers

- `createAssetId()` and `createVersionId()` produce the canonical `asset_` and `ver_` identifiers.
- Matching helpers also cover the related shared families from `common.schema.json`: `analysis_`, `semantic_`, `plan_`, `transform_`, `render_`, `compare_`, `session_`, and `toolreq_`.

### Time

- `nowTimestamp()` returns the current timestamp in ISO 8601 UTC form.
- `toIsoTimestamp(value)` normalizes a `Date`, epoch number, or date-like string to `Date#toISOString()` output.
- `isIsoTimestamp(value)` accepts only valid ISO 8601 UTC timestamps ending in `Z`.

### Result envelopes

- `ok(value)` and `err(error)` create discriminated result objects.
- `isOk(result)` and `isErr(result)` narrow `Result<TValue, TError>`.
- `ValidationError`, `ValidationIssue`, and `ValidationResult<T>` standardize validator output.

## Data Model Invariants

The implementation currently enforces these invariants at runtime:

- `schema_version` must equal `1.0.0` for both `AudioAsset` and `AudioVersion`.
- `asset_id` must match `asset_[A-Za-z0-9]+`.
- `version_id` and `parent_version_id` must match `ver_[A-Za-z0-9]+`.
- timestamps must be valid ISO 8601 UTC strings ending in `Z`.
- `source.kind` must be one of `file`, `bytes`, `stream`, or `generated`.
- required nested objects reject unknown properties.
- numeric media fields enforce the same minimums as the current contracts.
- `AudioVersion.parent_version_id` must not equal `version_id`.
- `AudioVersion.audio.storage_ref` must be a workspace-relative POSIX path without empty, `.` or `..` segments.
- `AudioVersion.audio.frame_count` must agree with `duration_seconds` at the declared `sample_rate_hz` within one frame of tolerance.

Creation helpers also preserve serialization-friendly output:

- generated timestamps are strings, not `Date` instances.
- optional arrays and nested objects are copied before being returned.
- omitted optional fields stay omitted instead of being emitted as `undefined` or `null`.

## Contract Alignment Notes

`core` is the in-repo implementation of the `AudioAsset` and `AudioVersion` contracts under `contracts/schemas/` and `contracts/examples/`.

The tests assert that the canonical example payloads validate successfully.

The runtime validators consume the canonical JSON Schemas first, then add a few stricter runtime-only invariants:

- timestamps must be UTC `Z` timestamps, while a generic JSON Schema `date-time` format could also allow offsets.
- `audio.storage_ref` must follow the workspace-relative POSIX path convention used elsewhere in the repository.
- `AudioVersion` duration and frame metadata must be internally consistent.

Downstream modules should rely on `core` validation behavior when materializing or accepting runtime objects inside the workspace.

## Downstream Usage

Use `createAudioAsset` and `createAudioVersion` when a module is producing a new canonical artifact and wants generated defaults plus immediate invariant checks.

Use `validateAudioAsset` and `validateAudioVersion` at module boundaries when invalid input should be reported rather than thrown.

Typical usage patterns:

- `modules/io` creates the initial `AudioAsset` and imported `AudioVersion`.
- `modules/transforms` creates derived `AudioVersion` values and sets lineage references.
- `modules/history` can treat `asset_id`, `version_id`, and `parent_version_id` as stable graph keys.
- `modules/tools` and `modules/orchestration` can surface `ValidationError` values directly because they are serialization-friendly.

## Limitations And Assumptions

- `core` validates object shape and local invariants only. It does not verify that referenced assets, plans, or transform records actually exist.
- `core` does not inspect audio files, so it only checks metadata consistency locally rather than against bytes on disk.
- identifier generation uses random UUID material stripped to alphanumeric characters; ordering and lexicographic stability are not provided.
- `toIsoTimestamp` still delegates to the JavaScript `Date` parser, so invalid date-like input may throw before validation.
- `storage_ref` validation is string-based and does not resolve against a real workspace root.

## Source Layout

- `src/audio-asset.ts`: `AudioAsset` types, creation, and validation
- `src/audio-version.ts`: `AudioVersion` types, creation, and validation
- `src/ids.ts`: ID types and generators
- `src/time.ts`: timestamp helpers
- `src/result.ts`: shared result and validation envelope types
- `src/validation.ts`: internal validation building blocks used by the public validators
- `src/index.ts`: public exports only

## Tests

The module test suite currently covers:

- identifier prefix and type-guard behavior across the shared artifact id families
- UTC timestamp acceptance and rejection
- contract example validation for `AudioAsset` and `AudioVersion`
- creation helper defaults for both models
- stricter runtime invariants like rejecting offset timestamps, self-parented versions, inconsistent frame metadata, and non-POSIX `storage_ref` values
