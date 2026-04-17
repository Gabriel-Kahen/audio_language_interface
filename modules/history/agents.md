# History Module Agent Guide

## Mission

Own version tracking, branching, provenance, and reversible session state.

## Architectural role

`history` is part of the shared/foundation layer. It preserves the lineage of all imported, planned, transformed, rendered, and compared artifacts.

## Owns

- version graph modeling
- undo and redo semantics
- named snapshots and branching
- provenance links between plans, transforms, renders, and comparisons
- session persistence rules

## Inputs

- `AudioAsset`, `AudioVersion`, `EditPlan`, `TransformRecord`, `RenderArtifact`, and `ComparisonReport`

## Outputs

- `SessionGraph`
- history queries
- revert targets and branch metadata

## Must not own

- DSP analysis or transform execution
- edit planning logic
- user-facing tool policy beyond exposing history operations

## Coordination rules

- history must be explicit, inspectable, and reproducible
- do not hide mutation behind global state
- store enough metadata to rebuild provenance later

## Deliverables

- history APIs
- session graph contract
- tests for branching, revert behavior, and provenance integrity

## Success criteria

The platform can explain how any version was produced and return to prior states safely.
