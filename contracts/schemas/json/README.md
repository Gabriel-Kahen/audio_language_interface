# JSON Schemas

This directory contains the machine-readable contract definitions for the repository.

Guidelines:

- Every schema targets JSON Schema 2020-12.
- Every schema is versioned independently through `schema_version`.
- The current published baseline is `1.0.0` for all artifact families.
- Shared definitions live in `common.schema.json`.
- Markdown specs in the parent directory remain the human-readable source of intent and context.

## File layout

- `common.schema.json` contains reusable definitions shared across artifact schemas.
- `<artifact>.schema.json` contains one top-level artifact contract and should stay paired with:
  - `../<artifact>.md`
  - `../../examples/<artifact>.json`

## Validation behavior

`scripts/validate-schemas.mjs` reads this directory, skips `common.schema.json`, and validates every remaining schema against the same-named example payload under `contracts/examples/`.

When adding a new contract family, add all three files before relying on `pnpm validate:schemas` to pass.
