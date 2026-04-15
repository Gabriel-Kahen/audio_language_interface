# Phase 2 Plan

## Purpose

This document turns the high-level Phase 2 roadmap into a concrete execution plan.

Phase 2 is the next implementation wave after the Phase 1 baseline. It should increase capability without sacrificing the contract-first, inspectable nature of the platform.

## Baseline

The frozen Phase 1 baseline is tagged as:

- `phase-1-complete`

That tag points at the commit where the first end-to-end slice was established and should be used as the comparison point for Phase 2 regression checks.

## Phase 2 Objective

Make the system substantially better at supported LLM-driven editing requests by improving:

1. transform coverage
2. prompt handling
3. orchestration behavior
4. semantic interpretation

The goal is a stronger editing loop, not a much broader but less reliable feature set.

## Locked Scope

### In scope

The first Phase 2 transform batch is locked to:

1. `compressor`
2. `limiter`
3. `stereo_width`
4. `denoise`

These were chosen because they most directly support the current supported prompt family and nearby real-world requests:

- preserving or restoring punch
- controlling peaks
- widening or narrowing a sound in a controllable way
- cleaning up noisy material without changing the core product framing

### Explicitly deferred

These are intentionally out of scope for the first Phase 2 pass:

- `pitch_shift`
- `time_stretch`
- multi-file workflows
- streaming or byte-buffer import as a new primary input mode
- broad generative or music-creation behavior

Those items add meaningful surface area and complexity, but they are not necessary to prove the next level of reliability for the current editing loop.

## Product Outcome

At the end of this Phase 2 pass, the system should be materially better at requests such as:

- `make this loop darker and less harsh but keep the punch`
- `clean this sample up a bit`
- `make this a little tighter and more controlled`
- `widen this slightly without making it phasey`

The system should still reject or clarify requests outside the supported scope instead of guessing.

## Workstreams

### Workstream A: Transform Expansion

Owner modules:

- `modules/transforms`
- `modules/render`
- `modules/compare`

Primary outcomes:

- deterministic implementations for the four locked transforms
- explicit parameter shapes and safety limits
- better regression detection for transform-specific side effects

Detailed tasks:

1. Add the new operation names to contract and planning surfaces where required.
2. Define exact parameter shapes for each transform before implementation.
3. Implement deterministic execution in `transforms`.
4. Ensure `TransformRecord` output captures the exact executed parameters.
5. Extend `compare` to detect likely regressions:
   - over-compression
   - peak issues
   - stereo instability
   - excessive noise reduction artifacts where measurable

Acceptance criteria:

- each new transform has unit tests and at least one fixture-backed test
- the planner can target the transform explicitly
- the compare layer can reason about likely regressions introduced by it

### Workstream B: Prompt Handling Hardening

Owner modules:

- `modules/planning`
- `modules/semantics`
- `modules/tools`

Primary outcomes:

- better handling of natural language inside the supported scope
- explicit unsupported and ambiguous pathways
- more conservative, interpretable plans

Detailed tasks:

1. Expand prompt parsing for the first supported request family.
2. Separate supported, ambiguous, and unsupported requests clearly.
3. Add explicit clarification or failure messages where the planner cannot safely proceed.
4. Keep prompt interpretation aligned with the current transform set rather than aspirational capabilities.
5. Make tool-layer errors clearer for unsupported prompt patterns.

Acceptance criteria:

- supported prompts map reliably to explicit plans
- ambiguous prompts surface clarification-worthy failure states
- unsupported prompts fail without hidden fallback behavior

### Workstream C: Semantic Calibration

Owner modules:

- `modules/analysis`
- `modules/semantics`
- `modules/compare`

Primary outcomes:

- stronger evidence for brightness, harshness, cleanliness, width, and punch-related interpretation
- improved confidence handling and summary wording
- better semantic signals for planning and comparison

Detailed tasks:

1. Improve analysis-side evidence where current measurements are too weak.
2. Recalibrate descriptor thresholds using the first Phase 2 transform batch in mind.
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
2. Ensure the orchestration layer preserves session and provenance state across iterations.
3. Keep partial results valid and inspectable when a later stage fails.
4. Add integration tests that cover multiple cycles, not only a single request pass.
5. Ensure the tool layer can surface or support these flows cleanly where appropriate.

Acceptance criteria:

- repeated edit flows preserve valid history
- partial failures do not corrupt session state
- orchestration remains thin and composed from lower-level modules

## Milestones

### Milestone 1: Contract And Test Prep

Goal:

- prepare the repository so Phase 2 implementation can proceed without contract drift or weak testing discipline

Deliverables:

- finalized transform batch contract updates
- test matrix and coverage expectations documented
- any missing fixtures or fixture manifests added for the first Phase 2 pass

### Milestone 2: Transform And Compare Core

Goal:

- land the deterministic core of the four new transforms and their compare/regression logic

Deliverables:

- transform implementations
- transform tests
- compare regressions and deltas for the new capabilities

### Milestone 3: Semantics And Planning Alignment

Goal:

- make semantics and planning understand the new capability set without overreaching

Deliverables:

- improved prompt handling
- improved descriptor calibration
- safer plan generation for the expanded operation set

### Milestone 4: Iterative Orchestration

Goal:

- improve repeated editing flows over the stronger capability base

Deliverables:

- iterative refinement support
- stronger orchestration integration tests
- history assertions over repeated sessions

### Milestone 5: Hardening And Review

Goal:

- make the Phase 2 additions trustworthy enough to serve as the new baseline

Deliverables:

- root validation remains green
- capability docs updated
- benchmark and integration expectations updated where applicable

## Module Breakdown

### `contracts`

- publish parameter shapes and examples for the four locked transforms
- update tool contracts only where new tool-surface behavior is truly needed
- keep examples synchronized with supported behavior

### `analysis`

- improve evidence that informs compression, limiting, width, and noise-related semantics
- document any measurement limits clearly

### `semantics`

- calibrate descriptors that interact with the new transform set
- improve confidence and ambiguity handling

### `planning`

- support the new operations conservatively
- improve request classification and failure paths

### `transforms`

- implement the four locked transforms deterministically
- emit exact execution records

### `render`

- ensure render validation continues to reflect actual output metadata after new transform types are applied

### `compare`

- add deltas and regressions relevant to the new transforms

### `history`

- ensure repeated edit sessions remain coherent under orchestration changes

### `tools`

- expose clearer error behavior around new prompt categories and transform support limits

### `orchestration`

- implement repeated-edit flow support without re-owning module logic

### `benchmarks`

- add Phase 2 prompt cases when the capability is real enough to score honestly

## Testing Strategy

Phase 2 should be more test-heavy than Phase 1.

### Required test layers

For any meaningful Phase 2 feature, the expected validation stack is:

1. schema validation if contracts changed
2. module unit tests in the owning module
3. fixture-backed tests when audio behavior is material
4. integration tests when the workflow crosses module boundaries
5. benchmark updates when the feature affects directional editing quality

### Transform testing requirements

Each new transform should include:

- parameter validation tests
- deterministic execution tests
- command-shape tests where FFmpeg is involved
- at least one real-file or generated-fixture output verification test
- regression tests for likely failure modes

### Prompt-handling testing requirements

Prompt improvements should include:

- supported wording tests
- unsupported wording tests
- ambiguity tests
- conservative planning tests that ensure no out-of-scope transform is silently chosen

### Orchestration testing requirements

Orchestration improvements should include:

- repeated request-cycle tests
- undo or revert-path tests where applicable
- partial-failure tests with valid remaining session state
- provenance assertions through `SessionGraph`

### Semantic testing requirements

Semantic changes should include:

- threshold-boundary tests
- conflicting-evidence tests
- unresolved-term tests
- summary-language tests when wording changes with confidence

## Non-negotiable rules

Phase 2 work should not:

- introduce hidden fallback logic across modules
- widen the product into music generation or DAW-like behavior
- add new transforms without explicit planner and compare implications
- claim support for requests that the current analysis and transform stack cannot satisfy safely

## Completion criteria

This Phase 2 pass is complete when:

- the four locked transforms are implemented and tested
- prompt handling is stronger for supported requests and clearer for unsupported ones
- semantic interpretation is more calibrated and still evidence-grounded
- orchestration supports more realistic repeated editing flows
- docs and tests accurately describe the new supported scope
- the repository still passes root validation cleanly
