# Contributor Guide

## Purpose

This guide is the onboarding path for human contributors and parallel agents.

Use it when you need to understand what the repository supports today, how to validate changes, and where new work should land.

## Current Slice

The repository currently supports one real, inspectable single-file editing workflow:

- import one local audio file
- analyze a materialized WAV version
- derive a conservative semantic profile
- plan a small, explicit edit plan against the published runtime capability manifest
- apply deterministic FFmpeg-backed edits
- render preview or export artifacts
- compare before and after
- record lineage in a session graph

The strongest supported prompt family today is conservative tonal shaping, loudness, cleanup, and dynamics work for short clips or loops:

- `darker`
- `less harsh`
- `slightly cleaner`
- `preserve punch`
- `normalize`
- `airier`, `warmer`, `less muddy`, or `less harsh ring`
- `tame sibilance`
- `remove 50 Hz hum` or `remove 60 Hz hum`
- `clean up clicks`
- `more controlled`
- `control peaks`

See `docs/current-capabilities.md` for the exact implementation boundary.

## Read First

Read these files before changing code:

1. `AGENTS.md`
2. `docs/architecture.md`
3. `docs/implementation-plan.md`
4. `docs/current-capabilities.md`
5. `docs/dependency-policy.md`
6. `docs/system-dependencies.md`
7. the target module's `agents.md`
8. the target module's `docs/overview.md`
9. the relevant contract specs under `contracts/schemas/`

## Local Setup

1. Install Node `>=22` and `pnpm`.
2. Install `ffmpeg` and `ffprobe` on `PATH`.
3. Run `pnpm install` from the repository root.

System dependency details live in `docs/system-dependencies.md`.

## Validation Loop

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

## Happy-Path Development Flow

For the current end-to-end slice, think in layers:

1. shared/foundation prepares canonical artifacts and capability metadata through `modules/core`, `modules/history`, and `modules/capabilities`
2. the audio runtime imports, analyzes, executes, renders, and compares through `modules/io`, `modules/analysis`, `modules/transforms`, `modules/render`, and `modules/compare`
3. the intent layer interprets and plans through `modules/semantics` and `modules/planning`
4. adapters expose or compose the flow through `modules/tools` and `modules/orchestration`

Programmatic entrypoints worth starting from:

- `modules/orchestration/src/index.ts` for composed workflows
- `modules/tools/src/index.ts` for the LLM-facing tool surface
- `modules/capabilities/src/index.ts` for the runtime capability manifest

## Extension Points

Choose the smallest boundary that matches the change.

- Add or tighten shared payload structure in `contracts/schemas/` and `contracts/examples/` when a change crosses module boundaries.
- Extend one runtime or intent module when behavior belongs clearly to that module's published responsibility.
- Add integration coverage in `tests/integration` when behavior depends on multiple modules.
- Update the relevant `docs/overview.md` and API docs in the same change when public behavior changes.

## Documentation Upkeep Rules

Keep these aligned:

- `contracts/schemas/*.md`, `contracts/schemas/json/*.schema.json`, and `contracts/examples/*.json`
- root capability docs and actual implemented scope
- module `docs/overview.md` files with the real exports and current limitations

If a behavior is not implemented yet, document it as a limitation rather than implying support.

## Current Gaps Contributors Should Not Guess Around

- no general multi-file workflow
- no streaming or byte-buffer import path
- analysis is WAV-only today
- semantic descriptor coverage is intentionally small
- not every runtime operation is baseline-planner-supported
- benchmarks exist, but they are still synthetic-first and not yet backed by committed real audio fixtures
- there is no dedicated demo CLI or app entrypoint yet
