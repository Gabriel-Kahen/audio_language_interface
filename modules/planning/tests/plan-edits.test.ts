import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";
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
import commonSchema from "../../../contracts/schemas/json/common.schema.json" with { type: "json" };
import editPlanSchema from "../../../contracts/schemas/json/edit-plan.schema.json" with {
  type: "json",
};
import { parseUserRequest, planEdits } from "../src/index.js";
import type { AnalysisReport, AudioVersion, SemanticProfile } from "../src/types.js";

describe("parseUserRequest", () => {
  it("extracts explicit trim and fade durations", () => {
    const parsed = parseUserRequest("Trim from 0.2s to 1.2s and fade out 0.1 seconds.");

    expect(parsed.trim_range).toEqual({ start_seconds: 0.2, end_seconds: 1.2 });
    expect(parsed.fade_out_seconds).toBe(0.1);
  });

  it("parses cleaner and preserve-punch language conservatively", () => {
    const parsed = parseUserRequest("Clean this sample up a bit without losing punch.");

    expect(parsed.wants_cleaner).toBe(true);
    expect(parsed.preserve_punch).toBe(true);
    expect(parsed.intensity).toBe("subtle");
  });

  it("parses supported compressor and limiter intent phrases", () => {
    const parsed = parseUserRequest(
      "Make this a little tighter and more controlled, then keep peaks in check.",
    );

    expect(parsed.wants_more_controlled_dynamics).toBe(true);
    expect(parsed.wants_peak_control).toBe(true);
    expect(parsed.intensity).toBe("subtle");
  });

  it("classifies ambiguous and unsupported prompt phrases explicitly", () => {
    const parsed = parseUserRequest("Make it hit harder and wider.");

    expect(parsed.ambiguous_requests).toContain("hit harder");
    expect(parsed.unsupported_requests).toContain("wider");
  });
});

describe("planEdits", () => {
  it("builds a contract-aligned tonal plan from analysis and semantic evidence", () => {
    const plan = planEdits({
      userRequest: "Make the loop a little darker and less harsh, but keep the punch.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createAnalysisReportFixture(),
      semanticProfile: createSemanticProfileFixture(),
    });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.operation).toBe("parametric_eq");
    expect(plan.steps[0]?.parameters).toEqual({
      bands: [
        { type: "bell", frequency_hz: 3750, gain_db: -1.5, q: 1.2 },
        { type: "bell", frequency_hz: 6500, gain_db: -1.01, q: 0.8 },
      ],
    });
    expect(plan.goals).toEqual([
      "reduce upper-mid harshness",
      "slightly reduce perceived brightness",
      "preserve transient impact",
    ]);
    expect(plan.constraints).toContain("avoid reducing transient attack more than necessary");
    expect(plan.verification_targets).toContain("reduced energy in the 3 kHz to 4.5 kHz region");
    expect(validateAgainstSchema(editPlanSchema, plan)).toBe(true);
  });

  it("handles the exact darker-and-less-harsh first-slice prompt", () => {
    const plan = planEdits({
      userRequest: "make this loop darker and less harsh",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createAnalysisReportFixture(),
      semanticProfile: createSemanticProfileFixture(),
    });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.operation).toBe("parametric_eq");
    expect(plan.steps[0]?.parameters).toEqual({
      bands: [
        { type: "bell", frequency_hz: 3750, gain_db: -2, q: 1.2 },
        { type: "bell", frequency_hz: 6500, gain_db: -1.5, q: 0.8 },
      ],
    });
  });

  it("maps the exact cleaner first-slice prompt to evidence-backed tonal cleanup", () => {
    const plan = planEdits({
      userRequest: "clean this sample up a bit",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createAnalysisReportFixture(),
      semanticProfile: createSemanticProfileFixture(),
    });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.operation).toBe("parametric_eq");
    expect(plan.steps[0]?.parameters).toEqual({
      bands: [{ type: "bell", frequency_hz: 3750, gain_db: -1.5, q: 1.2 }],
    });
    expect(plan.goals).toEqual(["reduce upper-mid harshness"]);
  });

  it("handles the exact preserve-punch brightness prompt conservatively", () => {
    const plan = planEdits({
      userRequest: "reduce brightness without losing punch",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createAnalysisReportFixture(),
      semanticProfile: createSemanticProfileFixture(),
    });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.operation).toBe("parametric_eq");
    expect(plan.steps[0]?.parameters).toEqual({
      bands: [{ type: "bell", frequency_hz: 6500, gain_db: -1.35, q: 0.8 }],
    });
    expect(plan.constraints).toContain("avoid reducing transient attack more than necessary");
  });

  it("orders trim before fade and keeps parameters explicit", () => {
    const plan = planEdits({
      userRequest: "Trim from 0.2s to 1.2s and fade out 0.1 seconds.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createAnalysisReportFixture(),
      semanticProfile: createSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["trim", "fade"]);
    expect(plan.steps[0]?.target).toEqual({
      scope: "time_range",
      start_seconds: 0.2,
      end_seconds: 1.2,
    });
    expect(plan.steps[1]?.parameters).toEqual({ fade_out_seconds: 0.1 });
    expect(validateAgainstSchema(editPlanSchema, plan)).toBe(true);
  });

  it("adds a conservative gain step only when measured headroom allows it", () => {
    const analysisReport = {
      ...createAnalysisReportFixture(),
      measurements: {
        ...createAnalysisReportFixture().measurements,
        levels: {
          ...createAnalysisReportFixture().measurements.levels,
          true_peak_dbtp: -4,
        },
      },
    } satisfies AnalysisReport;

    const plan = planEdits({
      userRequest: "Make it louder.",
      audioVersion: createAudioVersionFixture(),
      analysisReport,
      semanticProfile: createSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["gain"]);
    expect(plan.steps[0]?.parameters).toEqual({ gain_db: 2 });
  });

  it("maps controlled dynamics prompts to a conservative compressor step", () => {
    const plan = planEdits({
      userRequest: "Make this a little tighter and more controlled, but keep the punch.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createAnalysisReportFixture(),
      semanticProfile: createSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["compressor"]);
    expect(plan.steps[0]?.parameters).toEqual({
      threshold_db: -16,
      ratio: 1.8,
      attack_ms: 25,
      release_ms: 120,
      knee_db: 3,
      makeup_gain_db: 0,
    });
    expect(plan.goals).toContain("make dynamics more controlled without over-compressing");
    expect(plan.constraints).toContain("avoid obvious pumping or over-compression");
    expect(plan.verification_targets).toContain(
      "slightly reduced dynamic range without obvious pumping",
    );
  });

  it("maps explicit peak-control prompts to a conservative limiter step", () => {
    const plan = planEdits({
      userRequest: "Control peaks with a limiter.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createAnalysisReportFixture(),
      semanticProfile: createSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["limiter"]);
    expect(plan.steps[0]?.parameters).toEqual({
      ceiling_dbtp: -1,
      input_gain_db: 1.1,
      release_ms: 80,
      lookahead_ms: 5,
    });
    expect(plan.goals).toContain("control peak excursions conservatively");
  });

  it("orders compressor before limiter when both supported dynamics intents are requested", () => {
    const plan = planEdits({
      userRequest: "Make this more controlled and catch peaks.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createAnalysisReportFixture(),
      semanticProfile: createSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["compressor", "limiter"]);
  });

  it("fails instead of inventing unsupported behavior", () => {
    expect(() =>
      planEdits({
        userRequest: "Make it better.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createSemanticProfileFixture(),
      }),
    ).toThrow(/ambiguous phrasing/i);
  });

  it("fails clearly for unsupported cleanup operations", () => {
    expect(() =>
      planEdits({
        userRequest: "Clean this sample up by removing hiss.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createSemanticProfileFixture(),
      }),
    ).toThrow(/does not support `hiss`/);
  });

  it("fails clearly for ambiguous dynamics language", () => {
    expect(() =>
      planEdits({
        userRequest: "Make it hit harder.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createSemanticProfileFixture(),
      }),
    ).toThrow(/ambiguous phrasing/i);
  });

  it("fails clearly for unsupported stereo width placeholders", () => {
    expect(() =>
      planEdits({
        userRequest: "Make it wider.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createSemanticProfileFixture(),
      }),
    ).toThrow(/does not support `wider`/i);
  });

  it("fails clearly for contradictory tonal directions", () => {
    expect(() =>
      planEdits({
        userRequest: "Make it brighter and darker.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createSemanticProfileFixture(),
      }),
    ).toThrow(/both darker and brighter tonal moves/i);
  });

  it("fails clearly when cleaner is requested without supported tonal evidence", () => {
    expect(() =>
      planEdits({
        userRequest: "Clean this sample up a bit.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: { ...createAnalysisReportFixture(), annotations: [] },
        semanticProfile: {
          ...createSemanticProfileFixture(),
          descriptors: [],
        },
      }),
    ).toThrow(/only supports conservative tonal cleanup/i);
  });

  it("rejects time-based requests that exceed the current audio version duration", () => {
    expect(() =>
      planEdits({
        userRequest: "Trim from 0.2s to 4.5s and fade out 0.1 seconds.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createSemanticProfileFixture(),
      }),
    ).toThrow(/trim range must stay within the provided AudioVersion duration/);

    expect(() =>
      planEdits({
        userRequest: "Trim from 0.2s to 1.2s and fade out 2 seconds.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createSemanticProfileFixture(),
      }),
    ).toThrow(/fade out duration must not exceed the available AudioVersion duration/);
  });

  it("rejects overlapping combined fade spans", () => {
    expect(() =>
      planEdits({
        userRequest: "Fade in 2.1 seconds and fade out 2.1 seconds.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createSemanticProfileFixture(),
      }),
    ).toThrow(/fade durations must not overlap/i);
  });

  it("rejects overly aggressive combined fade coverage even without overlap", () => {
    expect(() =>
      planEdits({
        userRequest: "Fade in 1.2 seconds and fade out 1 seconds.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createSemanticProfileFixture(),
      }),
    ).toThrow(/fade durations are too aggressive/i);
  });

  it("validates inbound analysis and semantic contracts before planning", () => {
    const invalidAnalysisReport = {
      ...createAnalysisReportFixture(),
      summary: {},
    } as unknown as AnalysisReport;

    expect(() =>
      planEdits({
        userRequest: "Make it louder.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: invalidAnalysisReport,
        semanticProfile: createSemanticProfileFixture(),
      }),
    ).toThrow(/AnalysisReport schema validation failed/);

    const invalidSemanticProfile = {
      ...createSemanticProfileFixture(),
      descriptors: [{ label: "bright", confidence: 2, evidence_refs: [], rationale: "invalid" }],
    } as unknown as SemanticProfile;

    expect(() =>
      planEdits({
        userRequest: "Make it louder.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: invalidSemanticProfile,
      }),
    ).toThrow(/SemanticProfile schema validation failed/);
  });
});

function createAudioVersionFixture(): AudioVersion {
  return audioVersionExample as unknown as AudioVersion;
}

function createAnalysisReportFixture(): AnalysisReport {
  return {
    ...(analysisExample as unknown as AnalysisReport),
    annotations: [
      {
        ...(analysisExample.annotations?.[0] as NonNullable<AnalysisReport["annotations"]>[number]),
        bands_hz: [3000, 4500],
      },
    ],
  };
}

function createSemanticProfileFixture(): SemanticProfile {
  return semanticExample as unknown as SemanticProfile;
}

function validateAgainstSchema(schema: unknown, payload: unknown): boolean {
  const Ajv2020 = Ajv2020Import as unknown as new (options: {
    strict: boolean;
  }) => {
    addSchema: (value: unknown, key?: string) => void;
    compile: (value: unknown) => {
      (candidate: unknown): boolean;
      errors?: unknown;
    };
  };
  const addFormats = addFormatsImport as unknown as (ajv: object) => void;
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  ajv.addSchema(commonSchema, commonSchema.$id);
  const validate = ajv.compile(schema);
  const valid = validate(payload);

  if (!valid) {
    throw new Error(JSON.stringify(validate.errors));
  }

  return true;
}
