# History Overview

## Purpose

Track session lineage for audio assets and derived artifacts using an explicit `SessionGraph`.

This module owns:

- artifact node registration
- lineage and provenance metadata
- active version refs
- branches and snapshots
- revert, undo, and redo helpers

It does not execute transforms, create plans, or inspect audio content.

## Public API

The public entry point is `modules/history/src/index.ts`.

Main API groups:

- graph creation and validation: `createSessionGraph`, `validateSessionGraph`, `assertValidSessionGraph`
- graph lookup helpers: `deriveNodeId`, `getNodeById`, `getNodeByRef`, `getVersionFollowUpRequest`, `getBranch`, `hasNodeRef`, `hasBranch`
- artifact recording: `recordAudioAsset`, `recordAudioVersion`, `recordAnalysisReport`, `recordSemanticProfile`, `recordEditPlan`, `recordTransformRecord`, `recordRenderArtifact`, `recordComparisonReport`
- low-level mutation helpers: `addNode`, `addEdge`
- branch and snapshot helpers: `createBranch`, `checkoutBranch`, `createSnapshot`, `listBranches`, `listSnapshots`, `setActiveRefs`
- revert helpers: `getParentVersionId`, `listAncestorVersionIds`, `resolveRevertTarget`, `revertToVersion`, `resolveRedoTargets`, `undoActiveRef`, `redoActiveRef`

Detailed behavior is documented in `docs/api.md`.

## Session Graph Model

`SessionGraph` stores:

- `nodes`: one node per recorded artifact ref
- `edges`: typed relationships between nodes
- `active_refs`: the currently selected asset and version, plus an optional checked-out branch
- `metadata`: structured branch state, snapshots, active ref history, provenance, and any caller-owned metadata

The implementation currently supports these node types:

- `audio_asset`
- `audio_version`
- `analysis_report`
- `semantic_profile`
- `edit_plan`
- `transform_record`
- `render_artifact`
- `comparison_report`

The implementation currently emits these relations:

- `has_version`
- `analyzed_as`
- `described_as`
- `planned_from`
- `executed_as`
- `produced`
- `rendered_as`
- `compared_to`
- `belongs_to`

## Provenance Semantics

The module stores provenance in `metadata.provenance`, keyed by artifact ref id.

Important details:

- version provenance records `asset_id`, `version_id`, optional `parent_version_id`, optional `plan_id`, and optional `transform_record_id`
- `metadata.plan_requests` may retain a plan's `user_request` so orchestration can resolve shorthand follow-up requests like `more`
- analysis, semantic, plan, transform, render, and comparison artifacts also get provenance entries
- `revert` and ancestor traversal use provenance on version ids rather than graph edges
- branch checkout and branch revert both rely on provenance to recover the owning `asset_id` for a version

Because revert logic reads provenance rather than traversing edges, callers must record versions with correct `parent_version_id` and `asset_id` values.

## Branch, Snapshot, and Revert Semantics

Branch behavior:

- `createBranch` creates a named branch whose `source_version_id` and initial `head_version_id` are the same version
- branch creation sets the branch active by default
- recording an audio version with `branch_id` advances that branch head to the new version
- `checkoutBranch` moves `active_refs` to the branch head and records the change in active ref history

Snapshot behavior:

- snapshots are named pointers to a version
- snapshots may optionally be associated with a branch
- snapshots are purely metadata; they do not affect `active_refs`, branch heads, or revert behavior
- snapshot ids must be unique within the graph

Revert behavior:

- `resolveRevertTarget` walks version ancestry using `parent_version_id`
- by default it resolves one step back from the active version, or from a supplied branch head
- `revertToVersion` changes `active_refs` to the target version
- when a branch is active, `revertToVersion` also rewrites that branch's `head_version_id`
- branch revert records one active-ref history entry for the revert; undo can move the active pointer back to the pre-revert version, but it still does not restore the older branch head automatically
- `undoActiveRef` and `redoActiveRef` only move the active pointer through recorded ref history; they do not restore branch metadata, snapshots, nodes, edges, or provenance

## Validation Semantics

Validation happens at two levels:

- JSON Schema validation against `contracts/schemas/json/session-graph.schema.json`
- additional runtime checks in `validateSessionGraph`

Runtime validation currently checks:

- duplicate `node_id` values
- duplicate `ref_id` values
- edges reference known node ids
- `active_refs.asset_id` points to an `audio_asset` node
- `active_refs.version_id` points to an `audio_version` node
- `active_refs` and active ref history entries use asset/version pairs that agree with version provenance
- `active_ref_history_index` points to a known history entry
- active ref history entries resolve to known asset, version, and optional branch records
- recorded audio assets and versions have the provenance entries required by branch and revert helpers
- version ancestry does not contain cycles, including multi-step cycles
- implementation-owned provenance refs resolve to known nodes and validate their typed links
- version provenance parents, direct transform links, branch heads, branch sources, snapshot versions, and snapshot branch ids resolve to known records

## Schema And Implementation Limitations

Current limitations to be aware of:

- the schema does not require semantic edge correctness; relation meaning is enforced only by calling the recording helpers consistently
- `recordTransformRecord` requires the output version node to already exist before the transform record can be recorded
- `resolveRedoTargets` returns all child versions that share the current version as their recorded parent; it is ancestry-based and not a dedicated redo stack, so it does not infer branch membership unless history recorded that explicitly elsewhere
- node id derivation via `deriveNodeId(refId)` is the implementation convention, but the schema allows any non-empty node id string

## Source Files

- `src/session-graph.ts`: graph types, schema validation, metadata normalization, and lookups
- `src/record-node.ts`: artifact-specific recording helpers and provenance updates
- `src/record-edge.ts`: edge insertion helper
- `src/branching.ts`: branch, snapshot, and active ref mutation helpers
- `src/revert.ts`: ancestry, revert, undo, redo, and redo-target helpers
- `src/index.ts`: public exports

## Dependencies

- JSON schemas under `contracts/schemas/json/`
- example payloads under `contracts/examples/`
- `ajv` and `ajv-formats` for schema validation

## Downstream Consumers

- `tools`
- `orchestration`
- any UI or service that needs inspectable session lineage
