# Phase 2 Plan

## Purpose

This document records the current Phase 2 execution plan after the repository was split explicitly into shared/foundation, audio runtime, intent, adapters, and evaluation.

Phase 2 is no longer about proving the basic architecture. That split now exists in code, contracts, and docs. The job now is to make the current runtime and intent surfaces materially stronger for real LLM-driven editing.

## Current Baseline

The repository already includes:

- a published `RuntimeCapabilityManifest`
- capability-grounded planning that no longer imports runtime internals
- deterministic runtime support for a broad Layer 1 operation set spanning level, timing, tonal, dynamics/control, stereo/routing, restoration, and creative effects
- first-cohort `time_range` targeting for duration-preserving, channel-stable operations
- measurement-aware `normalize` execution with peak and integrated-loudness modes
- restoration primitives such as `de_esser`, `declick`, and `dehum`
- baseline analysis-side hum and click evidence in `AnalysisReport`, including explicit annotations and file-level artifact fields
- adapter-layer tool discovery through `describe_runtime_capabilities`
- schema-aligned `EditPlan` and `TransformRecord` artifacts that record `capability_manifest_id`
- fixture-backed cleanup benchmark coverage anchored to committed phase-1 WAV fixtures, even though the benchmark harness is still compare-driven rather than full request-cycle execution

That means Phase 2 should focus on reliability, verification quality, and honest planner coverage rather than on adding features for their own sake.

## Objective

Make the system substantially better at supported LLM-driven editing requests by improving:

1. runtime verification and comparison quality
2. prompt handling and planner coverage
3. semantic interpretation
4. orchestration behavior under repeated edits

The goal is a stronger editing loop, not a broader but less reliable feature matrix.

## Scope

### In Scope

- keeping runtime behavior aligned with the published capability manifest
- improving compare coverage for supported runtime transforms
- expanding planner support only where the capability manifest and semantic evidence justify it
- making unsupported and ambiguous prompt handling clearer
- improving repeated-edit workflows such as `more`, `less`, `undo`, and retry variants

### Explicitly Deferred

- `pitch_shift`
- multi-file workflows
- streaming or byte-buffer import as a new primary input mode
- broad generative or music-creation behavior

Those items widen the surface area substantially and should stay deferred until the current architecture is more mature.

## Product Outcome

At the end of this Phase 2 pass, the system should be materially better at requests such as:

- `make this loop darker and less harsh but keep the punch`
- `clean this sample up a bit`
- `make this a little tighter and more controlled`
- `widen this slightly without making it phasey`
- `speed this up a little without changing the pitch`

The system should still reject or clarify requests outside the supported scope instead of guessing.

## Workstreams

### Workstream A: Runtime And Compare Hardening

Owner modules:

- `modules/capabilities`
- `modules/transforms`
- `modules/render`
- `modules/compare`

Primary outcomes:

- tighter runtime/capability alignment
- explicit parameter shapes and safety limits
- better regression detection for transform-specific side effects

Detailed tasks:

1. Keep runtime capability metadata synchronized with actual runtime behavior.
2. Tighten parameter surfaces and safety limits where the runtime is already implemented.
3. Ensure `TransformRecord` captures the exact executed parameters and originating `capability_manifest_id` when available.
4. Extend `compare` to detect likely regressions such as:
   - over-compression
   - peak issues
   - loudness-target drift
   - stereo instability
   - excessive noise-reduction artifacts
   - unintended duration or loudness drift when applicable

Acceptance criteria:

- each supported runtime transform has unit tests and at least one fixture-backed test where practical
- the capability manifest describes runtime availability and planner support honestly
- the compare layer can reason about likely regressions introduced by supported runtime transforms

### Workstream B: Planner Coverage And Prompt Handling

Owner modules:

- `modules/planning`
- `modules/semantics`
- `modules/tools`

Primary outcomes:

- better handling of natural language inside the supported scope
- explicit unsupported and ambiguous pathways
- more conservative, interpretable plans

Detailed tasks:

1. Expand prompt parsing for the current supported request family.
2. Separate supported, ambiguous, and unsupported requests clearly.
3. Add explicit clarification or failure messages where the planner cannot safely proceed.
4. Keep prompt interpretation aligned with the published capability manifest rather than aspirational capabilities.
5. Expand planner support only for operations marked `planner_supported`.

Acceptance criteria:

- supported prompts map reliably to explicit plans
- ambiguous prompts surface clarification-worthy failure states
- unsupported prompts fail without hidden fallback behavior
- planner output records the correct `capability_manifest_id`

### Workstream C: Semantic Calibration

Owner modules:

- `modules/analysis`
- `modules/semantics`
- `modules/compare`

Primary outcomes:

- stronger evidence for brightness, harshness, cleanliness, width, punch, and control-related interpretation
- improved confidence handling and summary wording
- better semantic signals for planning and comparison

Detailed tasks:

1. Improve analysis-side evidence where current measurements are too weak.
2. Recalibrate descriptor thresholds using the current runtime capability surface in mind.
3. Improve conflicting-evidence handling.
4. Keep unresolved-term output explicit.
5. Align compare-layer semantic deltas with the same vocabulary.

Acceptance criteria:

- semantic outputs remain evidence-grounded
- summaries are useful but not overstated
- planning receives more trustworthy semantic input for supported prompts

### Workstream D: Iterative Orchestration

Owner modules:

- `modules/orchestration`
- `modules/history`
- `modules/tools`
- `tests/integration`

Primary outcomes:

- better repeated-edit workflows
- stronger partial-failure handling
- more useful session-state continuity

Detailed tasks:

1. Add repeated-edit flow coverage for `more`, `less`, and `undo`-style operations.
2. Ensure orchestration preserves session and provenance state across iterations.
3. Keep partial results valid and inspectable when a later stage fails.
4. Add integration tests that cover multiple cycles, not only a single request pass.
5. Ensure the tool layer can surface or support these flows cleanly where appropriate.

Acceptance criteria:

- repeated edit flows preserve valid history
- partial failures do not corrupt session state
- orchestration remains thin and composed from lower-level modules

## Milestones

### Milestone 1: Capability And Contract Alignment

Goal:

- eliminate drift between contracts, examples, capability metadata, and runtime behavior

Deliverables:

- capability-contract updates where needed
- synchronized examples
- test matrix and coverage expectations documented

### Milestone 2: Runtime And Compare Hardening

Goal:

- tighten the deterministic core that already exists and improve compare/regression logic around it

Deliverables:

- hardened transform behavior
- transform tests
- compare regressions and deltas for the supported runtime capabilities

### Milestone 3: Semantics And Planning Alignment

Goal:

- make semantics and planning use the runtime capability surface honestly without overreaching

Deliverables:

- improved prompt handling
- improved descriptor calibration
- safer plan generation for the planner-supported operation set

### Milestone 4: Iterative Orchestration

Goal:

- improve repeated editing flows over the stronger capability base

Deliverables:

- iterative refinement support
- stronger orchestration integration tests
- history assertions over repeated sessions

### Milestone 5: Hardening And Review

Goal:

- make the current Phase 2 additions trustworthy enough to serve as the new baseline

Deliverables:

- root validation remains green
- capability docs updated
- benchmark and integration expectations updated where applicable

## Module Breakdown

### `contracts`

- publish parameter shapes and examples for the supported runtime operations
- update tool contracts only where new tool-surface behavior is truly needed
- keep examples synchronized with supported behavior

### `analysis`

- improve evidence that informs compression, limiting, width, denoise, and time-domain semantics
- add or refine annotations that matter to planning and compare
- stay deterministic and measurable

### `semantics`

- improve descriptor calibration for the supported request family
- keep ambiguous and unresolved outcomes explicit
- avoid overstating confidence

### `planning`

- plan against `RuntimeCapabilityManifest`, not runtime internals
- expand support only when the operation is marked `planner_supported`
- improve explicit failure messaging for unsupported intent

### `transforms`

- keep deterministic execution strict
- document side effects and safe ranges
- ensure emitted records stay fully inspectable

### `compare`

- improve regression detection for supported runtime transforms
- tighten goal-alignment checks for the supported prompt family
- keep outputs useful to both planners and adapters

### `tools`

- keep the tool surface small, explicit, and schema-aligned
- expose capability discovery clearly
- surface capability mismatches and unsupported requests cleanly

### `orchestration`

- keep end-to-end flows explicit and thin
- support repeated-edit workflows without re-owning lower-level logic
- preserve valid session state even when later steps fail

### `benchmarks`

- add prompt cases when the capability is real enough to score honestly
- keep benchmark expectations aligned with supported planner and runtime behavior

## Testing Strategy

Current Phase 2 work should be more test-heavy than Phase 1.

### Required test layers

For any meaningful Phase 2 change, the expected validation stack is:

1. schema validation if contracts changed
2. module unit tests in the owning module
3. fixture-backed tests when audio behavior is material
4. integration tests when the workflow crosses module boundaries
5. benchmark updates when the change affects directional editing quality

### Non-Negotiable Rules

Current Phase 2 work should not:

- introduce hidden fallback logic across modules
- widen the product into music generation or DAW-like behavior
- add new runtime transforms without explicit planner and compare implications
- claim support for requests that the current analysis and runtime stack cannot satisfy safely

## Completion Criteria

This Phase 2 pass is complete when:

- the supported runtime capability surface is fully documented and schema-aligned
- semantic interpretation is calibrated enough to support the planner honestly
- planning understands planner-supported operations conservatively
- orchestration remains reliable under repeated-edit flows
- compare catches the most important failure modes for the supported runtime transforms
- docs and benchmarks reflect the new baseline
- the repository still passes root validation cleanly
