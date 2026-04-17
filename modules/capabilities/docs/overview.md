# Capabilities Overview

## Purpose

Publish the shared `RuntimeCapabilityManifest` that describes the current deterministic audio runtime.

This module is the formal bridge between the `Audio Runtime` and the `Intent Layer`.

## Public API surface

- `defaultRuntimeCapabilityManifest`
- `listRuntimeOperationCapabilities(options?)`
- `getRuntimeOperationCapability(name)`
- `assertValidRuntimeCapabilityManifest(manifest)`
- `isValidRuntimeCapabilityManifest(manifest)`

## Dependencies

- `contracts/schemas/runtime-capability-manifest.md`
- `contracts/schemas/json/runtime-capability-manifest.schema.json`

## Downstream consumers

- `modules/planning`
- `modules/tools`
- `modules/transforms`
- repo-level docs

## Non-goals

- executing operations
- deriving semantic intent
- choosing planner defaults dynamically at runtime

## Current behavior

- publishes the current runtime operation inventory as a static validated manifest
- marks which operations are baseline-planner-supported versus runtime-only
- describes target-scope support, channel constraints, and parameter surfaces in a machine-readable shape

## Test expectations

- validate the manifest against the published schema
- verify lookup helpers return stable capability entries
- keep operation taxonomy aligned with the runtime contract surface
