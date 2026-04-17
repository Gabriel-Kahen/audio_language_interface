# Runtime Capability Manifest

## Purpose

`RuntimeCapabilityManifest` is the published contract that describes what the audio runtime can execute today.

It exists to keep the repo's two core layers decoupled:

- the `Audio Runtime` owns deterministic execution
- the `Intent Layer` owns semantics and planning

The intent layer should plan against this manifest rather than against `modules/transforms` implementation details.

## Contract shape

Required top-level fields:

- `schema_version`
- `manifest_id`
- `generated_at`
- `runtime_layer`
- `summary`
- `operations`

Optional top-level fields:

- `limitations`

## Field semantics

### `manifest_id`

Stable identifier for the published capability surface snapshot.

### `runtime_layer`

Currently fixed to `audio_runtime`.

### `summary`

Short plain-language description of the current runtime surface and its intended use.

### `operations`

Ordered list of supported runtime operations.

Each operation entry includes:

- `name`: canonical operation name shared with `EditPlan` and `TransformRecord`
- `category`: broad runtime grouping such as `tonal`, `dynamics`, or `restoration`
- `summary`: short description of the operation's runtime behavior
- `intent_support`: whether the baseline planner may choose this operation directly today
- `supported_target_scopes`: currently allowed target scopes
- `parameters`: published parameter surface for callers and planners

Optional operation fields:

- `channel_requirements`
- `constraints`
- `planner_notes`

## Boundary rules

- The manifest describes what the runtime supports. It does not execute anything.
- The manifest may include operations that are runtime-available but not yet baseline-planner-supported.
- `planning` may choose conservative values within this surface, but it should not invent operations or target scopes outside the manifest.
- `tools` may expose this manifest directly for capability discovery.

## Current consumers

- `modules/planning`
- `modules/tools`
- documentation and contributor guidance

## Notes

This contract is not a provenance artifact like `AnalysisReport` or `EditPlan`.
It is shared capability metadata that helps keep the runtime and intent layers modular and inspectable.
