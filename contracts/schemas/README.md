# Schemas

This directory is reserved for versioned cross-module schemas.

Every schema should define a stable serialized contract that can be used across modules and adapter boundaries.

Each contract family is represented in three places:

- `contracts/schemas/<artifact>.md`: human-readable intent, field semantics, and notes.
- `contracts/schemas/json/<artifact>.schema.json`: machine-readable JSON Schema used by tooling.
- `contracts/examples/<artifact>.json`: a minimal valid example payload.

All three should change together when the contract changes.

## Common Conventions

- every artifact includes `schema_version`
- IDs are explicit and stable within a session
- timestamps use ISO 8601 UTC strings
- paths and storage refs are explicit and never implied
- optional fields should be omitted when unknown
- local file paths in v1 contracts should be stored as workspace-relative POSIX-style paths

## Current Artifact Families

- `audio-asset`
- `audio-version`
- `analysis-report`
- `pitch-center-estimate`
- `loop-boundary-suggestion-set`
- `transient-map`
- `tempo-estimate`
- `slice-map`
- `semantic-profile`
- `intent-interpretation`
- `edit-plan`
- `runtime-capability-manifest`
- `transform-record`
- `render-artifact`
- `comparison-report`
- `session-graph`
- `tool-request`
- `tool-response`

## Current Tool Contract Specs

- `load-audio-tool`
- `analyze-audio-tool`
- `plan-edits-tool`
- `interpret-request-tool`
- `apply-edit-plan-tool`
- `describe-runtime-capabilities-tool`
- `render-preview-tool`
- `compare-versions-tool`
- `run-request-cycle-tool`

## Machine-Readable Schemas

Machine-readable JSON Schema definitions live under `contracts/schemas/json/`.

- `common.schema.json`
- `<artifact>.schema.json` for each published artifact or tool payload

## Validation Workflow

Run `pnpm validate:schemas` after editing a schema spec, JSON Schema, or example payload.

The validator:

- loads every `*.schema.json` file in `contracts/schemas/json/` except `common.schema.json`
- preloads published schemas so cross-schema refs resolve cleanly
- looks for a same-named example payload in `contracts/examples/`
- validates the example against the schema with `Ajv` and `ajv-formats`
- exits non-zero if any pair fails validation
