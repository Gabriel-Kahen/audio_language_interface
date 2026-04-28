import { describe, expect, it } from "vitest";
import {
  FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH,
  firstPromptFamilyRequestCycleSuite,
  interpretationBenchmarkSuite,
  type RequestCycleBenchmarkCase,
  runInterpretationBenchmarks,
  runRequestCycleBenchmarks,
} from "../src/index.js";

function getRequestCycleCase(caseId: string): RequestCycleBenchmarkCase {
  const benchmarkCase = firstPromptFamilyRequestCycleSuite.find((item) => item.caseId === caseId);

  if (benchmarkCase === undefined) {
    throw new Error(`Expected request-cycle benchmark case ${caseId} to exist.`);
  }

  return benchmarkCase;
}

function getInterpretationCase(caseId: string) {
  const benchmarkCase = interpretationBenchmarkSuite.find((item) => item.caseId === caseId);

  if (benchmarkCase === undefined) {
    throw new Error(`Expected interpretation benchmark case ${caseId} to exist.`);
  }

  return benchmarkCase;
}

function plannedOperations(benchmarkCase: RequestCycleBenchmarkCase) {
  return benchmarkCase.expectation.planner?.required_operations ?? [];
}

describe("request-cycle golden benchmark coverage", () => {
  it("locks representative supported prompt families and refusal controls in the corpus", () => {
    const cases = [
      getRequestCycleCase("request_cycle_reduce_brightness_without_losing_punch"),
      getRequestCycleCase("request_cycle_less_muddy"),
      getRequestCycleCase("request_cycle_tame_sibilance"),
      getRequestCycleCase("request_cycle_speed_up_preserve_pitch"),
      getRequestCycleCase("request_cycle_pitch_up_two_semitones"),
      getRequestCycleCase("request_cycle_center_this_more_and_make_it_wider"),
      getRequestCycleCase("request_cycle_louder_and_more_controlled"),
      getRequestCycleCase("request_cycle_louder_controlled_already_tight_stress"),
      getRequestCycleCase("request_cycle_first_half_second_turn_down_stress"),
      getRequestCycleCase("request_cycle_intro_darker_region_refusal"),
      getRequestCycleCase("request_cycle_clean_this_sample_up_a_bit_underspecified"),
      getRequestCycleCase("request_cycle_brighter_and_darker_contradiction"),
    ];

    expect(
      cases.map((benchmarkCase) => ({
        caseId: benchmarkCase.caseId,
        prompt: benchmarkCase.prompt,
        operations: plannedOperations(benchmarkCase),
        resultKind: benchmarkCase.expectation.planner?.expected_result_kind ?? "error",
        errorStage: benchmarkCase.expectation.error?.stage,
        failureClass: benchmarkCase.expectation.error?.failure_class,
      })),
    ).toEqual([
      {
        caseId: "request_cycle_reduce_brightness_without_losing_punch",
        prompt: "reduce brightness without losing punch",
        operations: ["tilt_eq"],
        resultKind: "applied",
        errorStage: undefined,
        failureClass: undefined,
      },
      {
        caseId: "request_cycle_less_muddy",
        prompt: "make this less muddy",
        operations: ["parametric_eq"],
        resultKind: "applied",
        errorStage: undefined,
        failureClass: undefined,
      },
      {
        caseId: "request_cycle_tame_sibilance",
        prompt: "Tame the sibilance.",
        operations: ["de_esser"],
        resultKind: "applied",
        errorStage: undefined,
        failureClass: undefined,
      },
      {
        caseId: "request_cycle_speed_up_preserve_pitch",
        prompt: "Speed up by 10%.",
        operations: ["time_stretch"],
        resultKind: "applied",
        errorStage: undefined,
        failureClass: undefined,
      },
      {
        caseId: "request_cycle_pitch_up_two_semitones",
        prompt: "Pitch up by 2 semitones.",
        operations: ["pitch_shift"],
        resultKind: "applied",
        errorStage: undefined,
        failureClass: undefined,
      },
      {
        caseId: "request_cycle_center_this_more_and_make_it_wider",
        prompt: "Center this more and make it wider.",
        operations: ["stereo_balance_correction", "stereo_width"],
        resultKind: "applied",
        errorStage: undefined,
        failureClass: undefined,
      },
      {
        caseId: "request_cycle_louder_and_more_controlled",
        prompt: "Make it louder and more controlled.",
        operations: ["compressor", "normalize"],
        resultKind: "applied",
        errorStage: undefined,
        failureClass: undefined,
      },
      {
        caseId: "request_cycle_louder_controlled_already_tight_stress",
        prompt: "Make it louder and more controlled.",
        operations: ["limiter"],
        resultKind: "applied",
        errorStage: undefined,
        failureClass: undefined,
      },
      {
        caseId: "request_cycle_first_half_second_turn_down_stress",
        prompt: "Turn down the first 0.5 seconds a little.",
        operations: ["gain"],
        resultKind: "applied",
        errorStage: undefined,
        failureClass: undefined,
      },
      {
        caseId: "request_cycle_intro_darker_region_refusal",
        prompt: "Make the intro darker.",
        operations: [],
        resultKind: "error",
        errorStage: "plan",
        failureClass: "supported_but_underspecified",
      },
      {
        caseId: "request_cycle_clean_this_sample_up_a_bit_underspecified",
        prompt: "clean this sample up a bit",
        operations: [],
        resultKind: "error",
        errorStage: "plan",
        failureClass: "supported_but_underspecified",
      },
      {
        caseId: "request_cycle_brighter_and_darker_contradiction",
        prompt: "Make it brighter and darker.",
        operations: [],
        resultKind: "error",
        errorStage: "plan",
        failureClass: "supported_but_underspecified",
      },
    ]);
  });

  it("runs a compact golden workflow matrix and scores supported plus refused requests", async () => {
    const cases = [
      getRequestCycleCase("request_cycle_reduce_brightness_without_losing_punch"),
      getRequestCycleCase("request_cycle_less_muddy"),
      getRequestCycleCase("request_cycle_first_half_second_turn_down_stress"),
      getRequestCycleCase("request_cycle_intro_darker_region_refusal"),
      getRequestCycleCase("request_cycle_clean_this_sample_up_a_bit_underspecified"),
    ];

    const result = await runRequestCycleBenchmarks({
      corpusId: "request_cycle_golden_matrix",
      suiteId: "first_prompt_family",
      fixtureManifestPath: FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH,
      description: "Golden request-cycle matrix for supported prompt families and refusals.",
      cases,
    });

    expect(result.caseResults).toHaveLength(cases.length);
    expect(result.totalChecks).toBeGreaterThan(0);
    expect(result.totalPassedChecks).toBe(result.totalChecks);
    expect(result.overallScore).toBe(1);

    expect(
      result.caseResults.map((caseResult) => ({
        caseId: caseResult.caseId,
        status: caseResult.status,
        score: caseResult.score,
        operations:
          caseResult.requestCycleResult?.result_kind === "applied"
            ? caseResult.requestCycleResult.editPlan?.steps.map((step) => ({
                operation: step.operation,
                target: step.target,
              }))
            : [],
        errorStage: caseResult.error?.stage,
        failureClass: caseResult.error?.failureClass,
        failedBuckets: caseResult.failureBuckets,
      })),
    ).toEqual([
      {
        caseId: "request_cycle_reduce_brightness_without_losing_punch",
        status: "ok",
        score: 1,
        operations: [{ operation: "tilt_eq", target: { scope: "full_file" } }],
        errorStage: undefined,
        failureClass: undefined,
        failedBuckets: [],
      },
      {
        caseId: "request_cycle_less_muddy",
        status: "ok",
        score: 1,
        operations: [{ operation: "parametric_eq", target: { scope: "full_file" } }],
        errorStage: undefined,
        failureClass: undefined,
        failedBuckets: [],
      },
      {
        caseId: "request_cycle_first_half_second_turn_down_stress",
        status: "ok",
        score: 1,
        operations: [
          {
            operation: "gain",
            target: { scope: "time_range", start_seconds: 0, end_seconds: 0.5 },
          },
        ],
        errorStage: undefined,
        failureClass: undefined,
        failedBuckets: [],
      },
      {
        caseId: "request_cycle_intro_darker_region_refusal",
        status: "error",
        score: 1,
        operations: [],
        errorStage: "plan",
        failureClass: "supported_but_underspecified",
        failedBuckets: [],
      },
      {
        caseId: "request_cycle_clean_this_sample_up_a_bit_underspecified",
        status: "error",
        score: 1,
        operations: [],
        errorStage: "plan",
        failureClass: "supported_but_underspecified",
        failedBuckets: [],
      },
    ]);
  }, 90_000);
});

describe("interpretation refusal and ambiguity benchmark scoring", () => {
  it("scores conservative clarification, best-effort planning, and runtime-only refusal distinctly", () => {
    const cases = [
      getInterpretationCase("interpret_clean_it_conservative"),
      getInterpretationCase("interpret_clean_it_best_effort"),
      getInterpretationCase("interpret_brighter_and_darker_conservative"),
      getInterpretationCase("interpret_brighter_and_darker_best_effort"),
      getInterpretationCase("interpret_bitcrush_runtime_only"),
    ];

    const result = runInterpretationBenchmarks({
      corpusId: "interpretation_refusal_policy_golden",
      suiteId: "intent_interpretation",
      description: "Golden policy matrix for clarification, best-effort, and refusal behavior.",
      cases,
    });

    expect(result.totalChecks).toBeGreaterThan(0);
    expect(result.totalPassedChecks).toBe(result.totalChecks);
    expect(result.overallScore).toBe(1);
    expect(
      result.caseResults.map((caseResult) => ({
        caseId: caseResult.caseId,
        policy: caseResult.interpretation.interpretation_policy,
        classification: caseResult.interpretation.request_classification,
        nextAction: caseResult.interpretation.next_action,
        score: caseResult.score,
      })),
    ).toEqual([
      {
        caseId: "interpret_clean_it_conservative",
        policy: "conservative",
        classification: "supported_but_underspecified",
        nextAction: "clarify",
        score: 1,
      },
      {
        caseId: "interpret_clean_it_best_effort",
        policy: "best_effort",
        classification: "supported",
        nextAction: "plan",
        score: 1,
      },
      {
        caseId: "interpret_brighter_and_darker_conservative",
        policy: "conservative",
        classification: "supported_but_underspecified",
        nextAction: "clarify",
        score: 1,
      },
      {
        caseId: "interpret_brighter_and_darker_best_effort",
        policy: "best_effort",
        classification: "supported",
        nextAction: "plan",
        score: 1,
      },
      {
        caseId: "interpret_bitcrush_runtime_only",
        policy: "conservative",
        classification: "supported_runtime_only_but_not_planner_enabled",
        nextAction: "refuse",
        score: 1,
      },
    ]);
  });
});
