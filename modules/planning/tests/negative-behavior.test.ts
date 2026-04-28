import { describe, expect, it } from "vitest";

import analysisExample from "../../../contracts/examples/analysis-report.json" with {
  type: "json",
};
import audioVersionExample from "../../../contracts/examples/audio-version.json" with {
  type: "json",
};
import semanticExample from "../../../contracts/examples/semantic-profile.json" with {
  type: "json",
};
import { PlanningFailure, parseUserRequest, planEdits } from "../src/index.js";
import type { AnalysisReport, AudioVersion, SemanticProfile } from "../src/types.js";

const audioVersion = audioVersionExample as AudioVersion;
const analysisReport = analysisExample as AnalysisReport;
const semanticProfile = semanticExample as SemanticProfile;

function expectPlanningFailure(
  userRequest: string,
  failureClass: PlanningFailure["failureClass"],
): PlanningFailure {
  try {
    planEdits({
      userRequest,
      audioVersion,
      analysisReport,
      semanticProfile,
    });
  } catch (error) {
    expect(error).toBeInstanceOf(PlanningFailure);
    const failure = error as PlanningFailure;
    expect(failure.failureClass).toBe(failureClass);
    expect(failure.details.failure_class).toBe(failureClass);
    return failure;
  }

  throw new Error(`Expected planning failure for request: ${userRequest}`);
}

describe("planning negative behavior", () => {
  it("keeps vague region-only requests underspecified instead of inventing an edit", () => {
    const parsed = parseUserRequest("the first second");

    expect(parsed.region_target_hint).toEqual({
      kind: "leading_window",
      duration_seconds: 1,
      source_phrase: "first second",
    });
    expect(parsed.request_classification).toBe("supported_but_underspecified");

    const failure = expectPlanningFailure("the first second", "supported_but_underspecified");
    expect(failure.message).toMatch(/could not derive an executable plan/i);
  });

  it("refuses unsupported named regions until a deterministic segment resolver exists", () => {
    for (const regionRequest of ["Make the intro darker.", "Make the ending word darker."]) {
      const parsed = parseUserRequest(regionRequest);

      expect(parsed.request_classification).toBe("supported_but_underspecified");
      expect(parsed.supported_but_underspecified_requests.length).toBeGreaterThan(0);

      const failure = expectPlanningFailure(regionRequest, "supported_but_underspecified");
      expect(failure.message).toMatch(/explicit time range/i);
    }
  });

  it("rejects contradictory timing requests before selecting a transform", () => {
    const parsed = parseUserRequest("Speed up and slow down.");

    expect(parsed.wants_speed_up).toBe(true);
    expect(parsed.wants_slow_down).toBe(true);

    const failure = expectPlanningFailure(
      "Speed up and slow down.",
      "supported_but_underspecified",
    );
    expect(failure.message).toMatch(/both faster and slower/i);
  });

  it("treats empty requests as underspecified rather than successful no-op plans", () => {
    const parsed = parseUserRequest("   ");

    expect(parsed.normalized_request).toBe("");
    expect(parsed.request_classification).toBe("supported_but_underspecified");

    const failure = expectPlanningFailure("   ", "supported_but_underspecified");
    expect(failure.message).toMatch(/could not derive an executable plan/i);
  });
});
