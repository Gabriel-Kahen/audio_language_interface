import {
  type ActiveRefs,
  getBranch,
  getNodeByRef,
  normalizeMetadata,
  type SessionBranch,
  type SessionGraph,
  type SessionSnapshot,
  withUpdatedTimestamp,
} from "./session-graph.js";

export interface CreateBranchInput {
  branch_id: string;
  source_version_id: string;
  created_at: string;
  label?: string;
  set_active?: boolean;
}

export interface CreateSnapshotInput {
  snapshot_id: string;
  version_id: string;
  created_at: string;
  branch_id?: string;
  label?: string;
}

export interface SetActiveRefsInput {
  active_refs: ActiveRefs;
  changed_at: string;
  reason?: string;
}

/** Creates a named branch from an existing version and activates it by default. */
export function createBranch(graph: SessionGraph, input: CreateBranchInput): SessionGraph {
  requireVersion(graph, input.source_version_id);

  if (getBranch(graph, input.branch_id)) {
    throw new Error(`Branch '${input.branch_id}' already exists`);
  }

  const metadata = normalizeMetadata(graph.metadata);
  const branch: SessionBranch = {
    branch_id: input.branch_id,
    head_version_id: input.source_version_id,
    source_version_id: input.source_version_id,
    created_at: input.created_at,
    ...(input.label ? { label: input.label } : {}),
  };

  let nextGraph = withUpdatedTimestamp(
    {
      ...graph,
      metadata: {
        ...metadata,
        branches: [...(metadata.branches ?? []), branch],
      },
    },
    input.created_at,
  );

  if (input.set_active ?? true) {
    nextGraph = setActiveRefs(nextGraph, {
      active_refs: {
        asset_id: resolveAssetIdForVersion(nextGraph, input.source_version_id),
        version_id: input.source_version_id,
        branch_id: input.branch_id,
      },
      changed_at: input.created_at,
      reason: "create_branch",
    });
  }

  return nextGraph;
}

/** Creates a named snapshot pointing to an existing version. */
export function createSnapshot(graph: SessionGraph, input: CreateSnapshotInput): SessionGraph {
  requireVersion(graph, input.version_id);

  if (input.branch_id && !getBranch(graph, input.branch_id)) {
    throw new Error(`Branch '${input.branch_id}' does not exist`);
  }

  const metadata = normalizeMetadata(graph.metadata);
  const duplicate = metadata.snapshots?.some(
    (snapshot) => snapshot.snapshot_id === input.snapshot_id,
  );
  if (duplicate) {
    throw new Error(`Snapshot '${input.snapshot_id}' already exists`);
  }

  const snapshot: SessionSnapshot = {
    snapshot_id: input.snapshot_id,
    version_id: input.version_id,
    created_at: input.created_at,
    ...(input.branch_id ? { branch_id: input.branch_id } : {}),
    ...(input.label ? { label: input.label } : {}),
  };

  return withUpdatedTimestamp(
    {
      ...graph,
      metadata: {
        ...metadata,
        snapshots: [...(metadata.snapshots ?? []), snapshot],
      },
    },
    input.created_at,
  );
}

/** Moves `active_refs` to the current head of an existing branch. */
export function checkoutBranch(
  graph: SessionGraph,
  branchId: string,
  changedAt: string,
): SessionGraph {
  const branch = getBranch(graph, branchId);
  if (!branch) {
    throw new Error(`Branch '${branchId}' does not exist`);
  }

  return setActiveRefs(graph, {
    active_refs: {
      asset_id: resolveAssetIdForVersion(graph, branch.head_version_id),
      version_id: branch.head_version_id,
      branch_id: branch.branch_id,
    },
    changed_at: changedAt,
    reason: "checkout_branch",
  });
}

/**
 * Updates `active_refs` and appends a history entry, truncating redo history if
 * the caller had previously undone to an earlier selection.
 */
export function setActiveRefs(graph: SessionGraph, input: SetActiveRefsInput): SessionGraph {
  requireAsset(graph, input.active_refs.asset_id);
  requireVersion(graph, input.active_refs.version_id);

  if (input.active_refs.branch_id && !getBranch(graph, input.active_refs.branch_id)) {
    throw new Error(`Branch '${input.active_refs.branch_id}' does not exist`);
  }

  const metadata = normalizeMetadata(graph.metadata);
  const previousHistory = metadata.active_ref_history ?? [];
  const previousIndex = metadata.active_ref_history_index ?? previousHistory.length - 1;
  const trimmedHistory = previousHistory.slice(0, Math.max(previousIndex + 1, 0));
  const nextHistory = [
    ...trimmedHistory,
    {
      ...input.active_refs,
      changed_at: input.changed_at,
      ...(input.reason ? { reason: input.reason } : {}),
    },
  ];

  return withUpdatedTimestamp(
    {
      ...graph,
      active_refs: { ...input.active_refs },
      metadata: {
        ...metadata,
        active_ref_history: nextHistory,
        active_ref_history_index: nextHistory.length - 1,
      },
    },
    input.changed_at,
  );
}

/** Returns a shallow copy of all stored branches. */
export function listBranches(graph: SessionGraph): SessionBranch[] {
  return [...(normalizeMetadata(graph.metadata).branches ?? [])];
}

/** Returns a shallow copy of all stored snapshots. */
export function listSnapshots(graph: SessionGraph): SessionSnapshot[] {
  return [...(normalizeMetadata(graph.metadata).snapshots ?? [])];
}

function requireAsset(graph: SessionGraph, assetId: string): void {
  if (!getNodeByRef(graph, assetId, "audio_asset")) {
    throw new Error(`Audio asset '${assetId}' is not present in the session graph`);
  }
}

function requireVersion(graph: SessionGraph, versionId: string): void {
  if (!getNodeByRef(graph, versionId, "audio_version")) {
    throw new Error(`Audio version '${versionId}' is not present in the session graph`);
  }
}

function resolveAssetIdForVersion(graph: SessionGraph, versionId: string): string {
  const metadata = normalizeMetadata(graph.metadata);
  const assetId = metadata.provenance?.[versionId]?.asset_id;
  if (!assetId) {
    throw new Error(`No asset provenance recorded for version '${versionId}'`);
  }
  return assetId;
}
