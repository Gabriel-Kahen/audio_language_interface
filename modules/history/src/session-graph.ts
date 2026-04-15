import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import type { ErrorObject } from "ajv";

export const SCHEMA_VERSION = "1.0.0" as const;

export type SessionNodeType =
  | "audio_asset"
  | "audio_version"
  | "analysis_report"
  | "semantic_profile"
  | "edit_plan"
  | "transform_record"
  | "render_artifact"
  | "comparison_report";

export type SessionRelation =
  | "has_version"
  | "analyzed_as"
  | "described_as"
  | "planned_from"
  | "executed_as"
  | "produced"
  | "rendered_as"
  | "compared_to"
  | "belongs_to";

export interface SessionNode {
  node_id: string;
  node_type: SessionNodeType;
  ref_id: string;
  created_at: string;
}

export interface SessionEdge {
  from_node_id: string;
  to_node_id: string;
  relation: SessionRelation;
}

export interface ActiveRefs {
  asset_id: string;
  version_id: string;
  branch_id?: string;
}

export interface SessionBranch {
  branch_id: string;
  head_version_id: string;
  source_version_id: string;
  created_at: string;
  label?: string;
}

export interface SessionSnapshot {
  snapshot_id: string;
  version_id: string;
  created_at: string;
  branch_id?: string;
  label?: string;
}

export interface ActiveRefHistoryEntry extends ActiveRefs {
  changed_at: string;
  reason?: string;
}

export interface ProvenanceRecord {
  asset_id?: string;
  version_id?: string;
  parent_version_id?: string;
  transform_record_id?: string;
  analysis_report_id?: string;
  plan_id?: string;
  input_version_id?: string;
  output_version_id?: string;
  baseline_ref_id?: string;
  baseline_ref_type?: "version" | "render";
  candidate_ref_id?: string;
  candidate_ref_type?: "version" | "render";
}

export interface SessionMetadata {
  branches?: SessionBranch[];
  snapshots?: SessionSnapshot[];
  active_ref_history?: ActiveRefHistoryEntry[];
  active_ref_history_index?: number;
  provenance?: Record<string, ProvenanceRecord>;
  [key: string]: unknown;
}

export interface SessionGraph {
  schema_version: typeof SCHEMA_VERSION;
  session_id: string;
  created_at: string;
  updated_at: string;
  nodes: SessionNode[];
  edges: SessionEdge[];
  active_refs: ActiveRefs;
  metadata?: SessionMetadata;
}

export interface AudioAssetRecord {
  asset_id: string;
  source: {
    imported_at: string;
  };
}

export interface AudioVersionRecord {
  version_id: string;
  asset_id: string;
  parent_version_id?: string;
  lineage: {
    created_at: string;
    created_by: string;
    plan_id?: string;
    transform_record_id?: string;
  };
}

export interface AnalysisReportRecord {
  report_id: string;
  asset_id: string;
  version_id: string;
  generated_at: string;
}

export interface SemanticProfileRecord {
  profile_id: string;
  analysis_report_id: string;
  asset_id: string;
  version_id: string;
  generated_at: string;
}

export interface EditPlanRecord {
  plan_id: string;
  asset_id: string;
  version_id: string;
  created_at: string;
}

export interface TransformRecordRecord {
  record_id: string;
  asset_id: string;
  input_version_id: string;
  output_version_id: string;
  plan_id?: string;
  finished_at: string;
}

export interface RenderArtifactRecord {
  render_id: string;
  asset_id: string;
  version_id: string;
  created_at: string;
}

export interface ComparisonReportRecord {
  comparison_id: string;
  generated_at: string;
  baseline: {
    ref_type: "version" | "render";
    ref_id: string;
  };
  candidate: {
    ref_type: "version" | "render";
    ref_id: string;
  };
}

export interface CreateSessionGraphInput {
  session_id: string;
  created_at: string;
  active_refs: ActiveRefs;
  metadata?: SessionMetadata;
}

export interface ValidationIssue {
  instancePath: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

const commonSchema = JSON.parse(
  readFileSync(
    new URL("../../../contracts/schemas/json/common.schema.json", import.meta.url),
    "utf8",
  ),
) as object;

const sessionGraphSchema = JSON.parse(
  readFileSync(
    new URL("../../../contracts/schemas/json/session-graph.schema.json", import.meta.url),
    "utf8",
  ),
) as object;

const require = createRequire(import.meta.url);
const {
  default: Ajv2020,
}: { default: typeof import("ajv/dist/2020.js").default } = require("ajv/dist/2020");
const {
  default: addFormats,
}: { default: typeof import("ajv-formats").default } = require("ajv-formats");

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(commonSchema);
const validateSchema = ajv.compile(sessionGraphSchema);

/**
 * Creates an empty session graph with normalized metadata containers.
 *
 * The initial `active_refs` are copied as-is and may point to artifacts that
 * have not been recorded yet.
 */
export function createSessionGraph(input: CreateSessionGraphInput): SessionGraph {
  const metadata = normalizeMetadata(input.metadata);
  const assetNode: SessionNode = {
    node_id: deriveNodeId(input.active_refs.asset_id),
    node_type: "audio_asset",
    ref_id: input.active_refs.asset_id,
    created_at: input.created_at,
  };
  const versionNode: SessionNode = {
    node_id: deriveNodeId(input.active_refs.version_id),
    node_type: "audio_version",
    ref_id: input.active_refs.version_id,
    created_at: input.created_at,
  };

  return {
    schema_version: SCHEMA_VERSION,
    session_id: input.session_id,
    created_at: input.created_at,
    updated_at: input.created_at,
    nodes: [assetNode, versionNode],
    edges: [
      {
        from_node_id: assetNode.node_id,
        to_node_id: versionNode.node_id,
        relation: "has_version",
      },
    ],
    active_refs: { ...input.active_refs },
    metadata: {
      ...metadata,
      active_ref_history: [
        ...(metadata.active_ref_history ?? []),
        {
          ...input.active_refs,
          changed_at: input.created_at,
          reason: "create_session_graph",
        },
      ],
      active_ref_history_index: (metadata.active_ref_history ?? []).length,
      provenance: {
        ...metadata.provenance,
        [input.active_refs.asset_id]: {
          ...(metadata.provenance?.[input.active_refs.asset_id] ?? {}),
          asset_id: input.active_refs.asset_id,
        },
        [input.active_refs.version_id]: {
          ...(metadata.provenance?.[input.active_refs.version_id] ?? {}),
          asset_id: input.active_refs.asset_id,
          version_id: input.active_refs.version_id,
        },
      },
    },
  };
}

/**
 * Validates a session graph against the published schema and additional
 * implementation-level integrity rules.
 */
export function validateSessionGraph(graph: SessionGraph): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!validateSchema(graph)) {
    issues.push(...formatAjvErrors(validateSchema.errors ?? []));
  }

  const nodeIds = new Set<string>();
  const refIds = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.node_id)) {
      issues.push({
        instancePath: "/nodes",
        message: `duplicate node_id '${node.node_id}'`,
      });
    }
    nodeIds.add(node.node_id);

    if (refIds.has(node.ref_id)) {
      issues.push({
        instancePath: "/nodes",
        message: `duplicate ref_id '${node.ref_id}'`,
      });
    }
    refIds.add(node.ref_id);
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from_node_id)) {
      issues.push({
        instancePath: "/edges",
        message: `edge.from_node_id '${edge.from_node_id}' does not reference a known node`,
      });
    }
    if (!nodeIds.has(edge.to_node_id)) {
      issues.push({
        instancePath: "/edges",
        message: `edge.to_node_id '${edge.to_node_id}' does not reference a known node`,
      });
    }
  }

  const assetNode = getNodeByRef(graph, graph.active_refs.asset_id);
  if (assetNode?.node_type !== "audio_asset") {
    issues.push({
      instancePath: "/active_refs/asset_id",
      message: `active asset '${graph.active_refs.asset_id}' does not reference an audio_asset node`,
    });
  }

  const versionNode = getNodeByRef(graph, graph.active_refs.version_id);
  if (versionNode?.node_type !== "audio_version") {
    issues.push({
      instancePath: "/active_refs/version_id",
      message: `active version '${graph.active_refs.version_id}' does not reference an audio_version node`,
    });
  }

  const metadata = normalizeMetadata(graph.metadata);
  const provenance = metadata.provenance ?? {};

  validateRequiredProvenance(graph, provenance, issues);

  const activeRefHistory = metadata.active_ref_history ?? [];
  const activeRefHistoryIndex = metadata.active_ref_history_index;

  validateActiveRefPair(graph, graph.active_refs, "/active_refs", issues);

  if (
    activeRefHistoryIndex !== undefined &&
    (!Number.isInteger(activeRefHistoryIndex) ||
      activeRefHistoryIndex < 0 ||
      activeRefHistoryIndex >= activeRefHistory.length)
  ) {
    issues.push({
      instancePath: "/metadata/active_ref_history_index",
      message: "active_ref_history_index must point to an entry in active_ref_history",
    });
  }

  for (const [index, entry] of activeRefHistory.entries()) {
    if (!hasNodeRef(graph, entry.asset_id, "audio_asset")) {
      issues.push({
        instancePath: `/metadata/active_ref_history/${index}/asset_id`,
        message: `active ref history asset '${entry.asset_id}' is unknown`,
      });
    }
    if (!hasNodeRef(graph, entry.version_id, "audio_version")) {
      issues.push({
        instancePath: `/metadata/active_ref_history/${index}/version_id`,
        message: `active ref history version '${entry.version_id}' is unknown`,
      });
    }
    if (entry.branch_id && !hasBranch(graph, entry.branch_id)) {
      issues.push({
        instancePath: `/metadata/active_ref_history/${index}/branch_id`,
        message: `active ref history branch '${entry.branch_id}' is unknown`,
      });
    }

    validateActiveRefPair(graph, entry, `/metadata/active_ref_history/${index}`, issues);
  }

  const branchIds = new Set<string>();
  for (const branch of metadata.branches ?? []) {
    if (branchIds.has(branch.branch_id)) {
      issues.push({
        instancePath: "/metadata/branches",
        message: `duplicate branch_id '${branch.branch_id}'`,
      });
    }
    branchIds.add(branch.branch_id);

    if (!hasNodeRef(graph, branch.head_version_id, "audio_version")) {
      issues.push({
        instancePath: "/metadata/branches",
        message: `branch '${branch.branch_id}' head version '${branch.head_version_id}' is unknown`,
      });
    }
    if (!hasNodeRef(graph, branch.source_version_id, "audio_version")) {
      issues.push({
        instancePath: "/metadata/branches",
        message: `branch '${branch.branch_id}' source version '${branch.source_version_id}' is unknown`,
      });
    }
  }

  const snapshotIds = new Set<string>();
  for (const snapshot of metadata.snapshots ?? []) {
    if (snapshotIds.has(snapshot.snapshot_id)) {
      issues.push({
        instancePath: "/metadata/snapshots",
        message: `duplicate snapshot_id '${snapshot.snapshot_id}'`,
      });
    }
    snapshotIds.add(snapshot.snapshot_id);

    if (!hasNodeRef(graph, snapshot.version_id, "audio_version")) {
      issues.push({
        instancePath: "/metadata/snapshots",
        message: `snapshot '${snapshot.snapshot_id}' version '${snapshot.version_id}' is unknown`,
      });
    }
    if (snapshot.branch_id && !hasBranch(graph, snapshot.branch_id)) {
      issues.push({
        instancePath: "/metadata/snapshots",
        message: `snapshot '${snapshot.snapshot_id}' branch '${snapshot.branch_id}' is unknown`,
      });
    }
  }

  for (const [refId, record] of Object.entries(provenance)) {
    const node = getNodeByRef(graph, refId);
    if (refId.startsWith("ver_") && record.parent_version_id === refId) {
      issues.push({
        instancePath: `/metadata/provenance/${refId}/parent_version_id`,
        message: "parent_version_id cannot equal version_id",
      });
    }

    if (!node) {
      issues.push({
        instancePath: `/metadata/provenance/${refId}`,
        message: `provenance ref '${refId}' does not reference a known node`,
      });
      continue;
    }

    validateProvenanceRecord(graph, node, record, issues);
  }

  validateParentCycles(graph, issues);

  if (graph.active_refs.branch_id && !hasBranch(graph, graph.active_refs.branch_id)) {
    issues.push({
      instancePath: "/active_refs/branch_id",
      message: `active branch '${graph.active_refs.branch_id}' is unknown`,
    });
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/** Throws when `validateSessionGraph` reports any issue. */
export function assertValidSessionGraph(graph: SessionGraph): void {
  const result = validateSessionGraph(graph);

  if (!result.valid) {
    const message = result.issues
      .map((issue) => `${issue.instancePath || "/"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid SessionGraph: ${message}`);
  }
}

export function getNodeById(graph: SessionGraph, nodeId: string): SessionNode | undefined {
  return graph.nodes.find((node) => node.node_id === nodeId);
}

export function getNodeByRef(
  graph: SessionGraph,
  refId: string,
  nodeType?: SessionNodeType,
): SessionNode | undefined {
  return graph.nodes.find(
    (node) => node.ref_id === refId && (!nodeType || node.node_type === nodeType),
  );
}

export function hasNodeRef(
  graph: SessionGraph,
  refId: string,
  nodeType?: SessionNodeType,
): boolean {
  return getNodeByRef(graph, refId, nodeType) !== undefined;
}

export function deriveNodeId(refId: string): string {
  return `node_${refId}`;
}

export function withUpdatedTimestamp(graph: SessionGraph, updatedAt: string): SessionGraph {
  return {
    ...graph,
    updated_at: updatedAt,
  };
}

/**
 * Normalizes implementation-owned metadata collections while preserving any
 * caller-owned metadata keys.
 */
export function normalizeMetadata(metadata?: SessionMetadata): SessionMetadata {
  const normalized: SessionMetadata = {
    ...(metadata ?? {}),
    branches: [...(metadata?.branches ?? [])],
    snapshots: [...(metadata?.snapshots ?? [])],
    active_ref_history: [...(metadata?.active_ref_history ?? [])],
    provenance: { ...(metadata?.provenance ?? {}) },
  };

  if (metadata?.active_ref_history_index !== undefined) {
    normalized.active_ref_history_index = metadata.active_ref_history_index;
  }

  return normalized;
}

export function hasBranch(graph: SessionGraph, branchId: string): boolean {
  return getBranch(graph, branchId) !== undefined;
}

export function getBranch(graph: SessionGraph, branchId: string): SessionBranch | undefined {
  return normalizeMetadata(graph.metadata).branches?.find(
    (branch) => branch.branch_id === branchId,
  );
}

function formatAjvErrors(errors: ErrorObject[]): ValidationIssue[] {
  return errors.map((error) => ({
    instancePath: error.instancePath,
    message: error.message ?? "validation error",
  }));
}

function validateProvenanceRecord(
  graph: SessionGraph,
  node: SessionNode,
  record: ProvenanceRecord,
  issues: ValidationIssue[],
): void {
  if (record.asset_id && !hasNodeRef(graph, record.asset_id, "audio_asset")) {
    issues.push({
      instancePath: `/metadata/provenance/${node.ref_id}/asset_id`,
      message: `asset '${record.asset_id}' does not reference a known audio_asset node`,
    });
  }

  switch (node.node_type) {
    case "audio_asset": {
      if (record.asset_id !== node.ref_id) {
        issues.push({
          instancePath: `/metadata/provenance/${node.ref_id}/asset_id`,
          message: "audio asset provenance must repeat its own asset_id",
        });
      }
      break;
    }
    case "audio_version": {
      if (record.version_id !== node.ref_id) {
        issues.push({
          instancePath: `/metadata/provenance/${node.ref_id}/version_id`,
          message: "audio version provenance must repeat its own version_id",
        });
      }
      if (!record.asset_id) {
        issues.push({
          instancePath: `/metadata/provenance/${node.ref_id}/asset_id`,
          message: "audio version provenance requires asset_id",
        });
      }
      if (
        record.parent_version_id &&
        !hasNodeRef(graph, record.parent_version_id, "audio_version")
      ) {
        issues.push({
          instancePath: `/metadata/provenance/${node.ref_id}/parent_version_id`,
          message: `parent version '${record.parent_version_id}' does not reference a known audio_version node`,
        });
      }
      if (record.parent_version_id === node.ref_id) {
        issues.push({
          instancePath: `/metadata/provenance/${node.ref_id}/parent_version_id`,
          message: "parent_version_id cannot equal version_id",
        });
      }
      if (record.plan_id && !hasNodeRef(graph, record.plan_id, "edit_plan")) {
        issues.push({
          instancePath: `/metadata/provenance/${node.ref_id}/plan_id`,
          message: `plan '${record.plan_id}' does not reference a known edit_plan node`,
        });
      }
      if (record.transform_record_id) {
        if (!hasNodeRef(graph, record.transform_record_id, "transform_record")) {
          issues.push({
            instancePath: `/metadata/provenance/${node.ref_id}/transform_record_id`,
            message: `transform record '${record.transform_record_id}' does not reference a known transform_record node`,
          });
        }

        const transformOutputVersionId = normalizeMetadata(graph.metadata).provenance?.[
          record.transform_record_id
        ]?.output_version_id;
        if (transformOutputVersionId && transformOutputVersionId !== node.ref_id) {
          issues.push({
            instancePath: `/metadata/provenance/${node.ref_id}/transform_record_id`,
            message: `transform record '${record.transform_record_id}' does not produce version '${node.ref_id}'`,
          });
        }
      }
      break;
    }
    case "semantic_profile": {
      if (
        record.analysis_report_id &&
        !hasNodeRef(graph, record.analysis_report_id, "analysis_report")
      ) {
        issues.push({
          instancePath: `/metadata/provenance/${node.ref_id}/analysis_report_id`,
          message: `analysis report '${record.analysis_report_id}' does not reference a known analysis_report node`,
        });
      }
      break;
    }
    case "edit_plan": {
      if (record.plan_id !== node.ref_id) {
        issues.push({
          instancePath: `/metadata/provenance/${node.ref_id}/plan_id`,
          message: "edit plan provenance must repeat its own plan_id",
        });
      }
      if (record.version_id && !hasNodeRef(graph, record.version_id, "audio_version")) {
        issues.push({
          instancePath: `/metadata/provenance/${node.ref_id}/version_id`,
          message: `version '${record.version_id}' does not reference a known audio_version node`,
        });
      }
      break;
    }
    case "transform_record": {
      if (record.plan_id && !hasNodeRef(graph, record.plan_id, "edit_plan")) {
        issues.push({
          instancePath: `/metadata/provenance/${node.ref_id}/plan_id`,
          message: `plan '${record.plan_id}' does not reference a known edit_plan node`,
        });
      }
      if (record.input_version_id && !hasNodeRef(graph, record.input_version_id, "audio_version")) {
        issues.push({
          instancePath: `/metadata/provenance/${node.ref_id}/input_version_id`,
          message: `input version '${record.input_version_id}' does not reference a known audio_version node`,
        });
      }
      if (
        record.output_version_id &&
        !hasNodeRef(graph, record.output_version_id, "audio_version")
      ) {
        issues.push({
          instancePath: `/metadata/provenance/${node.ref_id}/output_version_id`,
          message: `output version '${record.output_version_id}' does not reference a known audio_version node`,
        });
      }
      if (record.input_version_id) {
        const inputAssetId = normalizeMetadata(graph.metadata).provenance?.[record.input_version_id]
          ?.asset_id;
        if (inputAssetId && record.asset_id && inputAssetId !== record.asset_id) {
          issues.push({
            instancePath: `/metadata/provenance/${node.ref_id}/input_version_id`,
            message: `input version '${record.input_version_id}' belongs to asset '${inputAssetId}', not '${record.asset_id}'`,
          });
        }
      }
      if (record.output_version_id) {
        const outputRecord = normalizeMetadata(graph.metadata).provenance?.[
          record.output_version_id
        ];
        if (
          outputRecord?.asset_id &&
          record.asset_id &&
          outputRecord.asset_id !== record.asset_id
        ) {
          issues.push({
            instancePath: `/metadata/provenance/${node.ref_id}/output_version_id`,
            message: `output version '${record.output_version_id}' belongs to asset '${outputRecord.asset_id}', not '${record.asset_id}'`,
          });
        }
        if (outputRecord && outputRecord.transform_record_id !== node.ref_id) {
          issues.push({
            instancePath: `/metadata/provenance/${node.ref_id}/output_version_id`,
            message: `output version '${record.output_version_id}' does not link back to transform record '${node.ref_id}'`,
          });
        }
      }
      break;
    }
    case "render_artifact":
    case "analysis_report": {
      if (record.version_id && !hasNodeRef(graph, record.version_id, "audio_version")) {
        issues.push({
          instancePath: `/metadata/provenance/${node.ref_id}/version_id`,
          message: `version '${record.version_id}' does not reference a known audio_version node`,
        });
      }
      break;
    }
    case "comparison_report": {
      if (record.baseline_ref_id) {
        const baselineType =
          record.baseline_ref_type === "render" ? "render_artifact" : "audio_version";
        if (!hasNodeRef(graph, record.baseline_ref_id, baselineType)) {
          issues.push({
            instancePath: `/metadata/provenance/${node.ref_id}/baseline_ref_id`,
            message: `baseline ref '${record.baseline_ref_id}' does not reference a known ${baselineType} node`,
          });
        }
      }
      if (record.candidate_ref_id) {
        const candidateType =
          record.candidate_ref_type === "render" ? "render_artifact" : "audio_version";
        if (!hasNodeRef(graph, record.candidate_ref_id, candidateType)) {
          issues.push({
            instancePath: `/metadata/provenance/${node.ref_id}/candidate_ref_id`,
            message: `candidate ref '${record.candidate_ref_id}' does not reference a known ${candidateType} node`,
          });
        }
      }
      break;
    }
  }
}

function validateRequiredProvenance(
  graph: SessionGraph,
  provenance: Record<string, ProvenanceRecord>,
  issues: ValidationIssue[],
): void {
  for (const node of graph.nodes) {
    if (node.node_type === "audio_asset" && !provenance[node.ref_id]) {
      issues.push({
        instancePath: `/metadata/provenance/${node.ref_id}`,
        message: "audio asset provenance is required",
      });
    }

    if (node.node_type === "audio_version" && !provenance[node.ref_id]) {
      issues.push({
        instancePath: `/metadata/provenance/${node.ref_id}`,
        message: "audio version provenance is required",
      });
    }
  }
}

function validateActiveRefPair(
  graph: SessionGraph,
  refs: ActiveRefs,
  instancePath: string,
  issues: ValidationIssue[],
): void {
  const versionRecord = normalizeMetadata(graph.metadata).provenance?.[refs.version_id];
  if (!versionRecord) {
    issues.push({
      instancePath: `${instancePath}/version_id`,
      message: `version '${refs.version_id}' is missing required provenance`,
    });
    return;
  }

  if (versionRecord.asset_id !== refs.asset_id) {
    issues.push({
      instancePath: `${instancePath}/asset_id`,
      message: `asset '${refs.asset_id}' does not own version '${refs.version_id}'`,
    });
  }
}

function validateParentCycles(graph: SessionGraph, issues: ValidationIssue[]): void {
  for (const node of graph.nodes) {
    if (node.node_type !== "audio_version") {
      continue;
    }

    const visited = new Set<string>([node.ref_id]);
    let cursor = normalizeMetadata(graph.metadata).provenance?.[node.ref_id]?.parent_version_id;

    while (cursor) {
      if (visited.has(cursor)) {
        issues.push({
          instancePath: `/metadata/provenance/${node.ref_id}/parent_version_id`,
          message: `version ancestry for '${node.ref_id}' contains a cycle through '${cursor}'`,
        });
        break;
      }

      visited.add(cursor);
      cursor = normalizeMetadata(graph.metadata).provenance?.[cursor]?.parent_version_id;
    }
  }
}
