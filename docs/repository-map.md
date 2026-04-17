# Repository Map

This file explains the purpose of the current top-level scaffolding so new agents and human contributors can orient themselves quickly.

## Root Files

- `README.md`: project overview, architectural grouping, and repository layout.
- `AGENTS.md`: repository-wide rules for all implementation agents.
- `package.json`: root workspace manifest and shared scripts for linting, tests, typechecking, and schema validation.
- `pnpm-workspace.yaml`: workspace package boundaries for `modules/*` and `contracts`.
- `tsconfig.base.json`: shared TypeScript compiler baseline and workspace path aliases.
- `tsconfig.json`: root no-emit TypeScript entry used by `pnpm typecheck`.
- `vitest.config.ts`: root test discovery rules for module tests and integration tests.
- `biome.json`: repository formatting and lint configuration.

## Top-Level Documentation

- `docs/architecture.md`: layered architecture map for shared/foundation, runtime, intent, adapters, and evaluation.
- `docs/implementation-plan.md`: dependency order, cross-layer boundary rules, and rollout plan for agents.
- `docs/roadmap.md`: medium-term roadmap beyond the current implementation slice.
- `docs/phase-1-roadmap.md`: first-slice delivery roadmap.
- `docs/phase-2-plan.md`: next capability wave and execution plan.
- `docs/agent-assignments.md`: current agent ownership map across roadmap tasks.
- `docs/current-capabilities.md`: implemented repository scope and current limitations.
- `docs/contributor-guide.md`: contributor onboarding, validation, and extension guidance.
- `docs/dependency-policy.md`: allowed dependency and license guidance for the repo.
- `docs/system-dependencies.md`: required external tools and installation posture.
- `docs/repository-map.md`: purpose of the current scaffolding files.

## Contracts

- `contracts/schemas/README.md`: index and conventions for cross-module contracts.
- `contracts/schemas/*.md`: human-readable contract specs for canonical artifacts and tool payloads.
- `contracts/schemas/json/README.md`: conventions for machine-readable JSON Schema files.
- `contracts/schemas/json/common.schema.json`: shared reusable JSON Schema definitions.
- `contracts/schemas/json/*.schema.json`: machine-readable validation contracts.
- `contracts/examples/README.md`: conventions for example payloads.
- `contracts/examples/*.json`: minimal valid example payloads for each contract.

## Scripts

- `scripts/validate-schemas.mjs`: validates every published schema/example pair and now preloads cross-schema references.

## Shared Fixtures And Tests

- `fixtures/audio/README.md`: fixture policy for shared audio samples.
- `tests/integration/README.md`: expectations for cross-module integration tests.

## Modules

The `modules/` directory is intentionally layered:

- shared/foundation: `core`, `history`, `capabilities`
- audio runtime: `io`, `analysis`, `transforms`, `render`, `compare`
- intent: `semantics`, `planning`
- adapters: `tools`, `orchestration`
- evaluation: `benchmarks`

Each module directory has four responsibilities:

- `agents.md`: ownership, scope, and module boundary rules.
- `docs/overview.md`: public surface, dependencies, and test expectations.
- `src/`: implementation area for the module.
- `tests/`: unit tests owned by the module.

## Current State

The repository is no longer only a scaffold.

It includes a real runtime, an intent layer, explicit capability metadata, adapter surfaces, published contracts, and a shared validation loop.

At the root level, contributors should expect most day-to-day validation to happen through the shared `pnpm` scripts rather than bespoke per-module shell commands.
