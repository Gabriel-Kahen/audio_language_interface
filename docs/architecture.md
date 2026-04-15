# Architecture

## Design principles

- Independent modules first, integrated pipeline second.
- Contract-first interfaces.
- Deterministic execution where possible.
- Explicit lineage and reversible state.
- Measurable outputs at every stage.
- Documentation as part of the implementation, not an afterthought.

## Module map

### `modules/core`

Owns canonical shared domain models, identifiers, and common result envelopes used across the platform.

### `modules/io`

Owns audio ingestion, decoding, validation, normalization, and export-adjacent file handling.

### `modules/analysis`

Owns measurable signal inspection. It should answer what is present in the audio without deciding what to change.

### `modules/semantics`

Owns translation from measurable facts into interpretable descriptors like `bright`, `muddy`, `wide`, or `clipped`, with confidence and rationale.

### `modules/planning`

Owns conversion from user intent plus current audio state into an ordered, parameterized edit plan.

### `modules/transforms`

Owns deterministic audio edits and effect execution using explicit parameters.

### `modules/render`

Owns preview generation, export rendering, and render metadata.

### `modules/compare`

Owns before/after comparison, metric deltas, semantic deltas, and regression detection.

### `modules/history`

Owns version graphs, snapshots, branching, undo, redo, and provenance tracking.

### `modules/tools`

Owns the LLM-facing tool surface. It adapts internal modules into stable tool calls and responses.

### `modules/orchestration`

Owns end-to-end workflow coordination. It composes modules into a pipeline without absorbing their responsibilities.

### `modules/benchmarks`

Owns quality evaluation datasets, prompt suites, scoring harnesses, and repeatable benchmark workflows.

## Canonical pipeline

The primary pipeline is:

1. `io` creates or validates an `AudioAsset` and initial `AudioVersion`.
2. `analysis` produces an `AnalysisReport`.
3. `semantics` produces a `SemanticProfile`.
4. `planning` produces an `EditPlan`.
5. `transforms` executes the plan and emits a `TransformRecord` plus a new `AudioVersion`.
6. `render` generates a `RenderArtifact`.
7. `compare` produces a `ComparisonReport`.
8. `history` records the lineage into a `SessionGraph`.
9. `tools` and `orchestration` expose and coordinate the above steps for external callers.

## Independence requirement

Every module must also be usable on its own.

Examples:

- `analysis` should be able to analyze an audio version without the planner.
- `transforms` should be able to apply an effect chain without the LLM tool layer.
- `compare` should be able to compare two renders without the orchestrator.
- `history` should track versions regardless of how they were produced.

## Contract boundaries

The repository should eventually define structured contracts for these artifacts under `contracts/schemas/` and example payloads under `contracts/examples/`:

- `AudioAsset`
- `AudioVersion`
- `AnalysisReport`
- `SemanticProfile`
- `EditPlan`
- `TransformRecord`
- `RenderArtifact`
- `ComparisonReport`
- `SessionGraph`
- `ToolRequest`
- `ToolResponse`

Modules should communicate through those artifacts rather than ad hoc objects.

## Suggested implementation order

1. `core`
2. `io`
3. `analysis`
4. `transforms`
5. `render`
6. `compare`
7. `history`
8. `tools`
9. `planning`
10. `semantics`
11. `orchestration`
12. `benchmarks`

This order is not mandatory, but it gives the project a usable technical foundation before the higher-level reasoning layers are built out.

## Repository conventions

- `modules/<name>/src` contains implementation.
- `modules/<name>/tests` contains module-local tests.
- `modules/<name>/docs` contains design and usage notes.
- `modules/<name>/docs/overview.md` defines the initial public surface and expected file layout for that module.
- `modules/<name>/agents.md` defines the module's ownership and rules.
- `tests/integration` contains cross-module tests.
- `fixtures/audio` contains shared sample audio and fixture documentation.

## Open source posture

The repository should be understandable to a contributor who did not participate in the initial design. Favor explicit docs, stable naming, and narrow interfaces over clever shortcuts.
