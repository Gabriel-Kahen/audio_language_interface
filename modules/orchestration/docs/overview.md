# Orchestration Overview

## Purpose

Compose independent modules into useful end-to-end workflows without absorbing their responsibilities.

## Public API surface

- run a full request cycle from import or current version to comparison
- run partial flows for iterative refinement
- enforce workflow stopping and recovery policies

## Suggested initial source files

- `src/run-request-cycle.ts`: end-to-end workflow entrypoint
- `src/flows/import-and-analyze.ts`: ingest plus analysis path
- `src/flows/plan-and-apply.ts`: planning plus execution path
- `src/flows/render-and-compare.ts`: output and evaluation path
- `src/flows/iterative-refine.ts`: repeated adjustment loop
- `src/failure-policy.ts`: retry and recovery policy
- `src/index.ts`: public exports only

## Dependencies

- nearly all runtime modules
- stable contracts from `core`, `io`, `analysis`, `planning`, `transforms`, `render`, `compare`, and `history`

`orchestration` may be called by `tools`, but it does not depend on the `tools` module.

## Downstream consumers

- external services
- command-line or server entrypoints

## Non-goals

- replacing module-specific logic
- inventing alternate contracts
- storing hidden state outside published artifacts

## Test expectations

- verify happy-path workflow composition
- verify failure handling and partial recovery
- verify module contracts are respected at boundaries
- verify orchestration remains thin and explicit
