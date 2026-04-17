# Architecture

## Design Principles

- Independent modules first, integrated workflows second.
- Contract-first interfaces.
- Deterministic execution where possible.
- Explicit lineage and reversible state.
- Measurable outputs at every stage.
- Adapters stay thin.
- Intent should plan against published capabilities, not runtime internals.

## Architectural Groups

### Shared/Foundation

#### `contracts`

Owns published cross-module schemas and examples.

#### `modules/core`

Owns canonical shared domain models, identifiers, and validation helpers.

#### `modules/history`

Owns provenance, session graphs, branching, undo, and revert state.

#### `modules/capabilities`

Owns the published `RuntimeCapabilityManifest` and shared runtime operation metadata.

This module is the bridge between the audio runtime and the intent layer.

### Audio Runtime

#### `modules/io`

Owns audio ingestion, decoding, normalization, and import/export-adjacent file handling.

#### `modules/analysis`

Owns measurable signal inspection. It answers what is present in the audio without deciding what to change.

#### `modules/transforms`

Owns deterministic audio edits and effect execution using explicit parameters.

#### `modules/render`

Owns preview generation, export rendering, and render metadata.

#### `modules/compare`

Owns before/after comparison, metric deltas, regression detection, and goal-alignment checks.

### Intent Layer

#### `modules/semantics`

Owns translation from measurable facts into interpretable descriptors with confidence and rationale.

#### `modules/planning`

Owns conversion from user intent plus current audio state into an ordered, parameterized `EditPlan`.

`planning` must plan against the published runtime capability manifest rather than against `modules/transforms` implementation details.

### Adapters

#### `modules/tools`

Owns the stable tool surface for external LLM callers. It exposes runtime and intent capabilities without redefining them.

#### `modules/orchestration`

Owns thin end-to-end workflow composition across runtime and intent modules.

### Evaluation

#### `modules/benchmarks`

Owns prompt suites, datasets, scoring harnesses, and repeatable evaluation workflows.

## Primary Workflow

The current natural-language editing workflow is:

1. `io` creates or validates an `AudioAsset` and initial `AudioVersion`.
2. `analysis` produces an `AnalysisReport`.
3. `semantics` produces a `SemanticProfile`.
4. `planning` produces an `EditPlan`, grounded in a published `RuntimeCapabilityManifest`.
5. `transforms` executes the plan and emits a `TransformRecord` plus a new `AudioVersion`.
6. `render` generates a `RenderArtifact`.
7. `compare` produces a `ComparisonReport`.
8. `history` records lineage into a `SessionGraph`.
9. `tools` and `orchestration` expose and compose the above for external callers.

That workflow is important, but it is not the same thing as the architecture. The repo is organized by responsibility boundaries first, not by one flat pipeline.

## Dependency Rules

- Shared/foundation modules sit below the other groups.
- Runtime does not depend on intent.
- Intent can consume runtime artifacts and capability metadata.
- Intent must not depend on runtime execution internals.
- Adapters can depend on both runtime and intent.
- Benchmarks may depend on whatever they evaluate, but they should not become hidden production logic.

## Capability Boundary

`RuntimeCapabilityManifest` exists to keep the most important LLM boundary explicit:

- what the runtime can execute
- which target scopes are valid
- what parameter surfaces exist
- which operations are planner-supported today

This avoids burying capability discovery inside runtime code or adapter-specific TypeScript types.

## Independence Requirement

Every module must remain usable on its own.

Examples:

- `analysis` should analyze an audio version without the planner.
- `transforms` should execute explicit operations without the tool layer.
- `planning` should emit an explicit plan without calling FFmpeg.
- `compare` should compare versions or renders without orchestration.
- `history` should track provenance regardless of how artifacts were produced.

## Canonical Contracts

The repository publishes these core artifact families under `contracts/schemas/` and `contracts/examples/`:

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
- `RuntimeCapabilityManifest`

Modules should communicate through those artifacts rather than through ad hoc internal objects.

## Suggested Implementation Order

1. shared contracts and foundation
   - `contracts`
   - `modules/core`
   - `modules/history`
   - `modules/capabilities`
2. audio runtime
   - `modules/io`
   - `modules/analysis`
   - `modules/transforms`
   - `modules/render`
   - `modules/compare`
3. intent layer
   - `modules/semantics`
   - `modules/planning`
4. adapters
   - `modules/tools`
   - `modules/orchestration`
5. evaluation
   - `modules/benchmarks`

## Repository Conventions

- `modules/<name>/src` contains implementation.
- `modules/<name>/tests` contains module-local tests.
- `modules/<name>/docs` contains public design and usage notes.
- `modules/<name>/agents.md` defines module ownership and rules.
- `tests/integration` contains cross-module workflow tests.
- `fixtures/audio` contains shared sample audio and fixture documentation.

## Open Source Posture

The repository should be understandable to a contributor who did not participate in the initial design. Favor explicit docs, stable naming, and narrow interfaces over clever shortcuts.
