# Compare Module Agent Guide

## Mission

Own before-and-after comparison and evaluation of audio changes.

## Architectural role

`compare` is part of the audio runtime. It measures what changed, whether the change matches stated goals, and whether regressions were introduced.

## Owns

- metric deltas between versions or renders
- semantic deltas grounded in measurable changes
- regression detection such as clipping, imbalance, or excessive loudness shifts
- comparison summaries that other modules can consume

## Inputs

- two `AudioVersion` values, two `RenderArtifact` values, or both
- optional `EditPlan` or user request for goal-aware evaluation

## Outputs

- `ComparisonReport`
- delta metrics
- regression warnings
- goal-alignment findings

## Must not own

- applying edits
- deciding the next workflow step
- source file ingestion
- session history storage

## Coordination rules

- comparisons must be reproducible and clearly scoped
- distinguish measured deltas from inferred subjective judgments
- document exactly how comparisons are computed

## Deliverables

- comparison APIs
- comparison report contracts
- tests for delta calculation and regression detection

## Success criteria

The system can inspect two versions and explain what changed in a way the planner, tools, and user can act on.
