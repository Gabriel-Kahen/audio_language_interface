# Repository Agent Guide

This repository is being built by multiple LLM agents working in parallel.

Every agent must optimize for modularity, explicit contracts, and future maintainability.

## Project intent

This project is an audio manipulation platform for LLMs.

It is not a music creation product and not a DAW clone. The core objective is to let language models inspect sound, reason about requested changes, apply deterministic audio edits, and verify whether the output moved toward the request.

## Required reading order

1. Read this file.
2. Read `docs/architecture.md`.
3. Read `docs/implementation-plan.md`.
4. Read `docs/dependency-policy.md`.
5. Read `docs/system-dependencies.md`.
6. Read the target module's local `agents.md`.
7. Read the target module's `docs/overview.md`.
8. Read the relevant contract specs under `contracts/schemas/`.

Do not start implementation before reading the local module guidance.

## Architectural rules

- Design every module to work independently and in the full pipeline.
- Prefer contract-first interfaces over implicit coupling.
- Keep module boundaries strict.
- Make state explicit.
- Keep transforms deterministic whenever possible.
- Keep data lineage inspectable and reversible.
- Favor small, composable interfaces over large, magical APIs.

## Module boundary rules

- A module may consume another module's published contract.
- A module must not reach into another module's private implementation details.
- Shared domain models belong in `modules/core`.
- Cross-module payload definitions belong under `contracts/`.
- End-to-end workflow logic belongs in `modules/orchestration`, not scattered across lower-level modules.

## Documentation rules

- Public functions, types, and entry points must be documented.
- Non-obvious design decisions must be written down in the module's `docs/` directory.
- If an interface changes, update the corresponding contract docs and examples in the same change.
- If a dependency decision changes, update `docs/dependency-policy.md` in the same change.
- Write documentation for both human contributors and future agents.

## Testing rules

- Each module owns its unit tests.
- Cross-module behavior belongs in `tests/integration` or `modules/benchmarks`.
- Avoid tests that depend on unrelated modules' private internals.
- Add fixtures or synthetic data only when they improve repeatability and clarity.

## Change rules

- Prefer minimal, local changes.
- Do not move responsibilities across modules without updating `docs/architecture.md` and the affected `agents.md` files.
- Do not add hidden fallback logic between modules.
- Do not bypass contracts to make modules "just work."

## Canonical pipeline artifacts

The pipeline should converge on a small set of canonical artifacts:

- `AudioAsset`: external or imported audio identity.
- `AudioVersion`: a concrete version of an asset after zero or more edits.
- `AnalysisReport`: measurable findings from signal inspection.
- `SemanticProfile`: interpretable descriptors derived from analysis.
- `EditPlan`: ordered, parameterized intended edits.
- `TransformRecord`: exact operations applied to produce a new version.
- `RenderArtifact`: preview or final exported output.
- `ComparisonReport`: measurable and semantic deltas between versions.
- `SessionGraph`: version graph and provenance history.
- `ToolRequest` and `ToolResponse`: external tool API payloads.

Use these names consistently unless there is a strong reason to change them.

## Definition of done

A module is not done when code exists. It is done when:

- its purpose is clear,
- its boundaries are respected,
- its contracts are explicit,
- its tests cover the expected behavior,
- and its documentation explains how other modules should use it.
