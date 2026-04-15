import { describe, expect, it } from "vitest";
import {
  type ComparisonBenchmarkExpectation,
  firstPromptFamilyPromptSuite,
  formatBenchmarkMarkdownReport,
  runComparisonBenchmarks,
  scoreComparisonReport,
} from "../src/index.js";

describe("runComparisonBenchmarks", () => {
  it("runs the first prompt family suite with explicit measurable expectations", () => {
    const result = runComparisonBenchmarks();

    expect(result.suiteId).toBe("first_prompt_family");
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
        expect.objectContaining({ checkId: "regression:forbid:introduced_clipping", passed: true }),
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
    expect(markdown).toContain("compare_clean_this_sample_up_a_bit");
    expect(markdown).toContain("compare_ambiguous_clean_it_unknown");
    expect(markdown).toContain("prompt: clean this sample up a bit");
    expect(markdown).toContain("Overall score: 1.000");
  });
});
