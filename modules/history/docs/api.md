# History API

## Overview

This document describes the implemented public API in `modules/history/src/index.ts`.

The module is intentionally small and state-explicit. Every helper takes a `SessionGraph` and returns a new `SessionGraph` or derived information. There is no module-global session state.

## Core Types

Primary exported types:

- `SessionGraph`: full persisted graph state
- `SessionNode` and `SessionEdge`: graph primitives
- `ActiveRefs`: current asset/version selection and optional branch
- `SessionBranch`: named branch pointer with source and head version ids
- `SessionSnapshot`: named version pointer
- `ProvenanceRecord`: lightweight lineage index stored under `metadata.provenance`

Record input types mirror the artifact contracts at a reduced level. They only include the fields this module currently reads.

Examples:

- `AudioVersionRecord` uses lineage fields needed for node timestamps and provenance
- `EditPlanRecord` may include `user_request` when callers want follow-up-safe plan provenance
- `TransformRecordRecord` uses input/output version ids and optional `plan_id`
- `ComparisonReportRecord` uses comparable ref ids and ref types

This means the history module tracks artifact identity and lineage, not the full artifact payload.

## Graph Lifecycle

### `createSessionGraph(input)`

Creates a minimal graph with timestamps, active refs, initial asset/version nodes, and normalized metadata containers.

Behavior:

- sets `schema_version` to `1.0.0`
- creates `audio_asset` and `audio_version` nodes for the initial active refs
- creates an initial `has_version` edge from that asset to that version
- copies `active_refs`
- appends an initial `active_ref_history` entry with reason `create_session_graph`
- seeds asset and version provenance for the initial active refs
- normalizes `metadata` collections to arrays/objects when absent

### `validateSessionGraph(graph)`

Runs published schema validation plus implementation-level integrity checks.

Use this when loading persisted graphs or when callers mutate lower-level fields directly.

Runtime validation also enforces the history invariants that branch checkout, revert, and ancestor traversal depend on:

- every recorded `audio_asset` and `audio_version` must have a provenance entry
- `active_refs` and `active_ref_history` must be coherent asset/version pairs according to version provenance
- `active_ref_history_index`, when present, must point at the current `active_refs` entry
- an active branch must exist and its head must match the active version
- branch source and head versions must belong to the same asset
- version ancestry must be acyclic across the full parent chain, not just at one hop
- transform provenance must agree in both directions when a version claims a direct `transform_record_id`, including the transform input matching the version parent

### `assertValidSessionGraph(graph)`

Same validation as above, but throws on failure.

## Recording Helpers

The recording helpers are the intended write API. They add nodes, add canonical edges, merge provenance, and update timestamps. `recordAudioVersion` also updates `active_refs` by default.

### `recordAudioAsset(graph, asset)`

Adds an `audio_asset` node and initializes a provenance entry for the asset id.

### `recordAudioVersion(graph, version, options?)`

Adds an `audio_version` node and a `has_version` edge from asset to version.

Behavior:

- requires the asset node to already exist
- stores version provenance keyed by the version id
- records `parent_version_id` when supplied
- updates `active_refs` by default
- appends an active-ref history entry when the active selection changes
- updates a branch head when `options.branch_id` is supplied
- refuses to move a branch head to a version from another asset

`RecordOptions`:

- `set_active`: defaults to `true`
- `branch_id`: optional branch to advance

### `recordAnalysisReport(graph, report)`

Adds an `analysis_report` node plus:

- `audio_version -> analysis_report` via `analyzed_as`
- `analysis_report -> audio_asset` via `belongs_to`

### `recordSemanticProfile(graph, profile)`

Adds a `semantic_profile` node plus:

- `analysis_report -> semantic_profile` via `described_as`
- `semantic_profile -> audio_asset` via `belongs_to`

### `recordEditPlan(graph, plan)`

Adds an `edit_plan` node plus:

- `audio_version -> edit_plan` via `planned_from`
- `edit_plan -> audio_asset` via `belongs_to`

When `plan.user_request` is provided, it is retained under `metadata.plan_requests[plan_id]` so orchestration can safely expand shorthand follow-up requests against later derived versions.

### `recordTransformRecord(graph, record)`

Adds a `transform_record` node plus:

- optional `edit_plan -> transform_record` via `executed_as`
- `transform_record -> output audio_version` via `produced`
- `transform_record -> audio_asset` via `belongs_to`

Important ordering requirement:

- both the input and output version nodes must already exist before this helper is called

### `recordRenderArtifact(graph, render)`

Adds a `render_artifact` node plus:

- `audio_version -> render_artifact` via `rendered_as`
- `render_artifact -> audio_asset` via `belongs_to`

### `recordComparisonReport(graph, comparison)`

Adds a `comparison_report` node plus two `compared_to` edges:

- baseline artifact -> comparison report
- comparison report -> candidate artifact

Comparable refs may be either:

- `version`, which must resolve to an `audio_version` node
- `render`, which must resolve to a `render_artifact` node

## Low-Level Helpers

### `addNode(graph, node, updatedAt)`

Adds a node if its `node_id` and `ref_id` are unused.

Behavior:

- re-adding the exact same node is a no-op
- reusing a `node_id` for a different node throws
- reusing a `ref_id` throws

### `addEdge(graph, edge, updatedAt)`

Adds an edge when both endpoint node ids exist.

Behavior:

- missing endpoints throw
- duplicate edges are ignored

### Lookup Helpers

- `deriveNodeId(refId)`: returns `node_${refId}`
- `getNodeById(graph, nodeId)`: lookup by node id
- `getNodeByRef(graph, refId, nodeType?)`: lookup by artifact ref id and optional type
- `getVersionFollowUpRequest(graph, versionId)`: returns the recorded `user_request` from `metadata.plan_requests` for the plan that produced the supplied version, when available
- `hasNodeRef(graph, refId, nodeType?)`: boolean form of the above
- `getBranch(graph, branchId)` and `hasBranch(graph, branchId)`: branch lookup helpers

`deriveNodeId` is the implementation convention used by the recording helpers. The contract schema does not require this format.

## Branching And Snapshots

### `createBranch(graph, input)`

Creates a branch whose `source_version_id` and initial `head_version_id` both point to the supplied version.

Behavior:

- source version must already exist
- branch ids must be unique
- branch becomes active by default
- active branch checkout uses provenance to recover the branch asset id

### `checkoutBranch(graph, branchId, changedAt)`

Moves `active_refs` to the branch head and records an active-ref history entry.

### `createSnapshot(graph, input)`

Stores a named snapshot pointing to a version, optionally tagged with a branch id.

Behavior:

- target version must exist
- provided branch id must exist
- snapshot ids must be unique
- no active refs are changed

### `setActiveRefs(graph, input)`

Directly changes `active_refs` and appends to active-ref history.

Behavior:

- asset and version refs must already exist
- branch id, when present, must already exist
- if the user previously undid history, redo entries after the current index are discarded before appending

### `restoreActiveRefs(graph, input)`

Restores a complete active-ref entry and appends that restoration to active-ref history.

Behavior:

- asset and version refs must already exist
- branch id, when present, must already exist
- when a branch id is present, the branch head is rewound to the restored version
- this is intended for undo/retry recovery where the previous active selection may be a branch source rather than the current branch head

## Revert, Undo, And Redo

### `getParentVersionId(graph, versionId)`

Reads `metadata.provenance[versionId].parent_version_id`.

### `listAncestorVersionIds(graph, versionId)`

Follows parent pointers until ancestry ends.

### `resolveRevertTarget(graph, input?)`

Returns the ancestor version id after walking `steps` parents from:

- `input.version_id`, or
- the supplied branch head, or
- the current active version

Returns `undefined` when there is no ancestor that far back.

### `resolveUndoTarget(graph, input?)`

Returns the version id from a prior `active_ref_history` entry.

Behavior:

- defaults to one step back from the current `active_ref_history_index`
- returns `undefined` when there is no earlier recorded active selection
- differs from `resolveRevertTarget` because it follows explicit active-ref history rather than ancestry, so it can undo a prior branch checkout or revert operation predictably

### `revertToVersion(graph, versionId, changedAt, reason?)`

Moves the active selection to a previously recorded version.

Behavior without active branch:

- sets `active_refs.asset_id` and `active_refs.version_id`

Behavior with active branch:

- rewrites that branch's `head_version_id`
- records one active-ref history entry for the revert reason

Important consequence:

- branch-bound undo/redo restores the active branch head to the indexed active version so validation remains coherent

### `resolveRedoTargets(graph, versionId?)`

Returns every version whose recorded `parent_version_id` matches the supplied version, or the active version when omitted.

This is lineage discovery, not a strict UI redo stack. In a branching graph it may return multiple candidates.

The returned `branch_id` is optional and is omitted when branch membership cannot be established from explicit history data alone.

### `undoActiveRef(graph)` and `redoActiveRef(graph)`

Move the current active selection backward or forward through `metadata.active_ref_history`.

Important limitation:

- these helpers only move `active_refs` and the history index
- when the indexed entry is branch-bound, they restore that branch head to the indexed active version
- they do not restore snapshots, nodes, edges, or provenance to an earlier structural state

## Metadata Contract Reality

The published `SessionGraph` JSON Schema intentionally leaves `metadata` open.

The implementation currently reserves these keys:

- `branches`
- `snapshots`
- `active_ref_history`
- `active_ref_history_index`
- `provenance`

Other metadata keys are preserved by normalization helpers.

## Ordering Expectations

Callers should record artifacts in dependency order:

1. `recordAudioAsset`
2. `recordAudioVersion`
3. downstream artifacts that depend on that version

Additional ordering constraints:

- a semantic profile requires a previously recorded analysis report
- a transform record requires both its input and output versions to be recorded already
- a comparison report requires both compared refs to be recorded already

## Tested Behaviors

Module tests currently cover:

- validation of the published `SessionGraph` example
- provenance across plan, transform, render, and comparison records
- branch creation, snapshot creation, revert target resolution, and branch revert behavior
- undo and redo over active ref history
- invalid active refs and invalid parent provenance
- asset/version pair validation for active refs and active ref history
- longer ancestry cycle detection and missing required version provenance
- reverse direct-transform linkage validation
- redo target discovery from shared ancestry
