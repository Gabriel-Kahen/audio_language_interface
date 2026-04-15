# Repository Map

This file explains the purpose of the current top-level scaffolding so new agents and human contributors can orient themselves quickly.

## Root files

- `README.md`: project overview, pipeline summary, and repository layout.
- `AGENTS.md`: repository-wide rules for all implementation agents.
- `package.json`: root workspace manifest and shared scripts for linting, tests, typechecking, and schema validation.
- `pnpm-workspace.yaml`: workspace package boundaries for `modules/*` and `contracts`.
- `tsconfig.base.json`: shared TypeScript compiler baseline for workspace packages.
- `tsconfig.json`: root no-emit TypeScript entry used by `pnpm typecheck`.
- `vitest.config.ts`: root test discovery rules for module tests and integration tests.
- `biome.json`: repository formatting and lint configuration.

## Top-level documentation

- `docs/architecture.md`: module map, canonical pipeline, and module boundary rules.
- `docs/implementation-plan.md`: dependency order, parallelization guidance, and rollout plan for agents.
- `docs/roadmap.md`: multi-phase roadmap beyond the current implementation slice.
- `docs/phase-1-roadmap.md`: current product and engineering delivery roadmap.
- `docs/phase-2-plan.md`: detailed execution plan for the next capability wave.
- `docs/agent-assignments.md`: current agent ownership map across roadmap tasks.
- `docs/current-capabilities.md`: implemented repository scope and current limitations.
- `docs/contributor-guide.md`: contributor onboarding, happy-path workflow, validation, and extension guidance.
- `docs/dependency-policy.md`: allowed dependency and license guidance for the repo.
- `docs/system-dependencies.md`: required external tools and installation posture.
- `docs/repository-map.md`: purpose of the current scaffolding files.

## Contracts

- `contracts/schemas/README.md`: index and conventions for cross-module contracts.
- `contracts/schemas/*.md`: field-level schema specs for canonical pipeline artifacts.
- `contracts/schemas/json/README.md`: conventions for machine-readable JSON Schema files.
- `contracts/schemas/json/common.schema.json`: shared reusable JSON Schema definitions.
- `contracts/schemas/json/*.schema.json`: machine-readable validation contracts for each artifact family.
- `contracts/examples/README.md`: conventions for example payloads.
- `contracts/examples/*.json`: minimal example payloads for each contract.

## Scripts

- `scripts/validate-schemas.mjs`: validates each artifact JSON Schema against the same-named example payload in `contracts/examples/`.

## Shared fixtures and tests

- `fixtures/audio/README.md`: fixture policy for shared audio samples.
- `tests/integration/README.md`: expectations for cross-module integration tests.

## Modules

Each module directory under `modules/` currently has four responsibilities:

- `agents.md`: ownership, scope, and module boundary rules.
- `docs/overview.md`: initial API surface, source file map, dependencies, and test expectations.
- `src/`: implementation area for the module.
- `tests/`: unit tests owned by the module.

## Current state

The repository is no longer only a scaffold.

It now includes implemented runtime modules for `core`, `io`, `analysis`, `semantics`, `planning`, `transforms`, `render`, `compare`, `history`, `tools`, and `orchestration`, plus root validation tooling and published contracts.

`modules/benchmarks` now includes a first benchmark harness for the initial prompt family, but it is still synthetic-first and not yet driven by committed real audio fixtures.

At the root level, contributors should expect most day-to-day validation to happen through the shared `pnpm` scripts rather than through bespoke per-module shell commands.
