import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { defaultOrchestrationDependencies } from "@audio-language-interface/orchestration";
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
  runComparisonBenchmarks,
  runRequestCycleBenchmarkCase,
  runRequestCycleBenchmarks,
  scoreComparisonReport,
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

function getCompareCase(caseId: string) {
  const benchmarkCase = firstPromptFamilyPromptSuite.find((item) => item.caseId === caseId);

  if (!benchmarkCase) {
    throw new Error(`Expected compare benchmark case ${caseId} to exist.`);
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
      dataSize = chunkSize;
    }

    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (
    channels === undefined ||
    sampleRate === undefined ||
    bitsPerSample === undefined ||
    dataSize === undefined
  ) {
    throw new Error(`Incomplete WAV metadata for fixture ${relativePath}.`);
  }

  const durationSeconds = dataSize / (sampleRate * channels * (bitsPerSample / 8));
  const checksumSha256 = createHash("sha256").update(buffer).digest("hex");

  return {
    codec,
    channels,
    sampleRate,
    bitsPerSample,
    durationSeconds,
    fileSizeBytes: buffer.length,
    checksumSha256,
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

    expect(firstPromptFamilyPromptSuite).toHaveLength(9);

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
    expect(firstPromptFamilyRequestCycleSuite).toHaveLength(18);
    expect(firstPromptFamilyRequestCycleSuite.map((benchmarkCase) => benchmarkCase.caseId)).toEqual(
      expect.arrayContaining([
        "request_cycle_tame_sibilance",
        "request_cycle_remove_60hz_hum",
        "request_cycle_clean_up_clicks",
        "request_cycle_trim_boundary_silence",
        "request_cycle_speed_up_preserve_pitch",
        "request_cycle_pitch_up_two_semitones",
        "request_cycle_follow_up_more",
        "request_cycle_follow_up_try_another_version",
        "request_cycle_follow_up_less",
        "request_cycle_follow_up_undo",
        "request_cycle_follow_up_revert_previous_version",
        "request_cycle_control_peaks_without_crushing",
        "request_cycle_louder_and_more_controlled",
      ]),
    );

    for (const benchmarkCase of firstPromptFamilyRequestCycleSuite) {
      expect(fixtureIds.has(benchmarkCase.fixtureId)).toBe(true);
    }
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

  it("covers direct and fallback hum/click compare cases in isolation", () => {
    const directHum = getCompareCase("compare_reduce_hum_direct_evidence");
    const fallbackHum = getCompareCase("compare_reduce_hum_fallback_proxy");
    const directClicks = getCompareCase("compare_reduce_clicks_direct_evidence");
    const fallbackClicks = getCompareCase("compare_reduce_clicks_fallback_proxy");

    const result = runComparisonBenchmarks([directHum, fallbackHum, directClicks, fallbackClicks]);

    expect(result.caseResults).toHaveLength(4);

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
});

describe("runRequestCycleBenchmarks", () => {
  it("runs a fixture-backed request-cycle slice across tonal, restoration, timing, control, and iterative follow-up prompts", async () => {
    const darkerLessHarsh = getRequestCycleCase("request_cycle_darker_less_harsh");
    const tameSibilance = getRequestCycleCase("request_cycle_tame_sibilance");
    const removeHum = getRequestCycleCase("request_cycle_remove_60hz_hum");
    const cleanUpClicks = getRequestCycleCase("request_cycle_clean_up_clicks");
    const trimBoundarySilence = getRequestCycleCase("request_cycle_trim_boundary_silence");
    const speedUp = getRequestCycleCase("request_cycle_speed_up_preserve_pitch");
    const pitchUp = getRequestCycleCase("request_cycle_pitch_up_two_semitones");
    const followUpMore = getRequestCycleCase("request_cycle_follow_up_more");
    const tryAnother = getRequestCycleCase("request_cycle_follow_up_try_another_version");
    const followUpLess = getRequestCycleCase("request_cycle_follow_up_less");
    const followUpUndo = getRequestCycleCase("request_cycle_follow_up_undo");
    const followUpRevert = getRequestCycleCase("request_cycle_follow_up_revert_previous_version");
    const controlPeaks = getRequestCycleCase("request_cycle_control_peaks_without_crushing");
    const louderControlled = getRequestCycleCase("request_cycle_louder_and_more_controlled");
    const cleanIt = getRequestCycleCase("request_cycle_clean_it_clarification");
    const cleanThisSample = getRequestCycleCase(
      "request_cycle_clean_this_sample_up_a_bit_underspecified",
    );

    const result = await runRequestCycleBenchmarks({
      corpusId: "request_cycle_test_subset",
      suiteId: "first_prompt_family",
      fixtureManifestPath: FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH,
      description: "Targeted request-cycle benchmark smoke suite.",
      cases: [
        darkerLessHarsh,
        tameSibilance,
        removeHum,
        cleanUpClicks,
        trimBoundarySilence,
        speedUp,
        pitchUp,
        followUpMore,
        tryAnother,
        followUpLess,
        followUpUndo,
        followUpRevert,
        controlPeaks,
        louderControlled,
        cleanIt,
        cleanThisSample,
      ],
    });

    expect(result.suiteId).toBe("first_prompt_family");
    expect(result.corpusId).toBe("request_cycle_test_subset");
    expect(result.caseResults).toHaveLength(16);
    expect(result.totalChecks).toBeGreaterThan(0);
    expect(result.totalPassedChecks).toBe(result.totalChecks);
    expect(result.overallScore).toBe(1);

    const successCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === darkerLessHarsh.caseId,
    );
    expect(successCase?.status).toBe("ok");
    expect(successCase?.requestCycleResult?.editPlan?.steps.map((step) => step.operation)).toEqual([
      "notch_filter",
      "tilt_eq",
    ]);

    const sibilanceCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === tameSibilance.caseId,
    );
    expect(sibilanceCase?.status).toBe("ok");
    expect(
      sibilanceCase?.requestCycleResult?.editPlan?.steps.map((step) => step.operation),
    ).toEqual(["de_esser"]);

    const humCase = result.caseResults.find((caseResult) => caseResult.caseId === removeHum.caseId);
    expect(humCase?.status).toBe("ok");
    expect(humCase?.requestCycleResult?.editPlan?.steps.map((step) => step.operation)).toEqual([
      "dehum",
    ]);

    const clicksCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === cleanUpClicks.caseId,
    );
    expect(clicksCase?.status).toBe("ok");
    expect(clicksCase?.requestCycleResult?.editPlan?.steps.map((step) => step.operation)).toEqual([
      "declick",
    ]);

    const trimSilenceCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === trimBoundarySilence.caseId,
    );
    expect(trimSilenceCase?.status).toBe("ok");
    expect(
      trimSilenceCase?.requestCycleResult?.editPlan?.steps.map((step) => step.operation),
    ).toEqual(["trim_silence"]);

    const speedUpCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === speedUp.caseId,
    );
    expect(speedUpCase?.status).toBe("ok");
    expect(speedUpCase?.requestCycleResult?.editPlan?.steps.map((step) => step.operation)).toEqual([
      "time_stretch",
    ]);

    const pitchUpCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === pitchUp.caseId,
    );
    expect(pitchUpCase?.status).toBe("ok");
    expect(pitchUpCase?.requestCycleResult?.editPlan?.steps.map((step) => step.operation)).toEqual([
      "pitch_shift",
    ]);

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
    expect(peaksCase?.requestCycleResult?.editPlan?.steps.map((step) => step.operation)).toEqual([
      "limiter",
    ]);

    const louderControlledCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === louderControlled.caseId,
    );
    expect(louderControlledCase?.status).toBe("ok");
    expect(
      louderControlledCase?.requestCycleResult?.editPlan?.steps.map((step) => step.operation),
    ).toEqual(["compressor", "normalize"]);

    const unsupportedCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === cleanIt.caseId,
    );
    expect(unsupportedCase?.status).toBe("error");
    expect(unsupportedCase?.error?.stage).toBe("plan");
    expect(unsupportedCase?.error?.failureClass).toBe("supported_but_underspecified");

    const underspecifiedCase = result.caseResults.find(
      (caseResult) => caseResult.caseId === cleanThisSample.caseId,
    );
    expect(underspecifiedCase?.status).toBe("error");
    expect(underspecifiedCase?.error?.stage).toBe("plan");
    expect(underspecifiedCase?.error?.failureClass).toBe("supported_but_underspecified");
  }, 60_000);

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
    const trimBoundarySilence = getRequestCycleCase("request_cycle_trim_boundary_silence");
    const cleanThisSample = getRequestCycleCase(
      "request_cycle_clean_this_sample_up_a_bit_underspecified",
    );

    const result = await runRequestCycleBenchmarks({
      corpusId: "request_cycle_report_subset",
      suiteId: "first_prompt_family",
      fixtureManifestPath: FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH,
      description: "Request-cycle report formatting smoke suite.",
      cases: [darkerLessHarsh, trimBoundarySilence, cleanThisSample],
    });

    const markdown = formatBenchmarkMarkdownReport(result);

    expect(markdown).toContain("# Benchmark Report: first_prompt_family");
    expect(markdown).toContain("Benchmark mode: request-cycle");
    expect(markdown).toContain("request_cycle_darker_less_harsh");
    expect(markdown).toContain("request_cycle_trim_boundary_silence");
    expect(markdown).toContain("request_cycle_clean_this_sample_up_a_bit_underspecified");
    expect(markdown).toContain("planned operations: notch_filter, tilt_eq");
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
