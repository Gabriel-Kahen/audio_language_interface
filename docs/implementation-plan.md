# Implementation Plan

## Goal

Enable multiple agents to implement modules in parallel without drifting on architecture, contracts, or ownership.

## Current status

The repository now has:

- a root agent guide,
- module ownership docs,
- module overview docs,
- canonical contract specs with examples,
- dependency and system dependency policy docs,
- and a root TypeScript and pnpm workspace foundation.

That is enough to begin contract-aligned implementation work.

At repository level, the shared validation loop is:

- `pnpm validate:schemas`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

Agents should use these root commands unless a module introduces a narrower documented workflow.

## Global prerequisite

The initial global runtime decisions are now provisionally set:

- programming language: `TypeScript`
- package manager and workspace layout: `pnpm` workspace
- schema validation approach: `JSON Schema` plus `Ajv`
- testing framework: `Vitest`
- formatting and linting: `Biome`
- baseline runtime-support dependencies: `execa`, `music-metadata`, `wavefile`, and `meyda`

Agents should still avoid introducing alternative stack choices without updating the root policy docs first.

## Agent reading packet

Every implementation agent should read, in order:

1. `AGENTS.md`
2. `docs/architecture.md`
3. `docs/implementation-plan.md`
4. `docs/dependency-policy.md`
5. `docs/system-dependencies.md`
6. `modules/<target>/agents.md`
7. `modules/<target>/docs/overview.md`
8. the relevant specs under `contracts/schemas/`
9. the matching example payloads under `contracts/examples/`

## Dependency graph

### Foundation modules

- `core` has no module dependency and should land first.
- `io` depends on `core`.
- `history` depends on `core`.

### Measurement and execution modules

- `analysis` depends on `core` and `io`.
- `transforms` depends on `core` and usually consumes `planning` contracts, but can begin with direct parameter execution first.
- `render` depends on `core` and `io`.
- `compare` depends on `core`, `analysis`, and `render` contracts.

### Reasoning modules

- `semantics` depends on `analysis`.
- `planning` depends on `analysis`, `semantics`, `core`, and transform contract definitions.

### External interface modules

- `tools` depends on stable contracts from `core`, `io`, `analysis`, `planning`, `transforms`, `render`, `compare`, and `history`.
- `orchestration` depends on nearly every runtime module and should stay thin.
- `benchmarks` depends on whatever modules it evaluates, but can begin earlier with dataset and scoring scaffolding.

## Parallelization plan

### Phase 0: Repository foundation

Phase 0 now means finishing implementation details on top of the chosen baseline:

- create the remaining machine-readable schema tooling,
- add per-package manifests as modules begin implementation,
- wire CI once executable code exists,
- and keep dependency and system dependency docs current.

### Phase 1: Parallel-safe first wave

These modules can begin first after Phase 0 is clear:

- `modules/core`
- `modules/io`
- `modules/history`
- `modules/render`
- `modules/analysis`

These agents should focus on published contracts, local tests, and module docs before cross-module integrations.

### Phase 2: Execution and evaluation

Start these once Phase 1 contracts settle:

- `modules/transforms`
- `modules/compare`
- `modules/benchmarks`

`transforms` may define execution internals earlier, but it should not force plan semantics upstream.

### Phase 3: Reasoning and interface

Start these when analysis and transform contracts are stable:

- `modules/semantics`
- `modules/planning`
- `modules/tools`

### Phase 4: Full pipeline composition

Start `modules/orchestration` after the lower-level modules have stable public APIs.

## Agent assignment guidance

Give each agent exactly one module as its owner.

Each module agent should be responsible for:

- keeping changes inside its module unless a contract update is required,
- updating docs and tests with code changes,
- and proposing cross-module contract changes instead of reaching into another module.

Use a separate coordination agent, or a human maintainer, for:

- resolving contract disputes,
- approving shared schema changes,
- sequencing cross-module integration work,
- and enforcing naming consistency.

## Definition of ready for a module agent

A module is ready for independent implementation when the agent has:

- a clear ownership document,
- a module overview with suggested source files,
- the contracts it produces and consumes,
- and clear non-goals.

Every runtime module now meets that bar at the design level.

## Remaining coordination risks

- transform parameter conventions may evolve with early implementation,
- and semantics or planning language may need revision after real analysis outputs exist.

These are normal. They should be handled through contract updates, not hidden coupling.
