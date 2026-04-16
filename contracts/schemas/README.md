# Schemas

This directory is reserved for versioned cross-module schemas.

Every schema should define a stable, serialized contract that can be used across modules and tool boundaries.

Each contract family is represented in three places:

- `contracts/schemas/<artifact>.md`: human-readable intent, field semantics, and contract notes.
- `contracts/schemas/json/<artifact>.schema.json`: machine-readable JSON Schema used by tooling.
- `contracts/examples/<artifact>.json`: a minimal valid example payload.

All three should change together when the contract changes.

Common conventions:

- Every artifact includes `schema_version`.
- IDs are explicit and stable within a session.
- Initial artifact IDs should use stable prefixed forms such as `asset_`, `ver_`, `analysis_`, `semantic_`, `plan_`, `transform_`, `render_`, `compare_`, `session_`, `toolreq_`, `transientmap_`, and `slicemap_`.
- Timestamps use ISO 8601 UTC strings.
- Paths or storage references are explicit and never implied.
- Optional fields should be omitted when unknown. Do not use `null` unless the contract explicitly allows it.
- Local file paths in v1 contracts should be stored as workspace-relative POSIX-style paths.
- Contract versions are versioned per artifact family. The initial published version is `1.0.0` for all current schemas.

Expected schema families include:

- `audio-asset`
- `audio-version`
- `analysis-report`
- `transient-map`
- `tempo-estimate`
- `slice-map`
- `semantic-profile`
- `edit-plan`
- `transform-record`
- `render-artifact`
- `comparison-report`
- `session-graph`
- `tool-request`
- `tool-response`

Each schema should be stable, documented, and accompanied by at least one example payload under `contracts/examples/`.

## Current specs

- `audio-asset.md`
- `audio-version.md`
- `analysis-report.md`
- `tempo-estimate.md`
- `semantic-profile.md`
- `edit-plan.md`
- `transform-record.md`
- `render-artifact.md`
- `comparison-report.md`
- `session-graph.md`
- `tool-request.md`
- `tool-response.md`
- `load-audio-tool.md`
- `analyze-audio-tool.md`
- `apply-edit-plan-tool.md`
- `render-preview-tool.md`
- `compare-versions-tool.md`

## Machine-readable schemas

Machine-readable JSON Schema definitions live under `contracts/schemas/json/`.

- `common.schema.json`
- `<artifact>.schema.json` for each canonical contract

## Validation workflow

Run `pnpm validate:schemas` after editing a schema spec, JSON Schema, or example payload.

The validator currently:

- loads every `*.schema.json` file in `contracts/schemas/json/` except `common.schema.json`,
- looks for a same-named example payload in `contracts/examples/`,
- validates the example against the schema with `Ajv` and `ajv-formats`,
- and exits non-zero if any pair fails validation.

This means each artifact schema should always have a matching example file with the same base name.
