# Implementation Plan

## Goal

Enable multiple agents to work in parallel without blurring the boundary between:

- shared/foundation contracts
- the audio runtime
- the intent layer
- adapter surfaces

## Current Baseline

The repository already has:

- root architecture and contributor docs
- module ownership docs
- published contracts and examples
- a root TypeScript + pnpm workspace
- a shared validation loop

Repository-level validation:

- `pnpm validate:schemas`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

## Global Decisions

- language: `TypeScript`
- workspace/package manager: `pnpm`
- schemas: `JSON Schema` + `Ajv`
- tests: `Vitest`
- formatting/linting: `Biome`
- baseline runtime libraries: `execa`, `music-metadata`, `wavefile`, `meyda`
- external runtime tools: `ffmpeg`, `ffprobe`

## Reading Packet

Every implementation agent should read, in order:

1. `AGENTS.md`
2. `docs/architecture.md`
3. `docs/implementation-plan.md`
4. `docs/dependency-policy.md`
5. `docs/system-dependencies.md`
6. `modules/<target>/agents.md`
7. `modules/<target>/docs/overview.md`
8. the relevant specs under `contracts/schemas/`
9. the matching examples under `contracts/examples/`

## Dependency Graph

### Shared/Foundation

- `contracts` has no module dependency
- `core` has no module dependency
- `history` depends on `core`
- `capabilities` depends on published contracts only

### Audio Runtime

- `io` depends on `core`
- `analysis` depends on `core` and `io`
- `transforms` depends on `core` and `capabilities`
- `render` depends on `core` and `io`
- `compare` depends on `core`, `analysis`, and render/runtime contracts

### Intent Layer

- `semantics` depends on `analysis`
- `planning` depends on `core`, `analysis`, `semantics`, and `capabilities`

### Adapters

- `tools` depends on stable contracts plus the published runtime and intent entrypoints
- `orchestration` depends on nearly all runtime and intent modules and must stay thin

### Evaluation

- `benchmarks` depends on whatever layers it evaluates

## Refactor Rule

When a change crosses the runtime/intent boundary, prefer adding or updating a published contract rather than adding a direct package dependency.

Current example:

- `planning` should depend on `modules/capabilities`, not on `modules/transforms`

## Parallelization Plan

### Phase 0: Shared Contract Stability

Focus:

- keep schemas and examples aligned
- keep capability metadata explicit
- keep root validation green

### Phase 1: Runtime Reliability

Start here when contracts are stable:

- `modules/io`
- `modules/analysis`
- `modules/transforms`
- `modules/render`
- `modules/compare`

### Phase 2: Intent Quality

Start when runtime artifacts and capability metadata are stable:

- `modules/semantics`
- `modules/planning`

### Phase 3: Adapter Hardening

Start when runtime and intent APIs are stable:

- `modules/tools`
- `modules/orchestration`

### Phase 4: Evaluation

Expand:

- `modules/benchmarks`
- `tests/integration`

## Agent Assignment Guidance

Give each implementation agent one coherent ownership area.

Module owners should:

- keep changes inside their module unless a contract update is required
- update docs and tests in the same change
- propose contract changes instead of reaching into another module's private code

Use a coordinator or maintainer for:

- shared contract approvals
- cross-layer dependency disputes
- sequencing larger integrations
- naming consistency

## Definition Of Ready

A module is ready for independent implementation when it has:

- a clear ownership doc
- a current overview doc
- the contracts it consumes and emits
- explicit non-goals

## Current Coordination Risks

- capability metadata can drift from runtime behavior if it is not updated in the same change
- semantic vocabulary can overreach the available analysis evidence
- planning can become too optimistic if it stops treating capability metadata as the authority
- adapters can blur into core logic if they grow hidden policy

Those risks should be handled through contract and doc updates, not hidden coupling.
