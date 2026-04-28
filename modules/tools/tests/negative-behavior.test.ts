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
import {
  executeToolRequest,
  isValidToolResponse,
  validateToolRequestEnvelope,
} from "../src/index.js";
import type { ToolRequest } from "../src/types.js";

function buildRequest(overrides: Partial<ToolRequest>): ToolRequest {
  return {
    schema_version: "1.0.0",
    request_id: "toolreq_negative",
    tool_name: "plan_edits",
    arguments: {},
    requested_at: "2026-04-28T12:00:00Z",
    ...overrides,
  };
}

describe("tools negative behavior", () => {
  it("rejects malformed tool envelopes before routing", () => {
    expect(() =>
      validateToolRequestEnvelope({
        schema_version: "1.0.0",
        tool_name: "plan_edits",
        arguments: {},
        requested_at: "2026-04-28T12:00:00Z",
      }),
    ).toThrow(/ToolRequest schema validation failed/i);
  });

  it("returns a contract-valid unknown_tool response for bad tool names", async () => {
    const response = await executeToolRequest(buildRequest({ tool_name: "make_audio_good" }), {
      workspaceRoot: "/tmp/workspace",
      now: () => new Date("2026-04-28T12:00:01Z"),
    });

    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("unknown_tool");
    expect(response.error?.details?.available_tools).toEqual(
      expect.arrayContaining(["plan_edits", "interpret_request"]),
    );
    expect(isValidToolResponse(response)).toBe(true);
  });

  it("rejects bad plan_edits payloads before invoking the planner", async () => {
    const response = await executeToolRequest(
      buildRequest({
        arguments: {
          audio_version: audioVersionExample,
          analysis_report: analysisExample,
          semantic_profile: semanticExample,
          user_request: "",
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        now: () => new Date("2026-04-28T12:00:02Z"),
      },
    );

    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("invalid_arguments");
    expect(response.error?.details).toEqual({ field: "arguments.user_request" });
    expect(isValidToolResponse(response)).toBe(true);
  });

  it("rejects bad interpret_request provider payloads before provider execution", async () => {
    const response = await executeToolRequest(
      buildRequest({
        tool_name: "interpret_request",
        arguments: {
          audio_version: audioVersionExample,
          analysis_report: analysisExample,
          semantic_profile: semanticExample,
          user_request: "Make it darker.",
          provider: {
            kind: "openai",
            model: "gpt-4.1-mini",
          },
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        now: () => new Date("2026-04-28T12:00:03Z"),
      },
    );

    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("invalid_arguments");
    expect(response.error?.details).toEqual({ field: "arguments.provider.api_key" });
    expect(isValidToolResponse(response)).toBe(true);
  });
});
