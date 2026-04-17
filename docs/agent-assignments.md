# Agent Assignments

## Goal

Assign roadmap tasks to focused agents so work can proceed in parallel without blurring module ownership.

## Agent Model

Each agent should own one coherent task track.

Rules:

- one agent owns one task track at a time
- agents should stay inside their assigned module or contract area
- cross-module changes should be limited to published contracts, examples, and docs when required
- integration agents may compose modules but should not reimplement lower-level logic

## Current Phase 1 Assignments

### Agent A: Contracts And Fixtures

Owns:

- `contracts/`
- `fixtures/audio/`
- `tests/integration/` contract fixture setup work

Tasks:

1. Add tool-specific request and response schemas for the current tool set.
2. Keep capability-manifest contracts aligned with runtime behavior.
3. Add first-slice example payloads for end-to-end happy-path flows.
4. Add or document first-slice audio fixtures with licensing and intent notes.

### Agent B: Analysis Quality

Owns:

- `modules/analysis`

Tasks:

1. Improve harshness, brightness, and punch-related measurements for the first slice.
2. Improve localized annotations so downstream modules can act on them.
3. Add real-fixture tests focused on tonal-shaping prompts.

### Agent C: Semantic Interpretation

Owns:

- `modules/semantics`

Tasks:

1. Calibrate descriptor rules for the first prompt family.
2. Improve ambiguous-case handling and unresolved-term output.
3. Align semantic summary wording with evidence confidence.

### Agent D: Planning Safety

Owns:

- `modules/planning`

Tasks:

1. Improve prompt parsing for darker, less-harsh, and cleaner requests.
2. Keep planning conservative and limited to planner-supported capability-manifest operations.
3. Improve failure messages for unsupported or underspecified requests.

### Agent E: Transform And Render Reliability

Owns:

- `modules/transforms`
- `modules/render`

Tasks:

1. Harden deterministic transform execution for the first-slice operation set.
2. Improve preview render reliability and output validation.
3. Add real-file transform and render tests where practical.

### Agent F: Comparison And Benchmarking

Owns:

- `modules/compare`
- `modules/benchmarks`

Tasks:

1. Improve goal-aware comparison for the first prompt family.
2. Add benchmark prompts and directional expectations.
3. Produce benchmark reports that help tune planning and semantics.

### Agent G: Tool Surface

Owns:

- `modules/tools`

Tasks:

1. Stabilize the current adapter tool set for external LLM use.
2. Publish tool-specific schemas and examples.
3. Improve explicit error responses for unsupported operations, capability mismatches, and provenance mismatches.

### Agent H: Orchestration And History

Owns:

- `modules/orchestration`
- `modules/history`

Tasks:

1. Make the happy-path request cycle the canonical integration path.
2. Ensure history and provenance stay correct through orchestration flows.
3. Add or expand integration tests for the end-to-end request cycle.

### Agent I: Documentation And Contributor Experience

Owns:

- `docs/`
- repo-level documentation quality

Tasks:

1. Add contributor guidance for the first supported slice.
2. Keep root docs aligned with current module capabilities and constraints.
3. Document how to validate, demo, and extend the current system.

## Assignment Matrix

| Area | Owner |
| --- | --- |
| contracts, fixtures, integration setup | Agent A |
| analysis | Agent B |
| semantics | Agent C |
| planning | Agent D |
| transforms, render | Agent E |
| compare, benchmarks | Agent F |
| tools | Agent G |
| orchestration, history | Agent H |
| docs and contributor experience | Agent I |

## Parallelization Guidance

Safe to run in parallel:

- Agent A with Agents B through I
- Agent B with Agent C
- Agent D with Agent E once current transform taxonomy is treated as fixed for the slice
- Agent F after the first-slice metrics and prompts are stable enough to score
- Agent G after current tool surfaces are stable enough to document with schemas
- Agent H after major runtime package surfaces are stable

Coordinate carefully when touching:

- shared contracts
- example payloads
- integration tests that depend on multiple runtime modules

## Handoff Rule

When an agent finishes a task track, it should report:

- what changed
- what validations ran
- what assumptions remain
- and what downstream agent should move next
