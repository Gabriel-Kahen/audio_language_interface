# Capabilities Module Agent Guide

## Mission

Own the published capability surface that bridges the audio runtime and the intent layer.

## Architectural role

`capabilities` is shared metadata, not execution logic.

It keeps the repository's two core layers decoupled:

- `runtime` executes deterministic operations
- `intent` plans against declared capabilities instead of runtime internals

## Owns

- published runtime capability manifests
- shared runtime operation taxonomy used across layers
- validation helpers for capability metadata
- planner-facing capability discovery helpers

## Must not own

- DSP execution
- natural-language interpretation
- orchestration policy
- hidden runtime probing logic

## Success criteria

Both the planner and adapter surfaces can discover the runtime affordance space without importing `modules/transforms` implementation details.
