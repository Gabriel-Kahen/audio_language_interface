import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  defaultOrchestrationDependencies,
  isAppliedOrRevertedRequestCycleResult,
  type RequestCycleResult,
} from "@audio-language-interface/orchestration";
import { describe, expect, it } from "vitest";

import {
  type ComparisonBenchmarkExpectation,
  FIRST_PROMPT_FAMILY_CORPUS_ID,
  FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH,
  FIRST_PROMPT_FAMILY_REQUEST_CYCLE_CORPUS_ID,
  FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID,
  firstPromptFamilyFixtureCorpus,
  firstPromptFamilyPromptSuite,
  firstPromptFamilyRequestCycleCorpus,
  firstPromptFamilyRequestCycleSuite,
  formatBenchmarkMarkdownReport,
  INTERPRETATION_CORPUS_ID,
  interpretationBenchmarkCorpus,
  interpretationBenchmarkSuite,
  runComparisonBenchmarks,
  runInterpretationBenchmarks,
  runRequestCycleBenchmarkCase,
  runRequestCycleBenchmarks,
  scoreComparisonReport,
  scoreIntentInterpretation,
} from "../src/index.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

interface FixtureManifestEntry {
  fixture_id: string;
  relative_path: string;
  format: {
    container: string;
    codec: string;
    sample_rate_hz: number;
    channels: number;
    bit_depth: number;
    duration_seconds: number;
    file_size_bytes: number;
  };
  provenance: {
    checksum_sha256: string;
  };
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8")) as T;
}

function readFixtureManifest(): { fixtures: FixtureManifestEntry[] } {
  return readJson(FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH);
}

function getRequestCycleCase(caseId: string) {
  const benchmarkCase = firstPromptFamilyRequestCycleSuite.find((item) => item.caseId === caseId);

  if (!benchmarkCase) {
    throw new Error(`Expected request-cycle benchmark case ${caseId} to exist.`);
  }

  return benchmarkCase;
}

function expectAppliedRequestCycleResult(
  result: RequestCycleResult | undefined,
): Extract<RequestCycleResult, { result_kind: "applied" | "reverted" }> {
  expect(result).toBeDefined();
  expect(result && isAppliedOrRevertedRequestCycleResult(result)).toBe(true);
  if (!result || !isAppliedOrRevertedRequestCycleResult(result)) {
    throw new Error("Expected applied or reverted request-cycle result.");
  }
  return result;
}

function getCompareCase(caseId: string) {
  const benchmarkCase = firstPromptFamilyPromptSuite.find((item) => item.caseId === caseId);

  if (!benchmarkCase) {
    throw new Error(`Expected compare benchmark case ${caseId} to exist.`);
  }

  return benchmarkCase;
}

function getInterpretationCase(caseId: string) {
  const benchmarkCase = interpretationBenchmarkSuite.find((item) => item.caseId === caseId);

  if (!benchmarkCase) {
    throw new Error(`Expected interpretation benchmark case ${caseId} to exist.`);
  }

  return benchmarkCase;
}

function readWavMetadata(relativePath: string) {
  const buffer = readFileSync(path.join(repoRoot, relativePath));

  expect(buffer.toString("ascii", 0, 4)).toBe("RIFF");
  expect(buffer.toString("ascii", 8, 12)).toBe("WAVE");

  let offset = 12;
  let channels: number | undefined;
  let sampleRate: number | undefined;
  let bitsPerSample: number | undefined;
  let audioFormat: number | undefined;
  let codec = "unknown";
  let dataOffset: number | undefined;
  let dataSize: number | undefined;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;

    if (chunkId === "fmt ") {
      audioFormat = buffer.readUInt16LE(chunkDataOffset);
      channels = buffer.readUInt16LE(chunkDataOffset + 2);
      sampleRate = buffer.readUInt32LE(chunkDataOffset + 4);
      bitsPerSample = buffer.readUInt16LE(chunkDataOffset + 14);
      codec = audioFormat === 1 && bitsPerSample === 16 ? "pcm_s16le" : `wav_${audioFormat}`;
    }

    if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
    }

    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (
    channels === undefined ||
    sampleRate === undefined ||
    bitsPerSample === undefined ||
    dataOffset === undefined ||
    dataSize === undefined
  ) {
    throw new Error(`Incomplete WAV metadata for fixture ${relativePath}.`);
  }

  const durationSeconds = dataSize / (sampleRate * channels * (bitsPerSample / 8));
  const checksumSha256 = createHash("sha256").update(buffer).digest("hex");
  let clippedSampleCount = 0;
  const clippedFrames = new Set<number>();

  if (audioFormat === 1 && bitsPerSample === 16) {
    const sampleCount = dataSize / 2;
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const sample = buffer.readInt16LE(dataOffset + sampleIndex * 2) / 32768;
      if (Math.abs(sample) >= 0.999) {
        clippedSampleCount += 1;
        clippedFrames.add(Math.floor(sampleIndex / channels));
      }
    }
  }

  return {
    codec,
    channels,
    sampleRate,
    bitsPerSample,
    durationSeconds,
    fileSizeBytes: buffer.length,
    checksumSha256,
    clippedSampleCount,
    clippedFrameCount: clippedFrames.size,
    clippedFrameRatio: Number((clippedFrames.size / (dataSize / (channels * 2))).toFixed(6)),
  };
}

async function benchmarkInterpretRequestMock(input: {
  userRequest: string;
  audioVersion: { asset_id: string; version_id: string };
  analysisReport: { report_id: string };
  semanticProfile: { profile_id: string };
  policy?: "conservative" | "best_effort";
  sessionContext?: {
    pending_clarification?: {
      original_user_request: string;
      clarification_question: string;
      source_version_id: string;
      source_interpretation_id?: string;
    };
  };
}) {
  const normalizedRequest = input.userRequest.trim().toLowerCase();

  if (normalizedRequest === "clean it") {
    return {
      schema_version: "1.0.0" as const,
      interpretation_id: "interpret_benchmarkclarify",
      interpretation_policy: input.policy ?? "conservative",
      asset_id: input.audioVersion.asset_id,
      version_id: input.audioVersion.version_id,
      analysis_report_id: input.analysisReport.report_id,
      semantic_profile_id: input.semanticProfile.profile_id,
      user_request: input.userRequest,
      normalized_request: "clean it",
      request_classification: "supported_but_underspecified" as const,
      next_action: "clarify" as const,
      normalized_objectives: [],
      candidate_descriptors: [],
      ambiguities: ["cleanup target is underspecified"],
      clarification_question: "Do you mean reduce noise, tame harshness, or make the tone darker?",
      rationale: "Broad cleanup wording needs one explicit supported direction.",
      confidence: 0.39,
      provider: {
        kind: "openai" as const,
        model: "gpt-5-mini",
        prompt_version: "intent_v1",
      },
      generated_at: "2026-04-22T15:00:00Z",
    };
  }

  if (
    input.sessionContext?.pending_clarification !== undefined &&
    normalizedRequest === "make it darker and less harsh"
  ) {
    return {
      schema_version: "1.0.0" as const,
      interpretation_id: "interpret_benchmarkanswer",
      interpretation_policy: input.policy ?? "conservative",
      asset_id: input.audioVersion.asset_id,
      version_id: input.audioVersion.version_id,
      analysis_report_id: input.analysisReport.report_id,
      semantic_profile_id: input.semanticProfile.profile_id,
      user_request: input.userRequest,
      normalized_request: "make it darker and less harsh",
      request_classification: "supported" as const,
      next_action: "plan" as const,
      normalized_objectives: ["darker", "less_harsh"],
      candidate_descriptors: ["dark"],
      grounding_notes: ["resolved from pending clarification context"],
      rationale: "The clarification answer resolved the earlier cleanup ambiguity.",
      confidence: 0.83,
      provider: {
        kind: "openai" as const,
        model: "gpt-5-mini",
        prompt_version: "intent_v1",
      },
      generated_at: "2026-04-22T15:00:01Z",
    };
  }

  return {
    schema_version: "1.0.0" as const,
    interpretation_id: "interpret_benchmarkdefault",
    interpretation_policy: input.policy ?? "conservative",
    asset_id: input.audioVersion.asset_id,
    version_id: input.audioVersion.version_id,
    analysis_report_id: input.analysisReport.report_id,
    semantic_profile_id: input.semanticProfile.profile_id,
    user_request: input.userRequest,
    normalized_request: input.userRequest,
    request_classification: "supported" as const,
    next_action: "plan" as const,
    normalized_objectives: [],
    candidate_descriptors: [],
    rationale: "Default benchmark interpretation passthrough.",
    confidence: 0.7,
    provider: {
      kind: "openai" as const,
      model: "gpt-5-mini",
      prompt_version: "intent_v1",
    },
    generated_at: "2026-04-22T15:00:02Z",
  };
}

describe("firstPromptFamilyFixtureCorpus", () => {
  it("keeps the committed fixture manifest and audio files aligned", () => {
    const fixtureManifest = readFixtureManifest();

    expect(firstPromptFamilyFixtureCorpus.corpusId).toBe(FIRST_PROMPT_FAMILY_CORPUS_ID);
    expect(firstPromptFamilyFixtureCorpus.fixtureManifestPath).toBe(
      FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH,
    );

    for (const fixture of fixtureManifest.fixtures) {
      const absolutePath = path.join(repoRoot, "fixtures", "audio", fixture.relative_path);
      expect(existsSync(absolutePath)).toBe(true);

      const metadata = readWavMetadata(path.posix.join("fixtures/audio", fixture.relative_path));

      expect(fixture.format.container).toBe("wav");
      expect(metadata.codec).toBe(fixture.format.codec);
      expect(metadata.sampleRate).toBe(fixture.format.sample_rate_hz);
      expect(metadata.channels).toBe(fixture.format.channels);
      expect(metadata.bitsPerSample).toBe(fixture.format.bit_depth);
      expect(metadata.fileSizeBytes).toBe(fixture.format.file_size_bytes);
      expect(metadata.durationSeconds).toBeCloseTo(fixture.format.duration_seconds, 3);
      expect(metadata.checksumSha256).toBe(fixture.provenance.checksum_sha256);
    }
  });

  it("binds every benchmark case to committed fixture ids", () => {
    const fixtureIds = new Set(readFixtureManifest().fixtures.map((fixture) => fixture.fixture_id));

    expect(firstPromptFamilyPromptSuite).toHaveLength(14);

    for (const benchmarkCase of firstPromptFamilyPromptSuite) {
      expect(fixtureIds.has(benchmarkCase.fixtures.sourceFixtureId)).toBe(true);
      expect(fixtureIds.has(benchmarkCase.fixtures.baselineFixtureId)).toBe(true);
      expect(fixtureIds.has(benchmarkCase.fixtures.candidateFixtureId)).toBe(true);
      expect(benchmarkCase.fixtures.baselineFixtureId).toBe(benchmarkCase.fixtures.sourceFixtureId);
    }
  });

  it("binds every request-cycle benchmark case to committed fixture ids", () => {
    const fixtureIds = new Set(readFixtureManifest().fixtures.map((fixture) => fixture.fixture_id));

    expect(firstPromptFamilyRequestCycleCorpus.corpusId).toBe(
      FIRST_PROMPT_FAMILY_REQUEST_CYCLE_CORPUS_ID,
    );
    expect(firstPromptFamilyRequestCycleCorpus.fixtureManifestPath).toBe(
      FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH,
    );
    expect(firstPromptFamilyRequestCycleSuite).toHaveLength(37);
    expect(firstPromptFamilyRequestCycleSuite.map((benchmarkCase) => benchmarkCase.caseId)).toEqual(
      expect.arrayContaining([
        "request_cycle_more_relaxed",
        "request_cycle_warmer_and_airier",
        "request_cycle_darker_less_harsh_less_muddy",
        "request_cycle_speed_up_and_tame_sibilance",
        "request_cycle_tame_sibilance_and_darker",
        "request_cycle_tame_sibilance",
        "request_cycle_remove_60hz_hum",
        "request_cycle_clean_up_clicks",
        "request_cycle_less_distorted_declip",
        "request_cycle_trim_boundary_silence",
        "request_cycle_speed_up_preserve_pitch",
        "request_cycle_pitch_up_two_semitones",
        "request_cycle_make_this_wider",
        "request_cycle_narrow_it_a_bit",
        "request_cycle_center_this_more",
        "request_cycle_fix_stereo_imbalance",
        "request_cycle_center_this_more_and_make_it_wider",
        "request_cycle_follow_up_more",
        "request_cycle_follow_up_try_another_version",
        "request_cycle_follow_up_less",
        "request_cycle_follow_up_undo",
        "request_cycle_follow_up_revert_previous_version",
        "request_cycle_control_peaks_without_crushing",
        "request_cycle_louder_and_more_controlled",
        "request_cycle_more_controlled_and_darker",
        "request_cycle_clean_it_llm_clarification_loop",
        "request_cycle_clean_it_llm_clarification_answer",
        "request_cycle_brighter_and_darker_contradiction",
        "request_cycle_speed_up_and_slow_down_contradiction",
        "request_cycle_wider_and_narrower_contradiction",
      ]),
    );

    for (const benchmarkCase of firstPromptFamilyRequestCycleSuite) {
      expect(fixtureIds.has(benchmarkCase.fixtureId)).toBe(true);
    }
  });

  it("defines a stable interpretation benchmark corpus for the richer LLM artifact", () => {
    expect(interpretationBenchmarkCorpus.corpusId).toBe(INTERPRETATION_CORPUS_ID);
    expect(interpretationBenchmarkSuite).toHaveLength(11);
    expect(interpretationBenchmarkSuite.map((benchmarkCase) => benchmarkCase.caseId)).toEqual(
      expect.arrayContaining([
        "interpret_darker_keep_punch",
        "interpret_more_relaxed_grounded_texture",
        "interpret_clean_it_conservative",
        "interpret_clean_it_best_effort",
        "interpret_brighter_and_darker_conservative",
        "interpret_brighter_and_darker_best_effort",
        "interpret_remove_hum_first_second",
        "interpret_follow_up_not_that_much",
        "interpret_try_another_version",
        "interpret_bitcrush_runtime_only",
        "interpret_less_distorted_declip_on_clipping",
      ]),
    );
  });
});

describe("runComparisonBenchmarks", () => {
  it("runs the fixture-backed cleanup corpus with explicit measurable expectations", () => {
    const result = runComparisonBenchmarks();

    expect(result.suiteId).toBe("first_prompt_family");
    expect(result.corpusId).toBe(FIRST_PROMPT_FAMILY_CORPUS_ID);
    expect(result.caseResults).toHaveLength(firstPromptFamilyPromptSuite.length);
    expect(result.totalChecks).toBeGreaterThan(0);
    expect(result.totalPassedChecks).toBe(result.totalChecks);
    expect(result.overallScore).toBe(1);
  });

  it("covers direct clipping and direct/fallback hum/click compare cases in isolation", () => {
    const directHum = getCompareCase("compare_reduce_hum_direct_evidence");
    const fallbackHum = getCompareCase("compare_reduce_hum_fallback_proxy");
    const directClicks = getCompareCase("compare_reduce_clicks_direct_evidence");
    const fallbackClicks = getCompareCase("compare_reduce_clicks_fallback_proxy");
    const directClipping = getCompareCase("compare_repair_clipping_direct_evidence");

    const result = runComparisonBenchmarks([
      directHum,
      fallbackHum,
      directClicks,
      fallbackClicks,
      directClipping,
    ]);

    expect(result.caseResults).toHaveLength(5);

    const directHumCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === directHum.caseId,
    );
    expect(directHumCase?.report.goal_alignment).toEqual([{ goal: "reduce hum", status: "met" }]);

    const fallbackHumCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === fallbackHum.caseId,
    );
    expect(fallbackHumCase?.report.goal_alignment).toEqual([
      { goal: "reduce hum", status: "mostly_met" },
    ]);

    const directClickCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === directClicks.caseId,
    );
    expect(directClickCase?.report.goal_alignment).toEqual([
      { goal: "reduce clicks", status: "met" },
    ]);

    const fallbackClickCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === fallbackClicks.caseId,
    );
    expect(fallbackClickCase?.report.goal_alignment).toEqual([
      { goal: "reduce clicks", status: "unknown" },
    ]);

    const directClippingCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === directClipping.caseId,
    );
    expect(directClippingCase?.report.goal_alignment).toEqual([
      expect.objectContaining({ goal: "repair clipping artifacts conservatively", status: "met" }),
    ]);
  });

  it("binds the declip compare case to the committed fixture clipping measurements", () => {
    const directClipping = getCompareCase("compare_repair_clipping_direct_evidence");
    const baselineFixture = readFixtureManifest().fixtures.find(
      (fixture) => fixture.fixture_id === directClipping.fixtures.baselineFixtureId,
    );
    const candidateFixture = readFixtureManifest().fixtures.find(
      (fixture) => fixture.fixture_id === directClipping.fixtures.candidateFixtureId,
    );

    expect(baselineFixture).toBeDefined();
    expect(candidateFixture).toBeDefined();
    if (!baselineFixture || !candidateFixture) {
      throw new Error("Expected declip benchmark fixtures to exist.");
    }

    const baselineMetadata = readWavMetadata(
      path.posix.join("fixtures/audio", baselineFixture.relative_path),
    );
    const candidateMetadata = readWavMetadata(
      path.posix.join("fixtures/audio", candidateFixture.relative_path),
    );
    const baselineArtifacts = directClipping.compareOptions.baselineAnalysis.measurements.artifacts;
    const candidateArtifacts =
      directClipping.compareOptions.candidateAnalysis.measurements.artifacts;

    expect(baselineArtifacts.clipped_sample_count).toBe(baselineMetadata.clippedSampleCount);
    expect(baselineArtifacts.clipped_frame_count).toBe(baselineMetadata.clippedFrameCount);
    expect(baselineArtifacts.clipped_frame_ratio).toBe(baselineMetadata.clippedFrameRatio);
    expect(candidateArtifacts.clipped_sample_count).toBe(candidateMetadata.clippedSampleCount);
    expect(candidateArtifacts.clipped_frame_count).toBe(candidateMetadata.clippedFrameCount);
    expect(candidateArtifacts.clipped_frame_ratio).toBe(candidateMetadata.clippedFrameRatio);
  });

  it("covers stereo width and centering compare cases in isolation", () => {
    const wider = getCompareCase("compare_make_this_wider");
    const narrower = getCompareCase("compare_narrow_it_a_bit");
    const centered = getCompareCase("compare_center_this_more");
    const fixImbalance = getCompareCase("compare_fix_stereo_imbalance");

    const result = runComparisonBenchmarks([wider, narrower, centered, fixImbalance]);

    expect(result.caseResults).toHaveLength(4);
    expect(result.totalPassedChecks).toBe(result.totalChecks);
    expect(result.overallScore).toBe(1);
  });
});

describe("scoreComparisonReport", () => {
  it("fails explicit checks when a required label or goal status is missing", () => {
    const firstPrompt = firstPromptFamilyPromptSuite[0];
    if (!firstPrompt) {
      throw new Error("Expected first benchmark prompt to be available.");
    }

    const [firstCase] = runComparisonBenchmarks([firstPrompt]).caseResults;
    if (!firstCase) {
      throw new Error("Expected first benchmark case to be available.");
    }

    const { report } = firstCase;

    const expectation: ComparisonBenchmarkExpectation = {
      goalStatuses: {
        "make this loop darker": "not_met",
      },
      requiredSemanticLabels: ["cleaner"],
      forbiddenRegressionKinds: ["introduced_clipping"],
    };

    const checks = scoreComparisonReport(report, expectation);

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ checkId: "goal:make this loop darker", passed: false }),
        expect.objectContaining({ checkId: "semantic:require:cleaner", passed: false }),
        expect.objectContaining({
          checkId: "regression:forbid:introduced_clipping",
          passed: true,
        }),
      ]),
    );
  });
});

describe("runInterpretationBenchmarks", () => {
  it("runs the richer interpretation corpus with explicit artifact expectations", () => {
    const result = runInterpretationBenchmarks();

    expect(result.suiteId).toBe("intent_interpretation");
    expect(result.corpusId).toBe(INTERPRETATION_CORPUS_ID);
    expect(result.caseResults).toHaveLength(interpretationBenchmarkSuite.length);
    expect(result.totalChecks).toBeGreaterThan(0);
    expect(result.totalPassedChecks).toBe(result.totalChecks);
    expect(result.overallScore).toBe(1);
  });

  it("scores richer interpretation fields like constraints, follow-ups, and region scopes", () => {
    const result = runInterpretationBenchmarks([
      getInterpretationCase("interpret_darker_keep_punch"),
      getInterpretationCase("interpret_remove_hum_first_second"),
      getInterpretationCase("interpret_follow_up_not_that_much"),
    ]);

    expect(result.caseResults).toHaveLength(3);
    expect(result.totalPassedChecks).toBe(result.totalChecks);
    expect(result.overallScore).toBe(1);
  });
});

describe("scoreIntentInterpretation", () => {
  it("fails explicit checks when richer interpretation fields are missing", () => {
    const interpretationCase = getInterpretationCase("interpret_follow_up_not_that_much");

    const checks = scoreIntentInterpretation(interpretationCase.interpretation, {
      requiredConstraints: [{ kind: "preserve", label: "punch" }],
      expectedFollowUpIntentKind: "undo",
      requiredGroundingNotes: ["missing note"],
    });

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkId: "interpretation:require_constraint:preserve:punch",
          passed: false,
        }),
        expect.objectContaining({
          checkId: "interpretation:follow_up_intent",
          passed: false,
        }),
        expect.objectContaining({
          checkId: "interpretation:grounding_note:missing note",
          passed: false,
        }),
      ]),
    );
  });
});

describe("formatBenchmarkMarkdownReport", () => {
  it("renders a stable human-readable report", () => {
    const promptThree = firstPromptFamilyPromptSuite[2];
    const promptFour = firstPromptFamilyPromptSuite[3];

    if (!promptThree || !promptFour) {
      throw new Error("Expected benchmark prompt fixtures to exist.");
    }

    const result = runComparisonBenchmarks([promptThree, promptFour]);
    const markdown = formatBenchmarkMarkdownReport(result);

    expect(markdown).toContain("# Benchmark Report: first_prompt_family");
    expect(markdown).toContain(`Fixture corpus: ${FIRST_PROMPT_FAMILY_CORPUS_ID}`);
    expect(markdown).toContain("compare_clean_this_sample_up_a_bit");
    expect(markdown).toContain("compare_ambiguous_clean_it_unknown");
    expect(markdown).toContain("prompt: clean this sample up a bit");
    expect(markdown).toContain(
      `fixtures: ${FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID} -> fixture_phase1_first_slice_loop_cleaner`,
    );
    expect(markdown).toContain("Overall score: 1.000");
  });

  it("renders a stable interpretation benchmark report", () => {
    const interpretationCase = getInterpretationCase("interpret_clean_it_conservative");

    const result = runInterpretationBenchmarks([interpretationCase]);
    const markdown = formatBenchmarkMarkdownReport(result);

    expect(markdown).toContain("# Benchmark Report: intent_interpretation");
    expect(markdown).toContain("Benchmark mode: interpretation");
    expect(markdown).toContain(`Corpus: ${INTERPRETATION_CORPUS_ID}`);
    expect(markdown).toContain("interpret_clean_it_conservative");
    expect(markdown).toContain("next action: clarify");
  });
});

describe("runRequestCycleBenchmarks", () => {
  it("runs a fixture-backed request-cycle slice across tonal, restoration, timing, control, and iterative follow-up prompts", async () => {
    const darkerLessHarsh = getRequestCycleCase("request_cycle_darker_less_harsh");
    const warmerAndAirier = getRequestCycleCase("request_cycle_warmer_and_airier");
    const darkerLessHarshLessMuddy = getRequestCycleCase(
      "request_cycle_darker_less_harsh_less_muddy",
    );
    const tameSibilance = getRequestCycleCase("request_cycle_tame_sibilance");
    const speedUpAndTameSibilance = getRequestCycleCase(
      "request_cycle_speed_up_and_tame_sibilance",
    );
    const tameSibilanceAndDarker = getRequestCycleCase("request_cycle_tame_sibilance_and_darker");
    const removeHum = getRequestCycleCase("request_cycle_remove_60hz_hum");
    const cleanUpClicks = getRequestCycleCase("request_cycle_clean_up_clicks");
    const lessDistortedDeclip = getRequestCycleCase("request_cycle_less_distorted_declip");
    const trimBoundarySilence = getRequestCycleCase("request_cycle_trim_boundary_silence");
    const speedUp = getRequestCycleCase("request_cycle_speed_up_preserve_pitch");
    const pitchUp = getRequestCycleCase("request_cycle_pitch_up_two_semitones");
    const makeWider = getRequestCycleCase("request_cycle_make_this_wider");
    const narrowIt = getRequestCycleCase("request_cycle_narrow_it_a_bit");
    const centerMore = getRequestCycleCase("request_cycle_center_this_more");
    const fixImbalance = getRequestCycleCase("request_cycle_fix_stereo_imbalance");
    const centerMoreAndWider = getRequestCycleCase(
      "request_cycle_center_this_more_and_make_it_wider",
    );
    const firstHalfSecondDarker = getRequestCycleCase(
      "request_cycle_first_half_second_darker_and_less_harsh",
    );
    const introDarkerRefusal = getRequestCycleCase("request_cycle_intro_darker_region_refusal");
    const followUpMore = getRequestCycleCase("request_cycle_follow_up_more");
    const tryAnother = getRequestCycleCase("request_cycle_follow_up_try_another_version");
    const followUpLess = getRequestCycleCase("request_cycle_follow_up_less");
    const followUpUndo = getRequestCycleCase("request_cycle_follow_up_undo");
    const followUpRevert = getRequestCycleCase("request_cycle_follow_up_revert_previous_version");
    const controlPeaks = getRequestCycleCase("request_cycle_control_peaks_without_crushing");
    const louderControlled = getRequestCycleCase("request_cycle_louder_and_more_controlled");
    const moreControlledAndDarker = getRequestCycleCase("request_cycle_more_controlled_and_darker");
    const cleanIt = getRequestCycleCase("request_cycle_clean_it_clarification");
    const cleanItLlmClarify = getRequestCycleCase("request_cycle_clean_it_llm_clarification_loop");
    const cleanItLlmAnswer = getRequestCycleCase("request_cycle_clean_it_llm_clarification_answer");
    const brighterAndDarker = getRequestCycleCase(
      "request_cycle_brighter_and_darker_contradiction",
    );
    const speedUpAndSlowDown = getRequestCycleCase(
      "request_cycle_speed_up_and_slow_down_contradiction",
    );
    const widerAndNarrower = getRequestCycleCase("request_cycle_wider_and_narrower_contradiction");
    const cleanThisSample = getRequestCycleCase(
      "request_cycle_clean_this_sample_up_a_bit_underspecified",
    );

    const result = await runRequestCycleBenchmarks(
      {
        corpusId: "request_cycle_test_subset",
        suiteId: "first_prompt_family",
        fixtureManifestPath: FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH,
        description: "Targeted request-cycle benchmark smoke suite.",
        cases: [
          darkerLessHarsh,
          warmerAndAirier,
          darkerLessHarshLessMuddy,
          tameSibilance,
          speedUpAndTameSibilance,
          tameSibilanceAndDarker,
          removeHum,
          cleanUpClicks,
          lessDistortedDeclip,
          trimBoundarySilence,
          speedUp,
          pitchUp,
          makeWider,
          narrowIt,
          centerMore,
          fixImbalance,
          centerMoreAndWider,
          firstHalfSecondDarker,
          introDarkerRefusal,
          followUpMore,
          tryAnother,
          followUpLess,
          followUpUndo,
          followUpRevert,
          controlPeaks,
          louderControlled,
          moreControlledAndDarker,
          cleanIt,
          cleanItLlmClarify,
          cleanItLlmAnswer,
          brighterAndDarker,
          speedUpAndSlowDown,
          widerAndNarrower,
          cleanThisSample,
        ],
      },
      {
        dependencies: {
          interpretRequest: benchmarkInterpretRequestMock,
        },
      },
    );

    expect(result.suiteId).toBe("first_prompt_family");
    expect(result.corpusId).toBe("request_cycle_test_subset");
    expect(result.caseResults).toHaveLength(34);
    expect(result.totalChecks).toBeGreaterThan(0);
    expect(result.totalPassedChecks).toBe(result.totalChecks);
    expect(result.overallScore).toBe(1);

    const successCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === darkerLessHarsh.caseId,
    );
    expect(successCase?.status).toBe("ok");
    expect(
      expectAppliedRequestCycleResult(successCase?.requestCycleResult).editPlan?.steps.map(
        (step) => step.operation,
      ),
    ).toEqual(["notch_filter", "tilt_eq"]);

    const warmerAndAirierCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === warmerAndAirier.caseId,
    );
    expect(warmerAndAirierCase?.status).toBe("ok");
    expect(
      expectAppliedRequestCycleResult(warmerAndAirierCase?.requestCycleResult).editPlan?.steps.map(
        (step) => step.operation,
      ),
    ).toEqual(["low_shelf", "high_shelf"]);

    const darkerLessHarshLessMuddyCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === darkerLessHarshLessMuddy.caseId,
    );
    expect(darkerLessHarshLessMuddyCase?.status).toBe("ok");
    expect(
      expectAppliedRequestCycleResult(
        darkerLessHarshLessMuddyCase?.requestCycleResult,
      ).editPlan?.steps.map((step) => step.operation),
    ).toEqual(["notch_filter", "tilt_eq", "low_shelf"]);

    const sibilanceCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === tameSibilance.caseId,
    );
    expect(sibilanceCase?.status).toBe("ok");
    expect(
      expectAppliedRequestCycleResult(sibilanceCase?.requestCycleResult).editPlan?.steps.map(
        (step) => step.operation,
      ),
    ).toEqual(["de_esser"]);

    const speedUpAndTameSibilanceCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === speedUpAndTameSibilance.caseId,
    );
    expect(speedUpAndTameSibilanceCase?.status).toBe("ok");
    expect(
      expectAppliedRequestCycleResult(
        speedUpAndTameSibilanceCase?.requestCycleResult,
      ).editPlan?.steps.map((step) => step.operation),
    ).toEqual(["time_stretch", "de_esser"]);

    const tameSibilanceAndDarkerCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === tameSibilanceAndDarker.caseId,
    );
    expect(tameSibilanceAndDarkerCase?.status).toBe("ok");
    expect(
      expectAppliedRequestCycleResult(
        tameSibilanceAndDarkerCase?.requestCycleResult,
      ).editPlan?.steps.map((step) => step.operation),
    ).toEqual(["de_esser", "tilt_eq"]);

    const humCase = result.caseResults.find((caseResult) => caseResult.caseId === removeHum.caseId);
    expect(humCase?.status).toBe("ok");
    expect(
      expectAppliedRequestCycleResult(humCase?.requestCycleResult).editPlan?.steps.map(
        (step) => step.operation,
      ),
    ).toEqual(["dehum"]);

    const clicksCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === cleanUpClicks.caseId,
    );
    expect(clicksCase?.status).toBe("ok");
    expect(
      expectAppliedRequestCycleResult(clicksCase?.requestCycleResult).editPlan?.steps.map(
        (step) => step.operation,
      ),
    ).toEqual(["declick"]);

    const lessDistortedDeclipCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === lessDistortedDeclip.caseId,
    );
    expect(lessDistortedDeclipCase?.status).toBe("ok");
    expect(
      expectAppliedRequestCycleResult(
        lessDistortedDeclipCase?.requestCycleResult,
      ).editPlan?.steps.map((step) => step.operation),
    ).toEqual(["declip"]);

    const trimSilenceCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === trimBoundarySilence.caseId,
    );
    expect(trimSilenceCase?.status).toBe("ok");
    expect(
      expectAppliedRequestCycleResult(trimSilenceCase?.requestCycleResult).editPlan?.steps.map(
        (step) => step.operation,
      ),
    ).toEqual(["trim_silence"]);

    const firstHalfSecondDarkerCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === firstHalfSecondDarker.caseId,
    );
    expect(firstHalfSecondDarkerCase?.status).toBe("ok");
    expect(
      expectAppliedRequestCycleResult(
        firstHalfSecondDarkerCase?.requestCycleResult,
      ).editPlan?.steps.map((step) => step.target),
    ).toEqual([
      { scope: "time_range", start_seconds: 0, end_seconds: 0.5 },
      { scope: "time_range", start_seconds: 0, end_seconds: 0.5 },
    ]);

    const introDarkerRefusalCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === introDarkerRefusal.caseId,
    );
    expect(introDarkerRefusalCase?.status).toBe("error");
    expect(introDarkerRefusalCase?.error?.message).toContain("explicit time range");

    const speedUpCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === speedUp.caseId,
    );
    expect(speedUpCase?.status).toBe("ok");
    expect(
      expectAppliedRequestCycleResult(speedUpCase?.requestCycleResult).editPlan?.steps.map(
        (step) => step.operation,
      ),
    ).toEqual(["time_stretch"]);

    const pitchUpCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === pitchUp.caseId,
    );
    expect(pitchUpCase?.status).toBe("ok");
    expect(
      expectAppliedRequestCycleResult(pitchUpCase?.requestCycleResult).editPlan?.steps.map(
        (step) => step.operation,
      ),
    ).toEqual(["pitch_shift"]);

    const followUpMoreCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === followUpMore.caseId,
    );
    expect(followUpMoreCase?.status).toBe("ok");
    expect(followUpMoreCase?.requestCycleResult?.followUpResolution).toMatchObject({
      kind: "apply",
      source: "repeat_last_request",
    });
    expect(followUpMoreCase?.setupResults).toHaveLength(1);

    const tryAnotherCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === tryAnother.caseId,
    );
    expect(tryAnotherCase?.status).toBe("ok");
    expect(tryAnotherCase?.requestCycleResult?.followUpResolution).toMatchObject({
      kind: "apply",
      source: "try_another_version",
      branchId: expect.stringMatching(/^branch_alt_/),
    });
    expect(tryAnotherCase?.requestCycleResult?.sessionGraph.active_refs.branch_id).toMatch(
      /^branch_alt_/,
    );

    const followUpLessCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === followUpLess.caseId,
    );
    expect(followUpLessCase?.status).toBe("ok");
    expect(followUpLessCase?.requestCycleResult?.result_kind).toBe("reverted");
    expect(followUpLessCase?.requestCycleResult?.followUpResolution).toMatchObject({
      kind: "revert",
      source: "less",
    });

    const followUpUndoCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === followUpUndo.caseId,
    );
    expect(followUpUndoCase?.status).toBe("ok");
    expect(followUpUndoCase?.requestCycleResult?.result_kind).toBe("reverted");
    expect(followUpUndoCase?.requestCycleResult?.followUpResolution).toMatchObject({
      kind: "revert",
      source: "undo",
    });

    const followUpRevertCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === followUpRevert.caseId,
    );
    expect(followUpRevertCase?.status).toBe("ok");
    expect(followUpRevertCase?.requestCycleResult?.result_kind).toBe("reverted");
    expect(followUpRevertCase?.requestCycleResult?.followUpResolution).toMatchObject({
      kind: "revert",
      source: "revert",
    });

    const peaksCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === controlPeaks.caseId,
    );
    expect(peaksCase?.status).toBe("ok");
    expect(
      expectAppliedRequestCycleResult(peaksCase?.requestCycleResult).editPlan?.steps.map(
        (step) => step.operation,
      ),
    ).toEqual(["limiter"]);

    const louderControlledCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === louderControlled.caseId,
    );
    expect(louderControlledCase?.status).toBe("ok");
    expect(
      expectAppliedRequestCycleResult(louderControlledCase?.requestCycleResult).editPlan?.steps.map(
        (step) => step.operation,
      ),
    ).toEqual(["compressor", "normalize"]);

    const moreControlledAndDarkerCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === moreControlledAndDarker.caseId,
    );
    expect(moreControlledAndDarkerCase?.status).toBe("ok");
    expect(
      expectAppliedRequestCycleResult(
        moreControlledAndDarkerCase?.requestCycleResult,
      ).editPlan?.steps.map((step) => step.operation),
    ).toEqual(["tilt_eq", "compressor"]);

    const centerMoreAndWiderCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === centerMoreAndWider.caseId,
    );
    expect(centerMoreAndWiderCase?.status).toBe("ok");
    expect(
      expectAppliedRequestCycleResult(
        centerMoreAndWiderCase?.requestCycleResult,
      ).editPlan?.steps.map((step) => step.operation),
    ).toEqual(["stereo_balance_correction", "stereo_width"]);

    const unsupportedCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === cleanIt.caseId,
    );
    expect(unsupportedCase?.status).toBe("error");
    expect(unsupportedCase?.error?.stage).toBe("plan");
    expect(unsupportedCase?.error?.failureClass).toBe("supported_but_underspecified");

    const contradictoryToneCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === brighterAndDarker.caseId,
    );
    expect(contradictoryToneCase?.status).toBe("error");
    expect(contradictoryToneCase?.error?.stage).toBe("plan");
    expect(contradictoryToneCase?.error?.failureClass).toBe("supported_but_underspecified");

    const contradictoryTimingCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === speedUpAndSlowDown.caseId,
    );
    expect(contradictoryTimingCase?.status).toBe("error");
    expect(contradictoryTimingCase?.error?.stage).toBe("plan");
    expect(contradictoryTimingCase?.error?.failureClass).toBe("supported_but_underspecified");

    const contradictoryStereoCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === widerAndNarrower.caseId,
    );
    expect(contradictoryStereoCase?.status).toBe("error");
    expect(contradictoryStereoCase?.error?.stage).toBe("plan");
    expect(contradictoryStereoCase?.error?.failureClass).toBe("supported_but_underspecified");

    const underspecifiedCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === cleanThisSample.caseId,
    );
    expect(underspecifiedCase?.status).toBe("error");
    expect(underspecifiedCase?.error?.stage).toBe("plan");
    expect(underspecifiedCase?.error?.failureClass).toBe("supported_but_underspecified");

    const llmClarifyCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === cleanItLlmClarify.caseId,
    );
    expect(llmClarifyCase?.status).toBe("ok");
    expect(llmClarifyCase?.requestCycleResult?.result_kind).toBe("clarification_required");
    expect(
      llmClarifyCase?.requestCycleResult?.sessionGraph.metadata?.pending_clarification,
    ).toMatchObject({
      original_user_request: "clean it",
    });

    const llmAnswerCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === cleanItLlmAnswer.caseId,
    );
    expect(llmAnswerCase?.status).toBe("ok");
    expect(llmAnswerCase?.requestCycleResult?.followUpResolution).toMatchObject({
      kind: "apply",
      source: "clarification_answer",
    });
    expect(
      expectAppliedRequestCycleResult(llmAnswerCase?.requestCycleResult).editPlan?.steps.map(
        (step) => step.operation,
      ),
    ).toEqual(["notch_filter", "tilt_eq"]);
    expect(
      llmAnswerCase?.requestCycleResult?.sessionGraph.metadata?.pending_clarification,
    ).toBeUndefined();
  }, 120_000);

  it("preserves follow-up version loading when import/apply dependencies are overridden", async () => {
    const benchmarkCase = getRequestCycleCase("request_cycle_follow_up_try_another_version");

    const result = await runRequestCycleBenchmarkCase(benchmarkCase, {
      dependencies: {
        importAudioFromFile: (...args) =>
          defaultOrchestrationDependencies.importAudioFromFile(...args),
        applyEditPlan: (...args) => defaultOrchestrationDependencies.applyEditPlan(...args),
      },
    });

    expect(result.status).toBe("ok");
    expect(result.requestCycleResult?.followUpResolution).toMatchObject({
      kind: "apply",
      source: "try_another_version",
    });
    expect(result.score).toBe(1);
  }, 60_000);

  it("can execute iterative follow-up benchmarks through the run_request_cycle tool surface", async () => {
    const followUpMore = getRequestCycleCase("request_cycle_follow_up_more");
    const tryAnother = getRequestCycleCase("request_cycle_follow_up_try_another_version");
    const followUpUndo = getRequestCycleCase("request_cycle_follow_up_undo");

    const result = await runRequestCycleBenchmarks(
      {
        corpusId: "request_cycle_tool_surface_subset",
        suiteId: "first_prompt_family",
        fixtureManifestPath: FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH,
        description: "Tool-surface request-cycle benchmark smoke suite.",
        cases: [followUpMore, tryAnother, followUpUndo],
      },
      {
        executionSurface: "tool",
      },
    );

    expect(result.caseResults).toHaveLength(3);
    expect(result.totalPassedChecks).toBe(result.totalChecks);
    expect(result.overallScore).toBe(1);
    expect(result.caseResults.every((caseResult) => caseResult.executionSurface === "tool")).toBe(
      true,
    );
  }, 60_000);
});

describe("formatBenchmarkMarkdownReport request-cycle mode", () => {
  it("renders a stable request-cycle benchmark report", async () => {
    const darkerLessHarsh = getRequestCycleCase("request_cycle_darker_less_harsh");
    const darkerLessHarshLessMuddy = getRequestCycleCase(
      "request_cycle_darker_less_harsh_less_muddy",
    );
    const speedUpAndTameSibilance = getRequestCycleCase(
      "request_cycle_speed_up_and_tame_sibilance",
    );
    const trimBoundarySilence = getRequestCycleCase("request_cycle_trim_boundary_silence");
    const cleanThisSample = getRequestCycleCase(
      "request_cycle_clean_this_sample_up_a_bit_underspecified",
    );

    const result = await runRequestCycleBenchmarks({
      corpusId: "request_cycle_report_subset",
      suiteId: "first_prompt_family",
      fixtureManifestPath: FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH,
      description: "Request-cycle report formatting smoke suite.",
      cases: [
        darkerLessHarsh,
        darkerLessHarshLessMuddy,
        speedUpAndTameSibilance,
        trimBoundarySilence,
        cleanThisSample,
      ],
    });

    const markdown = formatBenchmarkMarkdownReport(result);

    expect(markdown).toContain("# Benchmark Report: first_prompt_family");
    expect(markdown).toContain("Benchmark mode: request-cycle");
    expect(markdown).toContain("request_cycle_darker_less_harsh");
    expect(markdown).toContain("request_cycle_darker_less_harsh_less_muddy");
    expect(markdown).toContain("request_cycle_speed_up_and_tame_sibilance");
    expect(markdown).toContain("request_cycle_trim_boundary_silence");
    expect(markdown).toContain("request_cycle_clean_this_sample_up_a_bit_underspecified");
    expect(markdown).toContain("planned operations: notch_filter, tilt_eq");
    expect(markdown).toContain("planned operations: notch_filter, tilt_eq, low_shelf");
    expect(markdown).toContain("planned operations: time_stretch, de_esser");
    expect(markdown).toContain("planned operations: trim_silence");
    expect(markdown).toContain("failure class: supported_but_underspecified");
    expect(markdown).toContain("Fixture corpus: request_cycle_report_subset");
  }, 60_000);

  it("still renders request-cycle output when the first case is an expected error", async () => {
    const cleanIt = getRequestCycleCase("request_cycle_clean_it_clarification");
    const darkerLessHarsh = getRequestCycleCase("request_cycle_darker_less_harsh");

    const result = await runRequestCycleBenchmarks({
      corpusId: "request_cycle_error_first_subset",
      suiteId: "first_prompt_family",
      fixtureManifestPath: FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH,
      description: "Request-cycle error-first report smoke suite.",
      cases: [cleanIt, darkerLessHarsh],
    });

    const markdown = formatBenchmarkMarkdownReport(result);

    expect(markdown).toContain("Benchmark mode: request-cycle");
    expect(markdown).toContain("request_cycle_clean_it_clarification");
    expect(markdown).toContain("failure class: supported_but_underspecified");
    expect(markdown).toContain("request_cycle_darker_less_harsh");
    expect(markdown).toContain("planned operations: notch_filter, tilt_eq");
  }, 60_000);
});
