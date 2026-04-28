import type { AnalysisReport } from "@audio-language-interface/analysis";
import { defaultRuntimeCapabilityManifest } from "@audio-language-interface/capabilities";
import type { AudioVersion } from "@audio-language-interface/core";
import type { SemanticProfile } from "@audio-language-interface/semantics";
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
import { interpretRequest } from "../src/index.js";

const audioVersion = audioVersionExample as AudioVersion;
const analysisReport = analysisExample as AnalysisReport;
const semanticProfile = semanticExample as SemanticProfile;

function interpretWithOpenAiContent(content: string) {
  return interpretRequest({
    userRequest: "Make the intro darker.",
    audioVersion,
    analysisReport,
    semanticProfile,
    capabilityManifest: defaultRuntimeCapabilityManifest,
    provider: {
      kind: "openai",
      apiKey: "test-key",
      model: "gpt-4.1-mini",
    },
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content } }],
        }),
        { status: 200 },
      ),
  });
}

describe("interpretation provider negative behavior", () => {
  it("fails loudly when a provider returns non-JSON text", async () => {
    await expect(interpretWithOpenAiContent("I would make it darker.")).rejects.toThrow(
      /invalid JSON/i,
    );
  });

  it("fails loudly when a provider omits required candidate fields", async () => {
    await expect(
      interpretWithOpenAiContent(
        JSON.stringify({
          normalized_request: "Make it darker.",
          request_classification: "supported",
          next_action: "plan",
          normalized_objectives: ["darker"],
          candidate_descriptors: ["bright"],
          confidence: 0.8,
        }),
      ),
    ).rejects.toThrow(/invalid candidate payload/i);
  });

  it("rejects segment references without a concrete reference string", async () => {
    await expect(
      interpretWithOpenAiContent(
        JSON.stringify({
          normalized_request: "Make the intro darker.",
          request_classification: "supported_but_underspecified",
          next_action: "clarify",
          normalized_objectives: ["darker"],
          candidate_descriptors: ["bright"],
          region_intents: [{ scope: "segment_reference" }],
          rationale: "The provider named a vague region but did not identify it.",
          confidence: 0.62,
        }),
      ),
    ).rejects.toThrow(/invalid candidate payload/i);
  });
});
