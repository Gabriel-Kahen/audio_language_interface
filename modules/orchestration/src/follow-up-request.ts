import {
  getVersionFollowUpRequest,
  resolveRevertTarget,
  resolveUndoTarget,
  type SessionGraph,
} from "@audio-language-interface/history";

export type FollowUpResolution =
  | {
      kind: "apply";
      resolvedUserRequest: string;
      source: "direct_request" | "repeat_last_request";
    }
  | {
      kind: "revert";
      targetVersionId: string;
      source: "less" | "undo" | "revert";
    };

type RevertFollowUpSource = Extract<FollowUpResolution, { kind: "revert" }>["source"];

export function resolveFollowUpRequest(input: {
  userRequest: string;
  versionId: string;
  sessionGraph?: SessionGraph;
}): FollowUpResolution {
  const normalizedRequest = normalizeRequest(input.userRequest);

  if (isMoreFollowUp(normalizedRequest)) {
    const previousRequest = input.sessionGraph
      ? getVersionFollowUpRequest(input.sessionGraph, input.versionId)
      : undefined;

    if (!previousRequest) {
      throw new Error(
        "The follow-up request `more` requires a session graph with the prior version's recorded edit plan request.",
      );
    }

    return {
      kind: "apply",
      resolvedUserRequest: previousRequest,
      source: "repeat_last_request",
    };
  }

  const revertSource = getRevertSource(normalizedRequest);
  if (revertSource) {
    if (!input.sessionGraph) {
      throw new Error(
        "Revert-style follow-up requests require a session graph so the previous version can be resolved safely.",
      );
    }

    const targetVersionId =
      revertSource === "undo"
        ? resolveUndoTarget(input.sessionGraph)
        : resolveRevertTarget(input.sessionGraph, {
            version_id: input.versionId,
          });
    if (!targetVersionId) {
      throw new Error(
        revertSource === "undo"
          ? "There is no previously active version to undo to from the current session state."
          : "There is no previously recorded version to revert to from the current session state.",
      );
    }

    return {
      kind: "revert",
      targetVersionId,
      source: revertSource,
    };
  }

  return {
    kind: "apply",
    resolvedUserRequest: input.userRequest,
    source: "direct_request",
  };
}

function normalizeRequest(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMoreFollowUp(value: string): boolean {
  return ["more", "more please", "a bit more", "a little more", "same again", "again"].includes(
    value,
  );
}

function getRevertSource(value: string): RevertFollowUpSource | undefined {
  if (["less", "a bit less", "a little less"].includes(value)) {
    return "less";
  }

  if (["undo", "undo that", "undo last edit"].includes(value)) {
    return "undo";
  }

  if (["revert", "revert to previous version", "go back", "previous version"].includes(value)) {
    return "revert";
  }

  return undefined;
}
