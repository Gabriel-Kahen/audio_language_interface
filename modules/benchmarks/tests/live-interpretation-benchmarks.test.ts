import type {
  IntentInterpretation,
  InterpretRequestOptions,
} from "@audio-language-interface/interpretation";
import { describe, expect, it, vi } from "vitest";

import {
  formatBenchmarkMarkdownReport,
  LIVE_INTERPRETATION_CORPUS_ID,
  type LiveInterpretationBenchmarkCase,
  liveInterpretationBenchmarkSuite,
  runLiveInterpretationBenchmarks,
} from "../src/index.js";

function getLiveCase(caseId: string): LiveInterpretationBenchmarkCase {
  const benchmarkCase = liveInterpretationBenchmarkSuite.find((item) => item.caseId === caseId);
  if (benchmarkCase === undefined) {
    throw new Error(`Expected live interpretation benchmark case ${caseId} to exist.`);
  }

  return benchmarkCase;
}

describe("liveInterpretationBenchmarkCorpus", () => {
  it("defines a stable live provider evaluation corpus", () => {
    expect(LIVE_INTERPRETATION_CORPUS_ID).toBe("intent_interpretation_live_v1");
    expect(liveInterpretationBenchmarkSuite).toHaveLength(9);
    expect(liveInterpretationBenchmarkSuite.map((benchmarkCase) => benchmarkCase.caseId)).toEqual(
      expect.arrayContaining([
        "live_interpret_darker_keep_punch",
        "live_interpret_clean_it_conservative",
        "live_interpret_clean_it_best_effort",
        "live_interpret_brighter_and_darker_conservative",
        "live_interpret_brighter_and_darker_best_effort",
        "live_interpret_remove_hum_first_second",
        "live_interpret_follow_up_not_that_much",
        "live_interpret_try_another_version",
        "live_interpret_bitcrush_runtime_only",
      ]),
    );
  });
});

describe("runLiveInterpretationBenchmarks", () => {
  it("runs provider-backed live interpretation evaluation with explicit per-provider aggregation", async () => {
    const cleanItConservative = getLiveCase("live_interpret_clean_it_conservative");
    const cleanItBestEffort = getLiveCase("live_interpret_clean_it_best_effort");
    const interpretRequest = vi.fn(async (options: InterpretRequestOptions) =>
      options.policy === "best_effort"
        ? createInterpretation(options, {
            normalizedRequest: "Reduce steady background noise conservatively.",
            requestClassification: "supported",
            nextAction: "plan",
            normalizedObjectives: ["cleaner", "denoise"],
            candidateDescriptors: ["cleaner"],
            ambiguities: ["cleanup target is not specific enough"],
            clarificationQuestion:
              "Do you want less hum, fewer clicks, less harshness, or lower steady noise?",
            candidateInterpretations: [
              {
                normalized_request: "Reduce steady background noise conservatively.",
                request_classification: "supported",
                next_action: "plan",
                normalized_objectives: ["cleaner", "denoise"],
                candidate_descriptors: ["cleaner"],
                rationale: "This is the strongest grounded fallback cleanup reading.",
                confidence: 0.61,
              },
            ],
            groundingNotes: [
              "best_effort policy promoted alternate interpretation: Reduce steady background noise conservatively.",
            ],
          })
        : createInterpretation(options, {
            normalizedRequest: "Clarify the cleanup target before planning.",
            requestClassification: "supported_but_underspecified",
            nextAction: "clarify",
            normalizedObjectives: [],
            candidateDescriptors: ["cleaner"],
            ambiguities: ["cleanup target is not specific enough"],
            clarificationQuestion:
              "Do you want less hum, fewer clicks, less harshness, or lower steady noise?",
            candidateInterpretations: [
              {
                normalized_request: "Reduce steady background noise conservatively.",
                request_classification: "supported_but_underspecified",
                next_action: "clarify",
                normalized_objectives: ["cleaner"],
                candidate_descriptors: ["cleaner"],
                rationale:
                  "One plausible reading is broadband cleanup, but the request is still underspecified.",
                confidence: 0.48,
              },
            ],
          }),
    );

    const result = await runLiveInterpretationBenchmarks(
      {
        corpusId: "live_interpretation_subset",
        suiteId: "live_intent_interpretation",
        description: "Live interpretation benchmark smoke suite.",
        cases: [cleanItConservative, cleanItBestEffort],
      },
      {
        providerTargets: [
          { kind: "openai", model: "gpt-5-mini", apiKey: "test-openai", label: "oa" },
          { kind: "google", model: "gemini-2.5-flash", apiKey: "test-google", label: "gg" },
        ],
        interpretRequest,
      },
    );

    expect(result.benchmarkMode).toBe("live_interpretation");
    expect(result.corpusId).toBe("live_interpretation_subset");
    expect(result.caseResults).toHaveLength(2);
    expect(result.totalProviderRuns).toBe(4);
    expect(result.succeededProviderRuns).toBe(4);
    expect(result.failedProviderRuns).toBe(0);
    expect(result.totalPassedChecks).toBe(result.totalChecks);
    expect(result.overallScore).toBe(1);
    expect(result.providerSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "openai", model: "gpt-5-mini", totalRuns: 2 }),
        expect.objectContaining({ provider: "google", model: "gemini-2.5-flash", totalRuns: 2 }),
      ]),
    );
    expect(interpretRequest).toHaveBeenCalledTimes(4);
  });

  it("records provider failures without turning live mode into the default offline path", async () => {
    const runtimeOnly = getLiveCase("live_interpret_bitcrush_runtime_only");
    const interpretRequest = vi
      .fn<(options: InterpretRequestOptions) => Promise<IntentInterpretation>>()
      .mockRejectedValueOnce(
        new Error("OpenAI interpretation response did not contain structured content."),
      )
      .mockResolvedValueOnce(
        createInterpretation(
          {
            userRequest: runtimeOnly.prompt,
            audioVersion: runtimeOnly.input.audioVersion,
            analysisReport: runtimeOnly.input.analysisReport,
            semanticProfile: runtimeOnly.input.semanticProfile,
            provider: { kind: "google", model: "gemini-2.5-flash", apiKey: "test-google" },
            policy: runtimeOnly.input.policy,
          },
          {
            normalizedRequest: "Apply a subtle bitcrush effect.",
            requestClassification: "supported_runtime_only_but_not_planner_enabled",
            nextAction: "refuse",
            normalizedObjectives: ["bitcrush"],
            candidateDescriptors: ["crunchy"],
          },
        ),
      );

    const result = await runLiveInterpretationBenchmarks([runtimeOnly], {
      providerTargets: [
        { kind: "openai", model: "gpt-5-mini", apiKey: "test-openai" },
        { kind: "google", model: "gemini-2.5-flash", apiKey: "test-google" },
      ],
      interpretRequest,
    });

    expect(result.totalProviderRuns).toBe(2);
    expect(result.failedProviderRuns).toBe(1);
    expect(result.succeededProviderRuns).toBe(1);

    const openaiResult = result.caseResults[0]?.providerResults.find(
      (providerResult) => providerResult.provider === "openai",
    );
    expect(openaiResult).toMatchObject({
      status: "error",
      error: { failureClass: "schema_invalid" },
    });

    const googleResult = result.caseResults[0]?.providerResults.find(
      (providerResult) => providerResult.provider === "google",
    );
    expect(googleResult).toMatchObject({
      status: "ok",
      interpretation: {
        request_classification: "supported_runtime_only_but_not_planner_enabled",
        next_action: "refuse",
      },
    });
  });
});

describe("formatBenchmarkMarkdownReport live interpretation mode", () => {
  it("renders a stable live interpretation benchmark report", async () => {
    const darkerKeepPunch = getLiveCase("live_interpret_darker_keep_punch");
    const interpretRequest = vi.fn(async (options: InterpretRequestOptions) =>
      createInterpretation(options, {
        normalizedRequest: "Make it darker while preserving punch.",
        requestClassification: "supported",
        nextAction: "plan",
        normalizedObjectives: ["darker"],
        candidateDescriptors: ["dark"],
        descriptorHypotheses: [
          {
            label: "harsh",
            status: "weak",
            needs_more_evidence: ["analysis.measurements.spectral_balance.harshness_ratio_db"],
          },
        ],
        constraints: [{ kind: "preserve", label: "punch" }],
        groundingNotes: ["preserve transient impact while darkening"],
      }),
    );

    const result = await runLiveInterpretationBenchmarks([darkerKeepPunch], {
      providerTargets: [{ kind: "openai", model: "gpt-5-mini", apiKey: "test-openai" }],
      interpretRequest,
    });
    const markdown = formatBenchmarkMarkdownReport(result);

    expect(markdown).toContain("# Benchmark Report: live_intent_interpretation");
    expect(markdown).toContain("Benchmark mode: live-interpretation");
    expect(markdown).toContain(`Corpus: ${LIVE_INTERPRETATION_CORPUS_ID}`);
    expect(markdown).toContain("live_interpret_darker_keep_punch");
    expect(markdown).toContain("openai/gpt-5-mini: ok 1.000");
    expect(markdown).toContain("normalized request: Make it darker while preserving punch.");
  });
});

function createInterpretation(
  options: InterpretRequestOptions,
  input: {
    normalizedRequest: string;
    requestClassification: IntentInterpretation["request_classification"];
    nextAction: IntentInterpretation["next_action"];
    normalizedObjectives: string[];
    candidateDescriptors: string[];
    descriptorHypotheses?: IntentInterpretation["descriptor_hypotheses"];
    constraints?: IntentInterpretation["constraints"];
    candidateInterpretations?: IntentInterpretation["candidate_interpretations"];
    ambiguities?: string[];
    clarificationQuestion?: string;
    followUpIntent?: IntentInterpretation["follow_up_intent"];
    groundingNotes?: string[];
  },
): IntentInterpretation {
  return {
    schema_version: "1.0.0",
    interpretation_id: `interpret_test_${options.provider.kind}_${options.policy ?? "conservative"}`,
    interpretation_policy: options.policy ?? "conservative",
    asset_id: options.audioVersion.asset_id,
    version_id: options.audioVersion.version_id,
    analysis_report_id: options.analysisReport.report_id,
    semantic_profile_id: options.semanticProfile.profile_id,
    user_request: options.userRequest,
    normalized_request: input.normalizedRequest,
    request_classification: input.requestClassification,
    next_action: input.nextAction,
    normalized_objectives: input.normalizedObjectives,
    candidate_descriptors: input.candidateDescriptors,
    ...(input.descriptorHypotheses === undefined
      ? {}
      : { descriptor_hypotheses: input.descriptorHypotheses }),
    ...(input.constraints === undefined ? {} : { constraints: input.constraints }),
    ...(input.candidateInterpretations === undefined
      ? {}
      : { candidate_interpretations: input.candidateInterpretations }),
    ...(input.ambiguities === undefined ? {} : { ambiguities: input.ambiguities }),
    ...(input.clarificationQuestion === undefined
      ? {}
      : { clarification_question: input.clarificationQuestion }),
    ...(input.followUpIntent === undefined ? {} : { follow_up_intent: input.followUpIntent }),
    ...(input.groundingNotes === undefined ? {} : { grounding_notes: input.groundingNotes }),
    rationale: "Test interpretation artifact for live benchmark coverage.",
    confidence: 0.78,
    provider: {
      kind: options.provider.kind,
      model: options.provider.model,
      prompt_version: options.promptVersion ?? "intent_v2",
      cached: false,
      response_ms: 42,
    },
    generated_at: options.generatedAt ?? "2026-04-22T22:00:00Z",
  };
}
