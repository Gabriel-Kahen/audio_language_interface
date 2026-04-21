# Core API

## Scope

This document describes the implemented public API in `modules/core/src/index.ts`.

Use it when you need the current creation helpers, validators, ID helpers, timestamp helpers, or shared result envelopes that other modules build on.

## Canonical artifact helpers

### `createAudioAsset(input)`

Builds a canonical `AudioAsset`.

Current behavior:

- sets `schema_version` to `1.0.0`
- generates `asset_id` when omitted
- fills `source.imported_at` with `nowTimestamp()` when omitted
- copies nested arrays and objects before returning
- validates the finished object before returning it

### `validateAudioAsset(value)`

Validates an unknown value and returns `ValidationResult<AudioAsset>`.

Behavior:

- checks the published schema first
- additionally requires `source.imported_at` to be an ISO 8601 UTC `Z` timestamp
- returns `ok(...)` on success or `err(...)` with flattened issues on failure

### `assertValidAudioAsset(value)` and `isAudioAsset(value)`

- `assertValidAudioAsset(...)` throws when validation fails
- `isAudioAsset(...)` is the boolean type-guard form of the same validation logic

### `createAudioVersion(input)`

Builds a canonical `AudioVersion`.

Current behavior:

- sets `schema_version` to `1.0.0`
- generates `version_id` when omitted
- fills `lineage.created_at` with `nowTimestamp()` when omitted
- validates the finished object before returning it

### `validateAudioVersion(value)`

Validates an unknown value and returns `ValidationResult<AudioVersion>`.

Runtime-only invariants beyond schema validation:

- `parent_version_id` must not equal `version_id`
- `lineage.created_at` must be a UTC `Z` timestamp
- `audio.storage_ref` must be a workspace-relative POSIX path without empty, `.` or `..` segments
- `audio.frame_count` must match `duration_seconds` within one frame at the declared sample rate

### `assertValidAudioVersion(value)` and `isAudioVersion(value)`

- `assertValidAudioVersion(...)` throws when validation fails
- `isAudioVersion(...)` is the boolean type-guard form

## Identifier helpers

The package exports creation and type-guard helpers for the shared artifact-id families used across the repository:

- `createAssetId()` / `isAssetId(...)`
- `createVersionId()` / `isVersionId(...)`
- `createAnalysisId()` / `isAnalysisId(...)`
- `createSemanticId()` / `isSemanticId(...)`
- `createPlanId()` / `isPlanId(...)`
- `createTransformId()` / `isTransformId(...)`
- `createRenderId()` / `isRenderId(...)`
- `createComparisonId()` / `isComparisonId(...)`
- `createSessionId()` / `isSessionId(...)`
- `createToolRequestId()` / `isToolRequestId(...)`

Current behavior:

- generated ids are random UUID-derived alphanumeric strings with a stable prefix
- type guards accept only the expected prefix plus alphanumeric body

## Time helpers

### `nowTimestamp()`

Returns the current time as `Date#toISOString()`.

### `toIsoTimestamp(value)`

Normalizes a `Date`, epoch number, or date-like string to ISO 8601 UTC output.

It still relies on the JavaScript `Date` parser, so invalid input can throw.

### `isIsoTimestamp(value)`

Accepts only parseable ISO 8601 UTC timestamps ending in `Z`.

It rejects offset timestamps and invalid calendar values.

## Result helpers

The package exports a small shared result envelope:

- `ok(value)`
- `err(error)`
- `isOk(result)`
- `isErr(result)`

It also re-exports the shared types:

- `Result`
- `ValidationError`
- `ValidationIssue`
- `ValidationResult`

These helpers are used so module-boundary validation can stay serialization-friendly instead of throwing by default.

## Public types and constants

`src/index.ts` also re-exports the current shared runtime types for:

- `AudioAsset`, `AudioAssetMedia`, `AudioAssetSource`, and `SourceKind`
- `AudioVersion`, `AudioVersionAudio`, `AudioVersionLineage`, and `AudioVersionState`
- the shared artifact-id type aliases
- `IsoTimestamp`
- `SCHEMA_VERSION`

## Current limitations

- `core` validates shape and local invariants only; it does not check whether referenced artifacts exist
- `toIsoTimestamp(...)` and `nowTimestamp()` are thin wrappers around the JavaScript date runtime
- storage-path validation is string-based and does not resolve against a real workspace root
