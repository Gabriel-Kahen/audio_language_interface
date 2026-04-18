import {
  defaultRuntimeCapabilityManifest,
  plannerSupportedRuntimeOperations,
} from "@audio-language-interface/capabilities";

import type { PlannerFailureClass } from "./types.js";

const DEFAULT_SUPPORTED_DIRECTIONS = [
  "darker",
  "less harsh",
  "less muddy",
  "more controlled dynamics",
  "peak limiting",
  "rumble removal",
  "explicit noise reduction when steady noise is present",
] as const;

export interface PlanningFailureDetails {
  failure_class: PlannerFailureClass;
  matched_requests?: string[];
  runtime_only_operations?: string[];
  suggested_directions?: string[];
  capability_manifest_id?: string;
  planner_supported_operations?: string[];
}

export class PlanningFailure extends Error {
  readonly failureClass: PlannerFailureClass;
  readonly details: PlanningFailureDetails;

  constructor(message: string, details: PlanningFailureDetails) {
    super(message);
    this.name = "PlanningFailure";
    this.failureClass = details.failure_class;
    this.details = details;
  }
}

export function createPlanningFailure(
  failureClass: PlannerFailureClass,
  message: string,
  details: Omit<PlanningFailureDetails, "failure_class"> = {},
): PlanningFailure {
  return new PlanningFailure(message, {
    failure_class: failureClass,
    capability_manifest_id:
      details.capability_manifest_id ?? defaultRuntimeCapabilityManifest.manifest_id,
    planner_supported_operations:
      details.planner_supported_operations ?? plannerSupportedRuntimeOperations,
    suggested_directions: details.suggested_directions ?? [...DEFAULT_SUPPORTED_DIRECTIONS],
    ...(details.matched_requests === undefined
      ? {}
      : { matched_requests: [...details.matched_requests] }),
    ...(details.runtime_only_operations === undefined
      ? {}
      : { runtime_only_operations: [...details.runtime_only_operations] }),
  });
}
