# Phase 1 Roadmap

## Goal

Deliver one reliable end-to-end editing loop for LLM-driven audio manipulation.

## Phase 1 product slice

The first supported slice is:

- single-file audio editing
- WAV-oriented inputs first
- tonal shaping and cleanup for short clips or loops
- prompts such as:
  - `make this loop darker and less harsh`
  - `clean this sample up a bit`
  - `reduce brightness without losing punch`

This slice should be preferred over broad feature expansion until the full loop is reliable.

## Phase 1 definition of done

Phase 1 is done when the system can:

1. import one audio file,
2. analyze it into a contract-valid `AnalysisReport`,
3. derive a conservative `SemanticProfile`,
4. build an explicit `EditPlan`,
5. apply the plan deterministically,
6. render a preview,
7. compare before and after,
8. record the session history,
9. expose the flow through the tool layer,
10. and pass module, integration, and CI validation.

## Milestones

### Milestone 1: Pipeline Hardening

Goal:

- make the existing module graph reliable enough for a real end-to-end integration pass

Success criteria:

- root CI stays green
- module package boundaries are stable
- contract examples remain valid against schemas
- remaining boundary drift is resolved where it affects the first product slice

### Milestone 2: End-to-End Happy Path

Goal:

- prove one real file can move through the full pipeline without mocks standing in for core behavior

Success criteria:

- integration test covers `io -> analysis -> semantics -> planning -> transforms -> render -> compare -> history`
- orchestration can run the full request cycle on a real fixture
- tool layer can invoke the same flow through stable tool calls

### Milestone 3: First Prompt Family

Goal:

- optimize the system for one narrow family of natural-language audio requests

Target prompt family:

- darker
- less harsh
- slightly cleaner
- preserve punch

Success criteria:

- prompt parsing maps to current transform operations reliably
- compare layer can verify directional improvement for those requests
- unsupported prompts fail clearly instead of silently guessing

### Milestone 4: Benchmarks And Fixtures

Goal:

- make progress measurable

Success criteria:

- small licensed fixture set exists
- benchmark prompts and expected directional outcomes are documented
- benchmark harness can score regressions for the first prompt family

### Milestone 5: External Usability

Goal:

- make the project usable by external LLM agents and open source contributors

Success criteria:

- tool surface is stable for the first slice
- contributor docs explain setup, validation, and module boundaries
- demo entrypoint exists for local use

## Module Tasks

### `contracts`

- publish per-tool request and response sub-schemas for implemented tools
- add first-slice integration payload examples
- tighten any schema fields that are still ambiguous for the happy path

### `core`

- keep canonical artifact creation and validation stable
- expose any remaining shared type or ID helpers needed by downstream modules
- add integration-focused validation helpers only if they reduce cross-module drift

### `io`

- harden import behavior on real WAV fixtures
- add stronger tests around normalization, metadata, and workspace path safety
- document current supported input scope clearly

### `analysis`

- improve first-slice measurements for brightness, harshness, and punch preservation
- ensure annotations are useful for planning and comparison
- add more real-fixture coverage for spectral and loudness behavior

### `semantics`

- calibrate descriptor rules for `bright`, `dark`, `harsh`, `cleaner`, `wide`, and `punchy`-adjacent interpretations
- keep unresolved or ambiguous cases explicit
- tune summary language so it is useful but not over-claimed

### `planning`

- improve request parsing for the first prompt family
- keep plans conservative and strictly within supported transform operations
- make unsupported requests fail with clear limitations

### `transforms`

- harden the current first-slice operation set:
  - `gain`
  - `normalize`
  - `trim`
  - `fade`
  - `parametric_eq`
  - `high_pass_filter`
  - `low_pass_filter`
- ensure deterministic output and useful execution warnings

### `render`

- make preview generation stable for the first slice
- validate rendered metadata on real outputs
- keep preview and final render behavior clearly separated

### `compare`

- improve goal-aware comparison for darker/less-harsh/preserve-punch prompts
- make metric deltas and semantic deltas useful to both tools and orchestration
- add regression warnings that matter for the first slice

### `history`

- verify provenance across the full request cycle
- ensure branching, snapshots, and active refs remain coherent under orchestration flows
- add end-to-end history assertions in integration coverage

### `tools`

- stabilize the first implemented tool set
- publish tool-specific payload schemas
- improve user-facing and model-facing errors for unsupported requests or mismatched provenance

### `orchestration`

- make the happy-path request cycle the canonical thin integration flow
- reduce remaining adapter drift
- expose partial flows that are useful for iterative refinement and testing

### `benchmarks`

- create first-slice fixture inventory and prompt suite
- define directional expectations for each prompt
- add scoring/reporting for regressions

### `tests/integration`

- add true cross-module workflow tests using real fixtures where practical
- make the happy-path pipeline a required validation target

### `fixtures/audio`

- add small, licensed, first-slice fixtures
- document provenance, intended use, and known characteristics

### `docs`

- add contributor guidance for the first slice
- keep module docs synchronized with implementation constraints
- document unsupported behavior clearly so contributors do not guess

## Execution Order

1. `contracts`, `fixtures/audio`, and `tests/integration` foundation for the first slice
2. `analysis`, `semantics`, `planning`, `compare` tuning for prompt quality
3. `transforms`, `render`, and `orchestration` hardening for real end-to-end execution
4. `tools` stabilization for external LLM use
5. `benchmarks` and contributor-facing docs

## Prioritization Rule

Prefer making the first prompt family work extremely reliably over expanding the number of supported effects or descriptors.
