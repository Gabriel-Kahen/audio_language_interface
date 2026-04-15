# Testing

## Goal

Keep the repository easy to validate locally and in CI while preserving clear boundaries between schema validation, static checks, and runtime tests.

## Validation layers

The repository currently uses four main validation layers:

1. Schema validation
2. Lint and formatting checks
3. Type checking
4. Runtime tests

## Root commands

Run the full validation loop with:

```bash
pnpm run ci
```

This expands to:

```bash
pnpm validate:schemas
pnpm lint
pnpm typecheck
pnpm test
```

## What each command checks

### `pnpm validate:schemas`

- validates contract examples against the machine-readable JSON Schemas
- ensures cross-module payload examples stay in sync with published contracts

### `pnpm lint`

- runs `biome check .`
- enforces formatting, import organization, and selected static rules

### `pnpm typecheck`

- runs the workspace TypeScript check from the root `tsconfig.json`
- catches cross-module typing and package-surface drift

### `pnpm test`

- runs the Vitest suite across module-local tests and integration tests
- the current suite covers runtime modules, integration flows, and benchmark scaffolding

## Module-local testing

You can run targeted checks while working inside one module.

Examples:

```bash
pnpm exec vitest run modules/analysis/tests/analyze-audio.test.ts
pnpm exec vitest run modules/render/tests/render.test.ts
pnpm exec tsc -p modules/core/tsconfig.json --noEmit
pnpm exec biome check modules/transforms
```

## Test organization

- `modules/<name>/tests`: unit and module-local behavior
- `tests/integration`: cross-module workflows
- `contracts/examples`: contract examples validated by schema checks

The current repository state includes expanded Phase 2 coverage around:

- dynamics transforms (`compressor`, `limiter`)
- width and denoise behavior
- repeated request-cycle behavior
- compare-layer regression logic

## Thoroughness standard

The repository should prefer overlapping validation layers rather than relying on one large end-to-end test alone.

For meaningful behavior changes, the expected stack is:

1. contract validation where payload structure changes
2. unit tests in the owning module
3. integration coverage when a workflow crosses module boundaries
4. fixture-backed tests when real audio behavior matters
5. benchmark updates when the change affects product-quality directional outcomes

No single layer should be treated as sufficient by itself for Phase 2 work.

## Phase 2 testing expectations

Phase 2 work should be held to a stricter test standard than the initial Phase 1 slice.

### Transform additions

Each new transform should add:

- parameter validation tests
- command or execution-shape tests
- deterministic behavior tests
- fixture-backed output verification when practical
- compare-layer regression tests for likely failure modes

### Prompt-handling changes

Prompt interpretation changes should add:

- supported prompt tests
- ambiguity tests
- unsupported-request tests
- safety-bound tests showing the planner stays conservative

### Orchestration changes

Orchestration changes should add:

- repeated-edit integration tests
- undo or revert tests where relevant
- partial-failure tests
- provenance and active-ref assertions in `SessionGraph`

### Semantic changes

Semantic changes should add:

- threshold-boundary tests
- conflicting-evidence tests
- unresolved-term tests
- summary-language tests where wording depends on confidence

## Test matrix for Phase 2 readiness

Before considering a Phase 2 track complete, contributors should be able to point to:

- contract coverage for any changed payloads
- unit coverage in the owner modules
- at least one integration path showing the capability in the full pipeline where applicable
- updated docs describing supported scope and limitations

## CI behavior

GitHub Actions runs the same root validation flow used locally.

Current CI steps:

1. checkout
2. setup Node and pnpm
3. install system `ffmpeg`
4. install workspace dependencies
5. run `pnpm ci`

## System dependency note

Some modules rely on `ffmpeg` and `ffprobe` for analysis, render, import, or transform behavior. Local contributors and CI must have those tools available on `PATH`.

See `docs/system-dependencies.md` for the full system dependency policy.
