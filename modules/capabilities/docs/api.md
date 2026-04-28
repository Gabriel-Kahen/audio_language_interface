# Capabilities API

## Scope

This document describes the implemented public API in `modules/capabilities/src/index.ts`.

The module is intentionally small. It publishes the current `RuntimeCapabilityManifest` snapshot and a few lookup helpers over that manifest.

## Published manifest

### `defaultRuntimeCapabilityManifest`

This is the current static capability snapshot consumed by planning, tools, and repo-level docs.

Current behavior:

- uses the shared `RuntimeCapabilityManifest` contract shape
- publishes `manifest_id = "capmanifest_20260428A"`
- publishes `generated_at = "2026-04-28T16:00:00Z"`
- describes the runtime-supported operation inventory, current planner support, target scopes, parameter surfaces, and high-level limitations

The manifest is static in the current implementation. The module does not probe the runtime dynamically.

## Lookup helpers

### `getRuntimeOperationCapability(name)`

Returns the published capability entry for one operation name.

Behavior:

- looks up the operation in the current default manifest
- throws when no published capability entry exists for the supplied name

### `listRuntimeOperationCapabilities(options?)`

Returns a copy of the published operation list.

Behavior:

- returns all operations when no filter is provided
- supports `options.intentSupport` to filter by `planner_supported` or `runtime_only`

### `plannerSupportedRuntimeOperations`

Exports the current list of operation names whose `intent_support` is `planner_supported`.

Use this when a caller needs the names only rather than the full capability records.

## Validation helpers

### `assertValidRuntimeCapabilityManifest(manifest)`

Throws if a payload fails the published manifest schema.

### `isValidRuntimeCapabilityManifest(manifest)`

Returns `true` when a payload satisfies the published manifest schema.

## Public types and constants

The package re-exports:

- `RuntimeCapabilityManifest`
- `RuntimeOperationCapability`
- `RuntimeOperationName`
- `RuntimeOperationCategory`
- `RuntimeIntentSupport`
- `RuntimeTargetScope`
- `RuntimeChannelRequirements`
- `RuntimeParameterSpec`
- `RuntimeParameterValueType`
- `CONTRACT_SCHEMA_VERSION`

These types and constants describe the published capability surface only. They do not imply execution support outside what the manifest itself declares.

## Current limitations

- the module publishes a static snapshot rather than runtime-discovered state
- operation entries describe the supported contract surface, not low-level FFmpeg implementation details
- the manifest can include runtime-available operations that the baseline planner still does not select automatically
