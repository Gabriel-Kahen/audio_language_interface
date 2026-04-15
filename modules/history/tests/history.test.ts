import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createBranch,
  createSessionGraph,
  createSnapshot,
  getBranch,
  getVersionFollowUpRequest,
  recordAnalysisReport,
  recordAudioAsset,
  recordAudioVersion,
  recordComparisonReport,
  recordEditPlan,
  recordRenderArtifact,
  recordSemanticProfile,
  recordTransformRecord,
  redoActiveRef,
  resolveRedoTargets,
  resolveRevertTarget,
  resolveUndoTarget,
  revertToVersion,
  type SessionGraph,
  undoActiveRef,
  validateSessionGraph,
} from "../src/index.js";

const sessionGraphExample = JSON.parse(
  readFileSync(new URL("../../../contracts/examples/session-graph.json", import.meta.url), "utf8"),
) as SessionGraph;

describe("history module", () => {
  it("validates the published session graph example", () => {
    expect(validateSessionGraph(sessionGraphExample).valid).toBe(true);
  });

  it("creates a contract-valid graph from initial active refs", () => {
    const graph = createSessionGraph({
      session_id: "session_01HZX8J7J2V3M4N5P6Q7R8S9TA",
      created_at: "2026-04-14T20:00:00Z",
      active_refs: {
        asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9TA",
        version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9TA",
      },
    });

    expect(validateSessionGraph(graph).valid).toBe(true);
    expect(graph.nodes.map((node) => node.ref_id)).toEqual([
      "asset_01HZX8A7J2V3M4N5P6Q7R8S9TA",
      "ver_01HZX8B7J2V3M4N5P6Q7R8S9TA",
    ]);
    expect(graph.metadata?.provenance?.ver_01HZX8B7J2V3M4N5P6Q7R8S9TA?.asset_id).toBe(
      "asset_01HZX8A7J2V3M4N5P6Q7R8S9TA",
    );
  });

  it("records provenance across plans, transforms, renders, and comparisons", () => {
    let graph = createSessionGraph({
      session_id: "session_01HZX8J7J2V3M4N5P6Q7R8S9T0",
      created_at: "2026-04-14T20:20:00Z",
      active_refs: {
        asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
        version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T0",
      },
    });

    graph = recordAudioAsset(graph, {
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
      source: { imported_at: "2026-04-14T20:20:00Z" },
    });

    graph = recordAudioVersion(graph, {
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
      version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T0",
      lineage: {
        created_at: "2026-04-14T20:20:05Z",
        created_by: "modules/io",
      },
    });

    graph = recordAnalysisReport(graph, {
      report_id: "analysis_01HZX8C7J2V3M4N5P6Q7R8S9T0",
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
      version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T0",
      generated_at: "2026-04-14T20:20:10Z",
    });

    graph = recordSemanticProfile(graph, {
      profile_id: "semantic_01HZX8D7J2V3M4N5P6Q7R8S9T0",
      analysis_report_id: "analysis_01HZX8C7J2V3M4N5P6Q7R8S9T0",
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
      version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T0",
      generated_at: "2026-04-14T20:20:12Z",
    });

    graph = recordEditPlan(graph, {
      plan_id: "plan_01HZX8E7J2V3M4N5P6Q7R8S9T0",
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
      version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T0",
      created_at: "2026-04-14T20:20:15Z",
      user_request: "Make it darker",
    });

    graph = recordAudioVersion(graph, {
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
      version_id: "ver_01HZX8G7J2V3M4N5P6Q7R8S9T0",
      parent_version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T0",
      lineage: {
        created_at: "2026-04-14T20:20:18Z",
        created_by: "modules/transforms",
        plan_id: "plan_01HZX8E7J2V3M4N5P6Q7R8S9T0",
        transform_record_id: "transform_01HZX8F7J2V3M4N5P6Q7R8S9T0",
      },
    });

    graph = recordTransformRecord(graph, {
      record_id: "transform_01HZX8F7J2V3M4N5P6Q7R8S9T0",
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
      input_version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T0",
      output_version_id: "ver_01HZX8G7J2V3M4N5P6Q7R8S9T0",
      plan_id: "plan_01HZX8E7J2V3M4N5P6Q7R8S9T0",
      finished_at: "2026-04-14T20:20:18Z",
    });

    graph = recordRenderArtifact(graph, {
      render_id: "render_01HZX8H7J2V3M4N5P6Q7R8S9T0",
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
      version_id: "ver_01HZX8G7J2V3M4N5P6Q7R8S9T0",
      created_at: "2026-04-14T20:20:20Z",
    });

    graph = recordComparisonReport(graph, {
      comparison_id: "compare_01HZX8I7J2V3M4N5P6Q7R8S9T0",
      generated_at: "2026-04-14T20:20:22Z",
      baseline: {
        ref_type: "version",
        ref_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T0",
      },
      candidate: {
        ref_type: "render",
        ref_id: "render_01HZX8H7J2V3M4N5P6Q7R8S9T0",
      },
    });

    expect(validateSessionGraph(graph).valid).toBe(true);
    expect(graph.metadata?.provenance?.ver_01HZX8G7J2V3M4N5P6Q7R8S9T0?.parent_version_id).toBe(
      "ver_01HZX8B7J2V3M4N5P6Q7R8S9T0",
    );
    expect(graph.metadata?.provenance?.ver_01HZX8G7J2V3M4N5P6Q7R8S9T0?.transform_record_id).toBe(
      "transform_01HZX8F7J2V3M4N5P6Q7R8S9T0",
    );
    expect(getVersionFollowUpRequest(graph, "ver_01HZX8G7J2V3M4N5P6Q7R8S9T0")).toBe(
      "Make it darker",
    );
    expect(
      graph.edges.some(
        (edge) =>
          edge.from_node_id === "node_plan_01HZX8E7J2V3M4N5P6Q7R8S9T0" &&
          edge.to_node_id === "node_transform_01HZX8F7J2V3M4N5P6Q7R8S9T0" &&
          edge.relation === "executed_as",
      ),
    ).toBe(true);
    expect(
      graph.edges.some(
        (edge) =>
          edge.from_node_id === "node_compare_01HZX8I7J2V3M4N5P6Q7R8S9T0" &&
          edge.to_node_id === "node_render_01HZX8H7J2V3M4N5P6Q7R8S9T0" &&
          edge.relation === "compared_to",
      ),
    ).toBe(true);
  });

  it("supports branch creation, snapshots, and revert target resolution", () => {
    let graph = createSessionGraph({
      session_id: "session_01HZX8J7J2V3M4N5P6Q7R8S9T1",
      created_at: "2026-04-14T21:00:00Z",
      active_refs: {
        asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T1",
        version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T1",
      },
    });

    graph = recordAudioAsset(graph, {
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T1",
      source: { imported_at: "2026-04-14T21:00:00Z" },
    });
    graph = recordAudioVersion(graph, {
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T1",
      version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T1",
      lineage: {
        created_at: "2026-04-14T21:00:01Z",
        created_by: "modules/io",
      },
    });
    graph = createBranch(graph, {
      branch_id: "branch_darken",
      source_version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T1",
      created_at: "2026-04-14T21:00:02Z",
      label: "darken branch",
    });
    graph = recordAudioVersion(
      graph,
      {
        asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T1",
        version_id: "ver_01HZX8C7J2V3M4N5P6Q7R8S9T1",
        parent_version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T1",
        lineage: {
          created_at: "2026-04-14T21:00:03Z",
          created_by: "modules/transforms",
        },
      },
      { branch_id: "branch_darken" },
    );
    graph = createSnapshot(graph, {
      snapshot_id: "snapshot_darken_v1",
      branch_id: "branch_darken",
      version_id: "ver_01HZX8C7J2V3M4N5P6Q7R8S9T1",
      created_at: "2026-04-14T21:00:04Z",
      label: "first darken pass",
    });
    graph = recordAudioVersion(
      graph,
      {
        asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T1",
        version_id: "ver_01HZX8D7J2V3M4N5P6Q7R8S9T1",
        parent_version_id: "ver_01HZX8C7J2V3M4N5P6Q7R8S9T1",
        lineage: {
          created_at: "2026-04-14T21:00:05Z",
          created_by: "modules/transforms",
        },
      },
      { branch_id: "branch_darken" },
    );

    expect(resolveRevertTarget(graph, { branch_id: "branch_darken" })).toBe(
      "ver_01HZX8C7J2V3M4N5P6Q7R8S9T1",
    );

    const reverted = revertToVersion(
      graph,
      "ver_01HZX8C7J2V3M4N5P6Q7R8S9T1",
      "2026-04-14T21:00:06Z",
    );
    expect(reverted.active_refs.version_id).toBe("ver_01HZX8C7J2V3M4N5P6Q7R8S9T1");
    expect(reverted.active_refs.branch_id).toBe("branch_darken");
    expect(reverted.metadata?.snapshots).toHaveLength(1);
  });

  it("supports undo and redo over active ref history", () => {
    let graph = createSessionGraph({
      session_id: "session_01HZX8J7J2V3M4N5P6Q7R8S9T2",
      created_at: "2026-04-14T22:00:00Z",
      active_refs: {
        asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T2",
        version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T2",
      },
    });

    graph = recordAudioAsset(graph, {
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T2",
      source: { imported_at: "2026-04-14T22:00:00Z" },
    });
    graph = recordAudioVersion(graph, {
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T2",
      version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T2",
      lineage: {
        created_at: "2026-04-14T22:00:01Z",
        created_by: "modules/io",
      },
    });
    graph = recordAudioVersion(graph, {
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T2",
      version_id: "ver_01HZX8C7J2V3M4N5P6Q7R8S9T2",
      parent_version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T2",
      lineage: {
        created_at: "2026-04-14T22:00:02Z",
        created_by: "modules/transforms",
      },
    });

    const undone = undoActiveRef(graph);
    expect(undone.active_refs.version_id).toBe("ver_01HZX8B7J2V3M4N5P6Q7R8S9T2");

    const redone = redoActiveRef(undone);
    expect(redone.active_refs.version_id).toBe("ver_01HZX8C7J2V3M4N5P6Q7R8S9T2");
  });

  it("resolves undo targets from explicit active ref history", () => {
    let graph = createSessionGraph({
      session_id: "session_01HZX8J7J2V3M4N5P6Q7R8S9T2A",
      created_at: "2026-04-14T22:02:00Z",
      active_refs: {
        asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T2A",
        version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T2A",
      },
    });

    graph = recordAudioAsset(graph, {
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T2A",
      source: { imported_at: "2026-04-14T22:02:00Z" },
    });
    graph = recordAudioVersion(graph, {
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T2A",
      version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T2A",
      lineage: {
        created_at: "2026-04-14T22:02:01Z",
        created_by: "modules/io",
      },
    });
    graph = recordAudioVersion(graph, {
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T2A",
      version_id: "ver_01HZX8C7J2V3M4N5P6Q7R8S9T2A",
      parent_version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T2A",
      lineage: {
        created_at: "2026-04-14T22:02:02Z",
        created_by: "modules/transforms",
      },
    });
    graph = recordAudioVersion(graph, {
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T2A",
      version_id: "ver_01HZX8D7J2V3M4N5P6Q7R8S9T2A",
      parent_version_id: "ver_01HZX8C7J2V3M4N5P6Q7R8S9T2A",
      lineage: {
        created_at: "2026-04-14T22:02:03Z",
        created_by: "modules/transforms",
      },
    });

    expect(resolveUndoTarget(graph)).toBe("ver_01HZX8C7J2V3M4N5P6Q7R8S9T2A");
    expect(resolveUndoTarget(graph, { steps: 2 })).toBe("ver_01HZX8B7J2V3M4N5P6Q7R8S9T2A");

    const reverted = revertToVersion(
      graph,
      "ver_01HZX8B7J2V3M4N5P6Q7R8S9T2A",
      "2026-04-14T22:02:04Z",
      "follow_up_undo",
    );

    expect(resolveUndoTarget(reverted)).toBe("ver_01HZX8D7J2V3M4N5P6Q7R8S9T2A");
  });

  it("records one branch revert history entry and keeps undo coherent", () => {
    let graph = createSessionGraph({
      session_id: "session_01HZX8J7J2V3M4N5P6Q7R8S9T2B",
      created_at: "2026-04-14T22:05:00Z",
      active_refs: {
        asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T2B",
        version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T2B",
      },
    });

    graph = recordAudioAsset(graph, {
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T2B",
      source: { imported_at: "2026-04-14T22:05:00Z" },
    });
    graph = recordAudioVersion(graph, {
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T2B",
      version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T2B",
      lineage: {
        created_at: "2026-04-14T22:05:01Z",
        created_by: "modules/io",
      },
    });
    graph = createBranch(graph, {
      branch_id: "branch_darken",
      source_version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T2B",
      created_at: "2026-04-14T22:05:02Z",
    });
    graph = recordAudioVersion(
      graph,
      {
        asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T2B",
        version_id: "ver_01HZX8C7J2V3M4N5P6Q7R8S9T2B",
        parent_version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T2B",
        lineage: {
          created_at: "2026-04-14T22:05:03Z",
          created_by: "modules/transforms",
        },
      },
      { branch_id: "branch_darken" },
    );

    const reverted = revertToVersion(
      graph,
      "ver_01HZX8B7J2V3M4N5P6Q7R8S9T2B",
      "2026-04-14T22:05:04Z",
    );

    expect(reverted.metadata?.active_ref_history).toHaveLength(4);
    expect(reverted.metadata?.active_ref_history?.at(-1)).toMatchObject({
      version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T2B",
      branch_id: "branch_darken",
      reason: "revert_to_version",
    });

    const undone = undoActiveRef(reverted);
    expect(undone.active_refs.version_id).toBe("ver_01HZX8C7J2V3M4N5P6Q7R8S9T2B");
    expect(undone.active_refs.branch_id).toBe("branch_darken");
    expect(getBranch(undone, "branch_darken")?.head_version_id).toBe(
      "ver_01HZX8B7J2V3M4N5P6Q7R8S9T2B",
    );
  });

  it("surfaces invalid active refs and broken provenance", () => {
    const result = validateSessionGraph({
      schema_version: "1.0.0",
      session_id: "session_01HZX8J7J2V3M4N5P6Q7R8S9T3",
      created_at: "2026-04-14T22:30:00Z",
      updated_at: "2026-04-14T22:30:00Z",
      nodes: [
        {
          node_id: "node_asset_only",
          node_type: "audio_asset",
          ref_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T3",
          created_at: "2026-04-14T22:30:00Z",
        },
      ],
      edges: [],
      active_refs: {
        asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T3",
        version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T3",
      },
      metadata: {
        provenance: {
          ver_01HZX8B7J2V3M4N5P6Q7R8S9T3: {
            asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T3",
            parent_version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T3",
          },
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.instancePath === "/active_refs/version_id")).toBe(
      true,
    );
    expect(
      result.issues.some((issue) =>
        issue.message.includes("parent_version_id cannot equal version_id"),
      ),
    ).toBe(true);
  });

  it("surfaces invalid structured metadata and direct transform mismatches", () => {
    const result = validateSessionGraph({
      schema_version: "1.0.0",
      session_id: "session_01HZX8J7J2V3M4N5P6Q7R8S9TB",
      created_at: "2026-04-14T22:45:00Z",
      updated_at: "2026-04-14T22:45:00Z",
      nodes: [
        {
          node_id: "node_asset_01HZX8A7J2V3M4N5P6Q7R8S9TB",
          node_type: "audio_asset",
          ref_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9TB",
          created_at: "2026-04-14T22:45:00Z",
        },
        {
          node_id: "node_ver_01HZX8B7J2V3M4N5P6Q7R8S9TB",
          node_type: "audio_version",
          ref_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9TB",
          created_at: "2026-04-14T22:45:00Z",
        },
        {
          node_id: "node_transform_01HZX8F7J2V3M4N5P6Q7R8S9TB",
          node_type: "transform_record",
          ref_id: "transform_01HZX8F7J2V3M4N5P6Q7R8S9TB",
          created_at: "2026-04-14T22:45:00Z",
        },
      ],
      edges: [
        {
          from_node_id: "node_asset_01HZX8A7J2V3M4N5P6Q7R8S9TB",
          to_node_id: "node_ver_01HZX8B7J2V3M4N5P6Q7R8S9TB",
          relation: "has_version",
        },
      ],
      active_refs: {
        asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9TB",
        version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9TB",
      },
      metadata: {
        active_ref_history: [
          {
            asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9TB",
            version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9TB",
            branch_id: "branch_missing",
            changed_at: "2026-04-14T22:45:00Z",
          },
        ],
        active_ref_history_index: 2,
        provenance: {
          ver_01HZX8B7J2V3M4N5P6Q7R8S9TB: {
            asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9TB",
            version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9TB",
            transform_record_id: "transform_01HZX8F7J2V3M4N5P6Q7R8S9TB",
          },
          transform_01HZX8F7J2V3M4N5P6Q7R8S9TB: {
            asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9TB",
            output_version_id: "ver_01HZX8C7J2V3M4N5P6Q7R8S9TB",
          },
          render_01HZX8H7J2V3M4N5P6Q7R8S9TB: {
            asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9TB",
          },
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(
      result.issues.some((issue) => issue.instancePath === "/metadata/active_ref_history_index"),
    ).toBe(true);
    expect(
      result.issues.some(
        (issue) => issue.instancePath === "/metadata/active_ref_history/0/branch_id",
      ),
    ).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes("does not produce version"))).toBe(
      true,
    );
    expect(
      result.issues.some((issue) => issue.message.includes("does not reference a known node")),
    ).toBe(true);
  });

  it("validates active ref coherence, required provenance, longer cycles, and reverse transform links", () => {
    const result = validateSessionGraph({
      schema_version: "1.0.0",
      session_id: "session_01HZX8J7J2V3M4N5P6Q7R8S9TC",
      created_at: "2026-04-14T23:10:00Z",
      updated_at: "2026-04-14T23:10:00Z",
      nodes: [
        {
          node_id: "node_asset_a",
          node_type: "audio_asset",
          ref_id: "asset_a",
          created_at: "2026-04-14T23:10:00Z",
        },
        {
          node_id: "node_asset_b",
          node_type: "audio_asset",
          ref_id: "asset_b",
          created_at: "2026-04-14T23:10:00Z",
        },
        {
          node_id: "node_ver_1",
          node_type: "audio_version",
          ref_id: "ver_1",
          created_at: "2026-04-14T23:10:00Z",
        },
        {
          node_id: "node_ver_2",
          node_type: "audio_version",
          ref_id: "ver_2",
          created_at: "2026-04-14T23:10:00Z",
        },
        {
          node_id: "node_ver_3",
          node_type: "audio_version",
          ref_id: "ver_3",
          created_at: "2026-04-14T23:10:00Z",
        },
        {
          node_id: "node_ver_4",
          node_type: "audio_version",
          ref_id: "ver_4",
          created_at: "2026-04-14T23:10:00Z",
        },
        {
          node_id: "node_transform_1",
          node_type: "transform_record",
          ref_id: "transform_1",
          created_at: "2026-04-14T23:10:00Z",
        },
      ],
      edges: [
        {
          from_node_id: "node_asset_a",
          to_node_id: "node_ver_1",
          relation: "has_version",
        },
        {
          from_node_id: "node_asset_a",
          to_node_id: "node_ver_2",
          relation: "has_version",
        },
        {
          from_node_id: "node_asset_a",
          to_node_id: "node_ver_3",
          relation: "has_version",
        },
        {
          from_node_id: "node_asset_a",
          to_node_id: "node_ver_4",
          relation: "has_version",
        },
        {
          from_node_id: "node_transform_1",
          to_node_id: "node_ver_4",
          relation: "produced",
        },
      ],
      active_refs: {
        asset_id: "asset_b",
        version_id: "ver_4",
      },
      metadata: {
        active_ref_history: [
          {
            asset_id: "asset_b",
            version_id: "ver_4",
            changed_at: "2026-04-14T23:10:00Z",
          },
        ],
        active_ref_history_index: 0,
        provenance: {
          asset_a: {
            asset_id: "asset_a",
          },
          asset_b: {
            asset_id: "asset_b",
          },
          ver_1: {
            asset_id: "asset_a",
            version_id: "ver_1",
            parent_version_id: "ver_3",
          },
          ver_2: {
            asset_id: "asset_a",
            version_id: "ver_2",
            parent_version_id: "ver_1",
          },
          ver_3: {
            asset_id: "asset_a",
            version_id: "ver_3",
            parent_version_id: "ver_2",
          },
          ver_4: {
            asset_id: "asset_a",
            version_id: "ver_4",
          },
          transform_1: {
            asset_id: "asset_a",
            input_version_id: "ver_1",
            output_version_id: "ver_4",
          },
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(
      result.issues.some(
        (issue) =>
          issue.instancePath === "/active_refs/asset_id" &&
          issue.message.includes("does not own version 'ver_4'"),
      ),
    ).toBe(true);
    expect(
      result.issues.some(
        (issue) =>
          issue.instancePath === "/metadata/active_ref_history/0/asset_id" &&
          issue.message.includes("does not own version 'ver_4'"),
      ),
    ).toBe(true);
    expect(
      result.issues.some(
        (issue) =>
          issue.instancePath === "/metadata/provenance/ver_4" &&
          issue.message.includes("audio version provenance is required"),
      ),
    ).toBe(false);
    expect(
      result.issues.some(
        (issue) =>
          issue.instancePath === "/metadata/provenance/ver_1/parent_version_id" &&
          issue.message.includes("contains a cycle"),
      ),
    ).toBe(true);
    expect(
      result.issues.some(
        (issue) =>
          issue.instancePath === "/metadata/provenance/transform_1/output_version_id" &&
          issue.message.includes("does not link back to transform record 'transform_1'"),
      ),
    ).toBe(true);
  });

  it("requires provenance for recorded audio versions used by history flows", () => {
    const result = validateSessionGraph({
      schema_version: "1.0.0",
      session_id: "session_01HZX8J7J2V3M4N5P6Q7R8S9TD",
      created_at: "2026-04-14T23:20:00Z",
      updated_at: "2026-04-14T23:20:00Z",
      nodes: [
        {
          node_id: "node_asset_1",
          node_type: "audio_asset",
          ref_id: "asset_1",
          created_at: "2026-04-14T23:20:00Z",
        },
        {
          node_id: "node_ver_1",
          node_type: "audio_version",
          ref_id: "ver_1",
          created_at: "2026-04-14T23:20:00Z",
        },
      ],
      edges: [
        {
          from_node_id: "node_asset_1",
          to_node_id: "node_ver_1",
          relation: "has_version",
        },
      ],
      active_refs: {
        asset_id: "asset_1",
        version_id: "ver_1",
      },
      metadata: {
        provenance: {
          asset_1: {
            asset_id: "asset_1",
          },
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(
      result.issues.some(
        (issue) =>
          issue.instancePath === "/metadata/provenance/ver_1" &&
          issue.message.includes("audio version provenance is required"),
      ),
    ).toBe(true);
    expect(
      result.issues.some(
        (issue) =>
          issue.instancePath === "/active_refs/version_id" &&
          issue.message.includes("missing required provenance"),
      ),
    ).toBe(true);
  });

  it("returns redo candidates from shared ancestry", () => {
    let graph = createSessionGraph({
      session_id: "session_01HZX8J7J2V3M4N5P6Q7R8S9T4",
      created_at: "2026-04-14T23:00:00Z",
      active_refs: {
        asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T4",
        version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T4",
      },
    });

    graph = recordAudioAsset(graph, {
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T4",
      source: { imported_at: "2026-04-14T23:00:00Z" },
    });
    graph = recordAudioVersion(graph, {
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T4",
      version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T4",
      lineage: {
        created_at: "2026-04-14T23:00:01Z",
        created_by: "modules/io",
      },
    });
    graph = recordAudioVersion(graph, {
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T4",
      version_id: "ver_01HZX8C7J2V3M4N5P6Q7R8S9T4",
      parent_version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T4",
      lineage: {
        created_at: "2026-04-14T23:00:02Z",
        created_by: "modules/transforms",
      },
    });
    graph = recordAudioVersion(graph, {
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T4",
      version_id: "ver_01HZX8D7J2V3M4N5P6Q7R8S9T4",
      parent_version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T4",
      lineage: {
        created_at: "2026-04-14T23:00:03Z",
        created_by: "modules/transforms",
      },
    });

    const redoTargets = resolveRedoTargets(graph, "ver_01HZX8B7J2V3M4N5P6Q7R8S9T4");
    expect(redoTargets.map((target) => target.version_id).sort()).toEqual([
      "ver_01HZX8C7J2V3M4N5P6Q7R8S9T4",
      "ver_01HZX8D7J2V3M4N5P6Q7R8S9T4",
    ]);
    expect(redoTargets.every((target) => target.branch_id === undefined)).toBe(true);
  });
});
