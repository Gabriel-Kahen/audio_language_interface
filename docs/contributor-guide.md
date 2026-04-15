# Contributor Guide

## Purpose

This guide is the first-slice onboarding path for human contributors and parallel agents.

Use it when you need to understand what the repository supports today, how to validate changes, and where new work should land.

## Current first slice

The repository currently supports one narrow workflow:

- import one local audio file
- analyze a materialized WAV version
- derive a conservative semantic profile
- plan a small, explicit edit plan for the current prompt family
- apply deterministic FFmpeg-backed edits
- render preview or export artifacts
- compare before and after
- record lineage in a session graph

The strongest supported prompt family today is tonal shaping and cleanup for short clips or loops:

- `darker`
- `less harsh`
- `slightly cleaner`
- `preserve punch`

See `docs/current-capabilities.md` for the precise implementation boundary.

## Read first

Read these files before changing code:

1. `AGENTS.md`
2. `docs/architecture.md`
3. `docs/implementation-plan.md`
4. `docs/phase-1-roadmap.md`
5. `docs/agent-assignments.md`
6. `docs/dependency-policy.md`
7. `docs/system-dependencies.md`
8. the target module's `agents.md`
9. the target module's `docs/overview.md`
10. the relevant contract specs under `contracts/schemas/`

## Local setup

1. Install Node `>=22` and `pnpm`.
2. Install `ffmpeg` and `ffprobe` on `PATH`.
3. Run `pnpm install` from the repository root.

System dependency details live in `docs/system-dependencies.md`.

## Validation loop

Run the shared root validation commands unless a module documents a narrower workflow:

```bash
pnpm validate:schemas
pnpm lint
pnpm typecheck
pnpm test
```

Or run the combined command:

```bash
pnpm run ci
```

See `docs/testing.md` for targeted module-local examples.

## Happy-path development flow

For the current end-to-end slice, the most useful module flow is:

1. `modules/io` imports a file and creates the initial `AudioAsset` and `AudioVersion`.
2. `modules/analysis` measures a WAV-backed `AudioVersion`.
3. `modules/semantics` maps evidence into a small descriptor set.
4. `modules/planning` emits a conservative `EditPlan` using only implemented transform operations.
5. `modules/transforms` applies the plan.
6. `modules/render` creates preview or export artifacts.
7. `modules/compare` evaluates deltas and regressions.
8. `modules/history` records lineage.
9. `modules/tools` and `modules/orchestration` expose the same flow through stable higher-level entrypoints.

Programmatic entrypoints worth starting from:

- `modules/orchestration/src/index.ts` for composed workflows
- `modules/tools/src/index.ts` for the LLM-facing tool surface
- `README.md` plus each module's `docs/api.md` for concrete callable APIs

## Extension points

Choose the smallest boundary that matches the change.

- Add or tighten shared payload structure in `contracts/schemas/` and `contracts/examples/` when a change crosses module boundaries.
- Extend one runtime module when behavior belongs clearly to that module's published responsibility.
- Add integration coverage in `tests/integration` when behavior depends on multiple modules.
- Add fixture docs in `fixtures/audio/README.md` or adjacent fixture notes when new shared audio assets are introduced.
- Update the relevant `docs/overview.md` and API docs in the same change when public behavior changes.

## Documentation upkeep rules

Keep these pairs aligned:

- `contracts/schemas/*.md`, `contracts/schemas/json/*.schema.json`, and `contracts/examples/*.json`
- root roadmap and capability docs with actual implemented scope
- module `docs/overview.md` files with the real exports and current limitations

If a behavior is not implemented yet, document it as a limitation rather than implying support.

## Current gaps contributors should not guess around

- no general multi-file workflow
- no streaming or byte-buffer import path
- analysis is WAV-only today
- transform coverage is intentionally small
- the tool surface does not expose `plan_edits` yet
- benchmarks exist, but they are still synthetic-first and not yet backed by committed real audio fixtures
- there is no dedicated demo CLI or app entrypoint yet
