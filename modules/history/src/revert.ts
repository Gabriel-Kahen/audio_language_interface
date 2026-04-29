import { setActiveRefs } from "./branching.js";
import {
  type ActiveRefHistoryEntry,
  getBranch,
  normalizeMetadata,
  type SessionGraph,
} from "./session-graph.js";

export interface ResolveRevertTargetInput {
  version_id?: string;
  branch_id?: string;
  steps?: number;
}

export interface ResolveUndoTargetInput {
  steps?: number;
}

export interface RedoTarget {
  version_id: string;
  branch_id?: string;
}

/** Returns the recorded parent version id, if any, for a version. */
export function getParentVersionId(graph: SessionGraph, versionId: string): string | undefined {
  return normalizeMetadata(graph.metadata).provenance?.[versionId]?.parent_version_id;
}

/** Lists ancestor version ids by repeatedly following `parent_version_id`. */
export function listAncestorVersionIds(graph: SessionGraph, versionId: string): string[] {
  const ancestors: string[] = [];
  let cursor = getParentVersionId(graph, versionId);

  while (cursor) {
    ancestors.push(cursor);
    cursor = getParentVersionId(graph, cursor);
  }

  return ancestors;
}

/** Resolves an ancestor version suitable for revert traversal. */
export function resolveRevertTarget(
  graph: SessionGraph,
  input: ResolveRevertTargetInput = {},
): string | undefined {
  const steps = input.steps ?? 1;
  const startVersionId = input.version_id ?? resolveStartVersionId(graph, input.branch_id);
  let cursor: string | undefined = startVersionId;

  for (let index = 0; index < steps; index += 1) {
    cursor = cursor ? getParentVersionId(graph, cursor) : undefined;
    if (!cursor) {
      return undefined;
    }
  }

  return cursor;
}

/** Resolves a prior active version from explicit active ref history. */
export function resolveUndoTarget(
  graph: SessionGraph,
  input: ResolveUndoTargetInput = {},
): string | undefined {
  return resolveUndoTargetEntry(graph, input)?.version_id;
}

/** Resolves a prior active ref entry from explicit active ref history. */
export function resolveUndoTargetEntry(
  graph: SessionGraph,
  input: ResolveUndoTargetInput = {},
): ActiveRefHistoryEntry | undefined {
  const steps = input.steps ?? 1;
  const metadata = normalizeMetadata(graph.metadata);
  const history = metadata.active_ref_history ?? [];
  const startIndex = metadata.active_ref_history_index ?? history.length - 1;
  const targetIndex = startIndex - steps;

  if (targetIndex < 0) {
    return undefined;
  }

  return history[targetIndex];
}

/**
 * Returns descendant versions that share the supplied version as their direct
 * recorded parent.
 */
export function resolveRedoTargets(graph: SessionGraph, versionId?: string): RedoTarget[] {
  const currentVersionId = versionId ?? graph.active_refs.version_id;
  const metadata = normalizeMetadata(graph.metadata);

  return Object.entries(metadata.provenance ?? {})
    .filter(([, record]) => record.parent_version_id === currentVersionId)
    .map(([candidateVersionId]) => ({
      version_id: candidateVersionId,
    }));
}

/**
 * Repoints the active selection to a previously recorded version and updates
 * the active branch head when a branch is checked out.
 */
export function revertToVersion(
  graph: SessionGraph,
  versionId: string,
  changedAt: string,
  reason = "revert_to_version",
): SessionGraph {
  const assetId = normalizeMetadata(graph.metadata).provenance?.[versionId]?.asset_id;
  if (!assetId) {
    throw new Error(`No asset provenance recorded for version '${versionId}'`);
  }

  if (graph.active_refs.branch_id) {
    const branch = getBranch(graph, graph.active_refs.branch_id);
    if (!branch) {
      throw new Error(`Branch '${graph.active_refs.branch_id}' does not exist`);
    }
    const branchAssetId = normalizeMetadata(graph.metadata).provenance?.[branch.source_version_id]
      ?.asset_id;
    if (branchAssetId && branchAssetId !== assetId) {
      throw new Error(
        `Cannot move branch '${branch.branch_id}' to version '${versionId}' because it belongs to asset '${assetId}', not branch asset '${branchAssetId}'`,
      );
    }

    return setActiveRefs(
      {
        ...graph,
        metadata: {
          ...normalizeMetadata(graph.metadata),
          branches: (normalizeMetadata(graph.metadata).branches ?? []).map((entry) =>
            entry.branch_id === branch.branch_id ? { ...entry, head_version_id: versionId } : entry,
          ),
        },
      },
      {
        active_refs: {
          asset_id: assetId,
          version_id: versionId,
          branch_id: branch.branch_id,
        },
        changed_at: changedAt,
        reason,
      },
    );
  }

  return setActiveRefs(graph, {
    active_refs: {
      asset_id: assetId,
      version_id: versionId,
    },
    changed_at: changedAt,
    reason,
  });
}

/** Moves the active selection backward through active ref history. */
export function undoActiveRef(graph: SessionGraph): SessionGraph {
  const metadata = normalizeMetadata(graph.metadata);
  const history = metadata.active_ref_history ?? [];
  const index = metadata.active_ref_history_index ?? history.length - 1;

  if (index <= 0) {
    return graph;
  }

  const nextIndex = index - 1;
  const entry = history[nextIndex];
  if (!entry) {
    return graph;
  }

  return restoreIndexedActiveRef(graph, entry, nextIndex);
}

/** Moves the active selection forward through active ref history. */
export function redoActiveRef(graph: SessionGraph): SessionGraph {
  const metadata = normalizeMetadata(graph.metadata);
  const history = metadata.active_ref_history ?? [];
  const index = metadata.active_ref_history_index ?? history.length - 1;
  const nextIndex = index + 1;
  const entry = history[nextIndex];

  if (!entry) {
    return graph;
  }

  return restoreIndexedActiveRef(graph, entry, nextIndex);
}

function restoreIndexedActiveRef(
  graph: SessionGraph,
  entry: ActiveRefHistoryEntry,
  index: number,
): SessionGraph {
  const metadata = normalizeMetadata(graph.metadata);
  let branches = metadata.branches ?? [];

  if (entry.branch_id) {
    const branch = getBranch(graph, entry.branch_id);
    if (!branch) {
      throw new Error(`Branch '${entry.branch_id}' does not exist`);
    }

    const entryAssetId = metadata.provenance?.[entry.version_id]?.asset_id;
    const branchAssetId = metadata.provenance?.[branch.source_version_id]?.asset_id;
    if (entryAssetId && entryAssetId !== entry.asset_id) {
      throw new Error(
        `Cannot restore active refs to version '${entry.version_id}' because it belongs to asset '${entryAssetId}', not '${entry.asset_id}'`,
      );
    }
    if (entryAssetId && branchAssetId && entryAssetId !== branchAssetId) {
      throw new Error(
        `Cannot restore branch '${entry.branch_id}' to version '${entry.version_id}' because it belongs to asset '${entryAssetId}', not branch asset '${branchAssetId}'`,
      );
    }

    branches = (branches ?? []).map((candidate) =>
      candidate.branch_id === entry.branch_id
        ? { ...candidate, head_version_id: entry.version_id }
        : candidate,
    );
  }

  return {
    ...graph,
    active_refs: {
      asset_id: entry.asset_id,
      version_id: entry.version_id,
      ...(entry.branch_id ? { branch_id: entry.branch_id } : {}),
    },
    metadata: {
      ...metadata,
      branches,
      active_ref_history_index: index,
    },
    updated_at: entry.changed_at,
  };
}

function resolveStartVersionId(graph: SessionGraph, branchId?: string): string {
  if (!branchId) {
    return graph.active_refs.version_id;
  }

  const branch = getBranch(graph, branchId);
  if (!branch) {
    throw new Error(`Branch '${branchId}' does not exist`);
  }

  return branch.head_version_id;
}
