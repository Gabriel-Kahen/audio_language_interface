import { addEdge } from "./record-edge.js";
import {
  type AnalysisReportRecord,
  type AudioAssetRecord,
  type AudioVersionRecord,
  type ComparisonReportRecord,
  deriveNodeId,
  type EditPlanRecord,
  getNodeByRef,
  normalizeMetadata,
  type RenderArtifactRecord,
  type SemanticProfileRecord,
  type SessionGraph,
  type SessionNode,
  type TransformRecordRecord,
  withUpdatedTimestamp,
} from "./session-graph.js";

export interface RecordOptions {
  set_active?: boolean;
  branch_id?: string;
}

/** Adds a node when its `node_id` and `ref_id` are unique. */
export function addNode(graph: SessionGraph, node: SessionNode, updatedAt: string): SessionGraph {
  const duplicateNode = graph.nodes.find((existing) => existing.node_id === node.node_id);
  if (duplicateNode) {
    if (duplicateNode.node_type !== node.node_type || duplicateNode.ref_id !== node.ref_id) {
      throw new Error(`Node id '${node.node_id}' is already used by a different node`);
    }

    return graph;
  }

  const duplicateRef = graph.nodes.find((existing) => existing.ref_id === node.ref_id);
  if (duplicateRef) {
    throw new Error(`Artifact ref '${node.ref_id}' is already recorded in the session graph`);
  }

  return withUpdatedTimestamp(
    {
      ...graph,
      nodes: [...graph.nodes, node],
    },
    updatedAt,
  );
}

/** Records an `audio_asset` node and initializes asset provenance. */
export function recordAudioAsset(graph: SessionGraph, asset: AudioAssetRecord): SessionGraph {
  const nextGraph = addNode(
    graph,
    {
      node_id: deriveNodeId(asset.asset_id),
      node_type: "audio_asset",
      ref_id: asset.asset_id,
      created_at: asset.source.imported_at,
    },
    asset.source.imported_at,
  );

  return mergeProvenance(nextGraph, asset.asset_id, {}, asset.source.imported_at);
}

/**
 * Records an `audio_version`, links it to its asset, updates provenance, and
 * makes it active by default.
 */
export function recordAudioVersion(
  graph: SessionGraph,
  version: AudioVersionRecord,
  options?: RecordOptions,
): SessionGraph {
  requireNode(graph, version.asset_id, "audio_asset");

  let nextGraph = addNode(
    graph,
    {
      node_id: deriveNodeId(version.version_id),
      node_type: "audio_version",
      ref_id: version.version_id,
      created_at: version.lineage.created_at,
    },
    version.lineage.created_at,
  );

  nextGraph = addEdge(
    nextGraph,
    {
      from_node_id: deriveNodeId(version.asset_id),
      to_node_id: deriveNodeId(version.version_id),
      relation: "has_version",
    },
    version.lineage.created_at,
  );

  nextGraph = mergeProvenance(
    nextGraph,
    version.version_id,
    {
      asset_id: version.asset_id,
      parent_version_id: version.parent_version_id,
      plan_id: version.lineage.plan_id,
      transform_record_id: version.lineage.transform_record_id,
      version_id: version.version_id,
    },
    version.lineage.created_at,
  );

  if (options?.branch_id) {
    nextGraph = assignBranchHead(
      nextGraph,
      options.branch_id,
      version.version_id,
      version.lineage.created_at,
    );
  }

  if (options?.set_active ?? true) {
    nextGraph = {
      ...nextGraph,
      active_refs: {
        asset_id: version.asset_id,
        version_id: version.version_id,
        ...(options?.branch_id
          ? { branch_id: options.branch_id }
          : nextGraph.active_refs.branch_id
            ? { branch_id: nextGraph.active_refs.branch_id }
            : {}),
      },
    };
  }

  return withActiveHistory(nextGraph, version.lineage.created_at, "record_audio_version");
}

/** Records an analysis report and links it to the source version and asset. */
export function recordAnalysisReport(
  graph: SessionGraph,
  report: AnalysisReportRecord,
): SessionGraph {
  requireNode(graph, report.asset_id, "audio_asset");
  requireNode(graph, report.version_id, "audio_version");

  let nextGraph = addNode(
    graph,
    {
      node_id: deriveNodeId(report.report_id),
      node_type: "analysis_report",
      ref_id: report.report_id,
      created_at: report.generated_at,
    },
    report.generated_at,
  );

  nextGraph = addEdge(
    nextGraph,
    {
      from_node_id: deriveNodeId(report.version_id),
      to_node_id: deriveNodeId(report.report_id),
      relation: "analyzed_as",
    },
    report.generated_at,
  );

  nextGraph = addEdge(
    nextGraph,
    {
      from_node_id: deriveNodeId(report.report_id),
      to_node_id: deriveNodeId(report.asset_id),
      relation: "belongs_to",
    },
    report.generated_at,
  );

  return mergeProvenance(
    nextGraph,
    report.report_id,
    {
      asset_id: report.asset_id,
      version_id: report.version_id,
    },
    report.generated_at,
  );
}

/** Records a semantic profile derived from a previously recorded analysis report. */
export function recordSemanticProfile(
  graph: SessionGraph,
  profile: SemanticProfileRecord,
): SessionGraph {
  requireNode(graph, profile.analysis_report_id, "analysis_report");
  requireNode(graph, profile.asset_id, "audio_asset");
  requireNode(graph, profile.version_id, "audio_version");

  let nextGraph = addNode(
    graph,
    {
      node_id: deriveNodeId(profile.profile_id),
      node_type: "semantic_profile",
      ref_id: profile.profile_id,
      created_at: profile.generated_at,
    },
    profile.generated_at,
  );

  nextGraph = addEdge(
    nextGraph,
    {
      from_node_id: deriveNodeId(profile.analysis_report_id),
      to_node_id: deriveNodeId(profile.profile_id),
      relation: "described_as",
    },
    profile.generated_at,
  );

  nextGraph = addEdge(
    nextGraph,
    {
      from_node_id: deriveNodeId(profile.profile_id),
      to_node_id: deriveNodeId(profile.asset_id),
      relation: "belongs_to",
    },
    profile.generated_at,
  );

  return mergeProvenance(
    nextGraph,
    profile.profile_id,
    {
      asset_id: profile.asset_id,
      version_id: profile.version_id,
      analysis_report_id: profile.analysis_report_id,
    },
    profile.generated_at,
  );
}

/** Records an edit plan for a previously recorded version. */
export function recordEditPlan(graph: SessionGraph, plan: EditPlanRecord): SessionGraph {
  requireNode(graph, plan.asset_id, "audio_asset");
  requireNode(graph, plan.version_id, "audio_version");

  let nextGraph = addNode(
    graph,
    {
      node_id: deriveNodeId(plan.plan_id),
      node_type: "edit_plan",
      ref_id: plan.plan_id,
      created_at: plan.created_at,
    },
    plan.created_at,
  );

  nextGraph = addEdge(
    nextGraph,
    {
      from_node_id: deriveNodeId(plan.version_id),
      to_node_id: deriveNodeId(plan.plan_id),
      relation: "planned_from",
    },
    plan.created_at,
  );

  nextGraph = addEdge(
    nextGraph,
    {
      from_node_id: deriveNodeId(plan.plan_id),
      to_node_id: deriveNodeId(plan.asset_id),
      relation: "belongs_to",
    },
    plan.created_at,
  );

  return mergeProvenance(
    setPlanRequest(nextGraph, plan.plan_id, plan.user_request, plan.created_at),
    plan.plan_id,
    {
      asset_id: plan.asset_id,
      version_id: plan.version_id,
      plan_id: plan.plan_id,
    },
    plan.created_at,
  );
}

/**
 * Records a transform execution after both input and output versions exist in
 * the graph.
 */
export function recordTransformRecord(
  graph: SessionGraph,
  record: TransformRecordRecord,
): SessionGraph {
  requireNode(graph, record.asset_id, "audio_asset");
  requireNode(graph, record.input_version_id, "audio_version");
  requireNode(graph, record.output_version_id, "audio_version");

  if (record.plan_id) {
    requireNode(graph, record.plan_id, "edit_plan");
  }

  let nextGraph = addNode(
    graph,
    {
      node_id: deriveNodeId(record.record_id),
      node_type: "transform_record",
      ref_id: record.record_id,
      created_at: record.finished_at,
    },
    record.finished_at,
  );

  if (record.plan_id) {
    nextGraph = addEdge(
      nextGraph,
      {
        from_node_id: deriveNodeId(record.plan_id),
        to_node_id: deriveNodeId(record.record_id),
        relation: "executed_as",
      },
      record.finished_at,
    );
  }

  nextGraph = addEdge(
    nextGraph,
    {
      from_node_id: deriveNodeId(record.record_id),
      to_node_id: deriveNodeId(record.output_version_id),
      relation: "produced",
    },
    record.finished_at,
  );

  nextGraph = addEdge(
    nextGraph,
    {
      from_node_id: deriveNodeId(record.record_id),
      to_node_id: deriveNodeId(record.asset_id),
      relation: "belongs_to",
    },
    record.finished_at,
  );

  return mergeProvenance(
    nextGraph,
    record.record_id,
    {
      asset_id: record.asset_id,
      input_version_id: record.input_version_id,
      output_version_id: record.output_version_id,
      plan_id: record.plan_id,
    },
    record.finished_at,
  );
}

/** Records a render artifact for a previously recorded version. */
export function recordRenderArtifact(
  graph: SessionGraph,
  render: RenderArtifactRecord,
): SessionGraph {
  requireNode(graph, render.asset_id, "audio_asset");
  requireNode(graph, render.version_id, "audio_version");

  let nextGraph = addNode(
    graph,
    {
      node_id: deriveNodeId(render.render_id),
      node_type: "render_artifact",
      ref_id: render.render_id,
      created_at: render.created_at,
    },
    render.created_at,
  );

  nextGraph = addEdge(
    nextGraph,
    {
      from_node_id: deriveNodeId(render.version_id),
      to_node_id: deriveNodeId(render.render_id),
      relation: "rendered_as",
    },
    render.created_at,
  );

  nextGraph = addEdge(
    nextGraph,
    {
      from_node_id: deriveNodeId(render.render_id),
      to_node_id: deriveNodeId(render.asset_id),
      relation: "belongs_to",
    },
    render.created_at,
  );

  return mergeProvenance(
    nextGraph,
    render.render_id,
    {
      asset_id: render.asset_id,
      version_id: render.version_id,
    },
    render.created_at,
  );
}

/** Records a comparison report between existing version or render refs. */
export function recordComparisonReport(
  graph: SessionGraph,
  comparison: ComparisonReportRecord,
): SessionGraph {
  requireComparableNode(graph, comparison.baseline.ref_type, comparison.baseline.ref_id);
  requireComparableNode(graph, comparison.candidate.ref_type, comparison.candidate.ref_id);

  let nextGraph = addNode(
    graph,
    {
      node_id: deriveNodeId(comparison.comparison_id),
      node_type: "comparison_report",
      ref_id: comparison.comparison_id,
      created_at: comparison.generated_at,
    },
    comparison.generated_at,
  );

  nextGraph = addEdge(
    nextGraph,
    {
      from_node_id: deriveNodeId(comparison.baseline.ref_id),
      to_node_id: deriveNodeId(comparison.comparison_id),
      relation: "compared_to",
    },
    comparison.generated_at,
  );

  nextGraph = addEdge(
    nextGraph,
    {
      from_node_id: deriveNodeId(comparison.comparison_id),
      to_node_id: deriveNodeId(comparison.candidate.ref_id),
      relation: "compared_to",
    },
    comparison.generated_at,
  );

  return mergeProvenance(
    nextGraph,
    comparison.comparison_id,
    {
      baseline_ref_id: comparison.baseline.ref_id,
      baseline_ref_type: comparison.baseline.ref_type,
      candidate_ref_id: comparison.candidate.ref_id,
      candidate_ref_type: comparison.candidate.ref_type,
    },
    comparison.generated_at,
  );
}

function requireNode(graph: SessionGraph, refId: string, nodeType: SessionNode["node_type"]): void {
  const node = getNodeByRef(graph, refId, nodeType);
  if (!node) {
    throw new Error(`Required ${nodeType} '${refId}' is not present in the session graph`);
  }
}

function requireComparableNode(
  graph: SessionGraph,
  refType: "version" | "render",
  refId: string,
): void {
  if (refType === "version") {
    requireNode(graph, refId, "audio_version");
    return;
  }

  requireNode(graph, refId, "render_artifact");
}

function mergeProvenance(
  graph: SessionGraph,
  refId: string,
  record: Record<string, string | undefined>,
  updatedAt: string,
): SessionGraph {
  const metadata = normalizeMetadata(graph.metadata);
  const previous = metadata.provenance?.[refId] ?? {};

  return withUpdatedTimestamp(
    {
      ...graph,
      metadata: {
        ...metadata,
        provenance: {
          ...metadata.provenance,
          [refId]: {
            ...previous,
            ...record,
          },
        },
      },
    },
    updatedAt,
  );
}

function assignBranchHead(
  graph: SessionGraph,
  branchId: string,
  versionId: string,
  updatedAt: string,
): SessionGraph {
  const metadata = normalizeMetadata(graph.metadata);
  const branches = metadata.branches ?? [];
  const branchIndex = branches.findIndex((branch) => branch.branch_id === branchId);

  if (branchIndex === -1) {
    throw new Error(`Branch '${branchId}' does not exist`);
  }

  const nextBranches = [...branches];
  const existingBranch = nextBranches[branchIndex];
  if (!existingBranch) {
    throw new Error(`Branch '${branchId}' does not exist`);
  }

  nextBranches[branchIndex] = {
    ...existingBranch,
    head_version_id: versionId,
  };

  return withUpdatedTimestamp(
    {
      ...graph,
      metadata: {
        ...metadata,
        branches: nextBranches,
      },
    },
    updatedAt,
  );
}

function setPlanRequest(
  graph: SessionGraph,
  planId: string,
  userRequest: string | undefined,
  updatedAt: string,
): SessionGraph {
  if (userRequest === undefined) {
    return graph;
  }

  const metadata = normalizeMetadata(graph.metadata);

  return withUpdatedTimestamp(
    {
      ...graph,
      metadata: {
        ...metadata,
        plan_requests: {
          ...metadata.plan_requests,
          [planId]: userRequest,
        },
      },
    },
    updatedAt,
  );
}

function withActiveHistory(graph: SessionGraph, changedAt: string, reason: string): SessionGraph {
  const metadata = normalizeMetadata(graph.metadata);
  const previousHistory = metadata.active_ref_history ?? [];
  const previousIndex = metadata.active_ref_history_index ?? previousHistory.length - 1;
  const trimmedHistory = previousHistory.slice(0, Math.max(previousIndex + 1, 0));
  const lastEntry = trimmedHistory.at(-1);

  if (
    lastEntry?.asset_id === graph.active_refs.asset_id &&
    lastEntry.version_id === graph.active_refs.version_id &&
    lastEntry.branch_id === graph.active_refs.branch_id
  ) {
    return graph;
  }

  const nextHistory = [
    ...trimmedHistory,
    {
      ...graph.active_refs,
      changed_at: changedAt,
      reason,
    },
  ];

  return {
    ...graph,
    metadata: {
      ...metadata,
      active_ref_history: nextHistory,
      active_ref_history_index: nextHistory.length - 1,
    },
  };
}
