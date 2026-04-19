import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

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

    expect(firstPromptFamilyPromptSuite).toHaveLength(5);

    for (const benchmarkCase of firstPromptFamilyPromptSuite) {
      expect(fixtureIds.has(benchmarkCase.fixtures.sourceFixtureId)).toBe(true);
      expect(fixtureIds.has(benchmarkCase.fixtures.baselineFixtureId)).toBe(true);
      expect(fixtureIds.has(benchmarkCase.fixtures.candidateFixtureId)).toBe(true);
      expect(benchmarkCase.fixtures.sourceFixtureId).toBe(FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID);
      expect(benchmarkCase.fixtures.baselineFixtureId).toBe(FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID);
    }
  });

  it("binds every request-cycle benchmark case to the committed source fixture", () => {
    const fixtureIds = new Set(readFixtureManifest().fixtures.map((fixture) => fixture.fixture_id));

    expect(firstPromptFamilyRequestCycleCorpus.corpusId).toBe(
      FIRST_PROMPT_FAMILY_REQUEST_CYCLE_CORPUS_ID,
    );
    expect(firstPromptFamilyRequestCycleCorpus.fixtureManifestPath).toBe(
      FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH,
    );
    expect(firstPromptFamilyRequestCycleSuite).toHaveLength(5);

    for (const benchmarkCase of firstPromptFamilyRequestCycleSuite) {
      expect(fixtureIds.has(benchmarkCase.fixtureId)).toBe(true);
      expect(benchmarkCase.fixtureId).toBe(FIRST_PROMPT_FAMILY_SOURCE_FIXTURE_ID);
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
  it("runs a fixture-backed request-cycle slice and preserves explicit failure classes", async () => {
    const darkerLessHarsh = firstPromptFamilyRequestCycleSuite[0];
    const cleanIt = firstPromptFamilyRequestCycleSuite[3];
    const cleanThisSample = firstPromptFamilyRequestCycleSuite[4];

    if (!darkerLessHarsh || !cleanIt || !cleanThisSample) {
      throw new Error("Expected request-cycle benchmark fixtures to exist.");
    }

    const result = await runRequestCycleBenchmarks({
      corpusId: "request_cycle_test_subset",
      suiteId: "first_prompt_family",
      fixtureManifestPath: FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH,
      description: "Targeted request-cycle benchmark smoke suite.",
      cases: [darkerLessHarsh, cleanIt, cleanThisSample],
    });

    expect(result.suiteId).toBe("first_prompt_family");
    expect(result.corpusId).toBe("request_cycle_test_subset");
    expect(result.caseResults).toHaveLength(3);
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
});

describe("formatBenchmarkMarkdownReport request-cycle mode", () => {
  it("renders a stable request-cycle benchmark report", async () => {
    const darkerLessHarsh = firstPromptFamilyRequestCycleSuite[0];
    const cleanThisSample = firstPromptFamilyRequestCycleSuite[4];

    if (!darkerLessHarsh || !cleanThisSample) {
      throw new Error("Expected request-cycle benchmark fixtures to exist.");
    }

    const result = await runRequestCycleBenchmarks({
      corpusId: "request_cycle_report_subset",
      suiteId: "first_prompt_family",
      fixtureManifestPath: FIRST_PROMPT_FAMILY_FIXTURE_MANIFEST_PATH,
      description: "Request-cycle report formatting smoke suite.",
      cases: [darkerLessHarsh, cleanThisSample],
    });

    const markdown = formatBenchmarkMarkdownReport(result);

    expect(markdown).toContain("# Benchmark Report: first_prompt_family");
    expect(markdown).toContain("Benchmark mode: request-cycle");
    expect(markdown).toContain("request_cycle_darker_less_harsh");
    expect(markdown).toContain("request_cycle_clean_this_sample_up_a_bit_underspecified");
    expect(markdown).toContain("planned operations: notch_filter, tilt_eq");
    expect(markdown).toContain("failure class: supported_but_underspecified");
    expect(markdown).toContain("Fixture corpus: request_cycle_report_subset");
  }, 60_000);
});
