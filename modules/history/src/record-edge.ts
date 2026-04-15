import {
  getNodeById,
  type SessionEdge,
  type SessionGraph,
  withUpdatedTimestamp,
} from "./session-graph.js";

/** Adds an edge when both endpoint node ids are already present. */
export function addEdge(graph: SessionGraph, edge: SessionEdge, updatedAt: string): SessionGraph {
  if (!getNodeById(graph, edge.from_node_id)) {
    throw new Error(`Cannot create edge from unknown node '${edge.from_node_id}'`);
  }

  if (!getNodeById(graph, edge.to_node_id)) {
    throw new Error(`Cannot create edge to unknown node '${edge.to_node_id}'`);
  }

  const exists = graph.edges.some(
    (existing) =>
      existing.from_node_id === edge.from_node_id &&
      existing.to_node_id === edge.to_node_id &&
      existing.relation === edge.relation,
  );

  if (exists) {
    return graph;
  }

  return withUpdatedTimestamp(
    {
      ...graph,
      edges: [...graph.edges, edge],
    },
    updatedAt,
  );
}
