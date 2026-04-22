import path from "node:path";

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
import { PlanningFailure, parseUserRequest, planEdits } from "../src/index.js";
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

  it("parses the benchmarked loudness-and-peak-control wording variants", () => {
    const louderAndControlled = parseUserRequest("Make it louder and more controlled.");
    const peakControl = parseUserRequest("Control the peaks without crushing it.");

    expect(louderAndControlled.wants_louder).toBe(true);
    expect(louderAndControlled.wants_more_controlled_dynamics).toBe(true);
    expect(peakControl.wants_peak_control).toBe(true);
    expect(peakControl.preserve_punch).toBe(true);
  });

  it("parses supported denoise and stereo-width intent phrases", () => {
    const parsed = parseUserRequest("Reduce hiss a bit and make it wider.");

    expect(parsed.wants_denoise).toBe(true);
    expect(parsed.wants_wider).toBe(true);
    expect(parsed.intensity).toBe("subtle");
  });

  it("parses stereo-centering intent phrases conservatively", () => {
    const parsed = parseUserRequest("Center this more and fix the stereo imbalance.");

    expect(parsed.wants_more_centered).toBe(true);
  });

  it("parses normalize, surgical EQ, and restoration intent phrases", () => {
    const parsed = parseUserRequest(
      "Normalize it a little louder, add some air, tame sibilance, remove 60 Hz hum, and clean up clicks.",
    );

    expect(parsed.wants_louder).toBe(true);
    expect(parsed.wants_more_even_level).toBe(true);
    expect(parsed.wants_more_air).toBe(true);
    expect(parsed.wants_tame_sibilance).toBe(true);
    expect(parsed.wants_remove_hum).toBe(true);
    expect(parsed.wants_remove_clicks).toBe(true);
    expect(parsed.intensity).toBe("subtle");
  });

  it("parses supported timing-edit phrases conservatively", () => {
    const trimSilence = parseUserRequest("Trim the silence at the beginning and end.");
    const speedUp = parseUserRequest("Speed up by 10%.");
    const pitchUp = parseUserRequest("Pitch up by 2 semitones.");

    expect(trimSilence.wants_trim_silence).toBe(true);
    expect(trimSilence.trim_leading_silence).toBe(true);
    expect(trimSilence.trim_trailing_silence).toBe(true);

    expect(speedUp.wants_speed_up).toBe(true);
    expect(speedUp.stretch_ratio).toBe(0.9);

    expect(pitchUp.wants_pitch_shift).toBe(true);
    expect(pitchUp.pitch_shift_semitones).toBe(2);
  });

  it("classifies supported cross-family compounds as supported requests", () => {
    const timingAndTonal = parseUserRequest("Speed it up by 10% and make it darker.");
    const restorationAndTonal = parseUserRequest("Clean up clicks and make it darker.");
    const loudnessAndTonal = parseUserRequest(
      "Make it louder, more controlled, and a little warmer.",
    );

    expect(timingAndTonal.request_classification).toBe("supported");
    expect(restorationAndTonal.request_classification).toBe("supported");
    expect(loudnessAndTonal.request_classification).toBe("supported");
  });

  it("classifies ambiguous and unsupported prompt phrases explicitly", () => {
    const parsed = parseUserRequest("Make it hit harder and remove clicks.");

    expect(parsed.supported_but_underspecified_requests).toContain("hit harder");
    expect(parsed.unsupported_requests).toEqual([]);
    expect(parsed.wants_remove_clicks).toBe(true);
    expect(parsed.request_classification).toBe("supported_but_underspecified");
  });

  it("classifies runtime-only requests separately from unsupported ones", () => {
    const parsed = parseUserRequest("Add reverb and a little delay.");

    expect(parsed.supported_runtime_only_but_not_planner_enabled_requests).toEqual([
      "reverb",
      "delay",
    ]);
    expect(parsed.runtime_only_operations_requested).toEqual(["reverb", "delay"]);
    expect(parsed.request_classification).toBe("supported_runtime_only_but_not_planner_enabled");
  });

  it("does not treat mono-compatibility wording as a mono-sum request", () => {
    const parsed = parseUserRequest("Widen this slightly, but keep it mono compatible.");

    expect(parsed.wants_wider).toBe(true);
    expect(parsed.supported_runtime_only_but_not_planner_enabled_requests).toEqual([]);
    expect(parsed.request_classification).toBe("supported");
  });

  it("keeps underspecified classification ahead of runtime-only for mixed prompts", () => {
    const parsed = parseUserRequest("Make it better and add reverb.");

    expect(parsed.supported_but_underspecified_requests).toContain("make it better");
    expect(parsed.supported_runtime_only_but_not_planner_enabled_requests).toContain("reverb");
    expect(parsed.request_classification).toBe("supported_but_underspecified");
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

    expect(plan.steps.map((step) => step.operation)).toEqual(["notch_filter", "tilt_eq"]);
    expect(plan.steps[0]?.parameters).toEqual({ frequency_hz: 3750, q: 8 });
    expect(plan.steps[1]?.parameters).toEqual({
      pivot_frequency_hz: 1200,
      gain_db: -1.13,
      q: 0.6,
    });
    expect(plan.goals).toEqual([
      "reduce upper-mid harshness",
      "tilt the overall balance slightly darker",
      "preserve transient impact",
    ]);
    expect(plan.constraints).toContain("avoid reducing transient attack more than necessary");
    expect(plan.verification_targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_id: "target_reduce_harshness_high_band",
          goal: "reduce upper-mid harshness",
          kind: "analysis_metric",
          metric: "spectral_balance.high_band_db",
        }),
      ]),
    );
    expect(validateAgainstSchema(editPlanSchema, plan)).toBe(true);
  });

  it("handles the exact darker-and-less-harsh first-slice prompt", () => {
    const plan = planEdits({
      userRequest: "make this loop darker and less harsh",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createAnalysisReportFixture(),
      semanticProfile: createSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["notch_filter", "tilt_eq"]);
    expect(plan.steps[0]?.parameters).toEqual({ frequency_hz: 3750, q: 8 });
    expect(plan.steps[1]?.parameters).toEqual({
      pivot_frequency_hz: 1200,
      gain_db: -1.5,
      q: 0.6,
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
    expect(plan.steps[0]?.operation).toBe("notch_filter");
    expect(plan.steps[0]?.parameters).toEqual({ frequency_hz: 3750, q: 8 });
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
    expect(plan.steps[0]?.operation).toBe("tilt_eq");
    expect(plan.steps[0]?.parameters).toEqual({
      pivot_frequency_hz: 1200,
      gain_db: -1.5,
      q: 0.6,
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

  it("maps louder-and-more-even prompts to conservative loudness normalization", () => {
    const plan = planEdits({
      userRequest: "Normalize it a little louder.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createAnalysisReportFixture(),
      semanticProfile: createSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["normalize"]);
    expect(plan.steps[0]?.parameters).toEqual({
      mode: "integrated_lufs",
      target_integrated_lufs: -13.8,
      measured_integrated_lufs: -14.8,
      max_true_peak_dbtp: -1,
      measured_true_peak_dbtp: -1.1,
    });
    expect(plan.goals).toContain("normalize overall loudness conservatively");
    expect(plan.verification_targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_id: "target_normalize_integrated_lufs",
          goal: "normalize overall loudness conservatively",
          comparison: "within",
          metric: "levels.integrated_lufs",
        }),
        expect.objectContaining({
          target_id: "target_normalize_true_peak_ceiling",
          comparison: "at_most",
          metric: "levels.true_peak_dbtp",
        }),
      ]),
    );
  });

  it("rejects broad even-level requests that are not explicit normalization asks", () => {
    expect(() =>
      planEdits({
        userRequest: "Make it more even.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createSemanticProfileFixture(),
      }),
    ).toThrow(/could not derive an executable plan/i);
  });

  it("maps the surgical EQ prompt family to explicit shelf, notch, and tilt steps", () => {
    const plan = planEdits({
      userRequest: "Make this warmer and airier, take out the harsh ring, and make it brighter.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createAnalysisReportFixture(),
      semanticProfile: createSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual([
      "notch_filter",
      "tilt_eq",
      "low_shelf",
      "high_shelf",
    ]);
    expect(plan.steps[0]?.parameters).toEqual({ frequency_hz: 3750, q: 8 });
    expect(plan.steps[1]?.parameters).toEqual({
      pivot_frequency_hz: 1200,
      gain_db: 1.7,
      q: 0.6,
    });
    expect(plan.steps[2]?.parameters).toEqual({ frequency_hz: 180, gain_db: 1.5, q: 0.7 });
    expect(plan.steps[3]?.parameters).toEqual({ frequency_hz: 6500, gain_db: 1.5, q: 0.8 });
    expect(plan.goals).toContain("add a little low-band warmth");
    expect(plan.goals).toContain("add a little upper-band air");
  });

  it("maps explicit de-ess, declick, and dehum requests to conservative restoration steps", () => {
    const plan = planEdits({
      userRequest: "Tame the sibilance, remove clicks, and remove 60 Hz hum.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createRestorationAnalysisReportFixture({ clipped_sample_count: 14 }),
      semanticProfile: createRestorationSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["declick", "dehum", "de_esser"]);
    expect(plan.steps[0]?.parameters).toEqual({
      window_ms: 55,
      overlap_percent: 75,
      ar_order: 2,
      threshold: 2,
      burst_fusion: 2,
      method: "add",
    });
    expect(plan.steps[1]?.parameters).toEqual({
      fundamental_hz: 60,
      harmonics: 4,
      q: 18,
      mix: 1,
    });
    expect(plan.steps[2]?.parameters).toEqual({
      intensity: 0.4,
      max_reduction: 0.45,
      frequency_hz: 5500,
    });
    expect(plan.verification_targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_id: "target_reduce_click_activity",
          label: "reduce clipped-sample spike activity when direct click evidence is unavailable",
          metric: "artifacts.clipped_sample_count",
        }),
        expect.objectContaining({
          target_id: "target_reduce_hum_activity",
          target: {
            scope: "frequency_region",
            bands_hz: [60, 180],
          },
        }),
      ]),
    );
  });

  it("requires an explicit mains frequency for dehum requests", () => {
    expect(() =>
      planEdits({
        userRequest: "Remove hum.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createSemanticProfileFixture(),
      }),
    ).toThrow(/50 hz or 60 hz/i);
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
    expect(plan.verification_targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_id: "target_control_dynamics_range",
          goal: "make dynamics more controlled without over-compressing",
          metric: "dynamics.dynamic_range_db",
        }),
      ]),
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
      input_gain_db: 0,
      release_ms: 80,
      lookahead_ms: 5,
    });
    expect(plan.goals).toContain("control peak excursions conservatively");
  });

  it("maps the benchmarked loudness-and-control wording to the dedicated controlled-loudness path", () => {
    const analysisReport = {
      ...createAnalysisReportFixture(),
      measurements: {
        ...createAnalysisReportFixture().measurements,
        dynamics: {
          ...createAnalysisReportFixture().measurements.dynamics,
          dynamic_range_db: 8.8,
        },
        levels: {
          ...createAnalysisReportFixture().measurements.levels,
          true_peak_dbtp: -4,
        },
      },
    } satisfies AnalysisReport;

    const plan = planEdits({
      userRequest: "Make it louder and more controlled.",
      audioVersion: createAudioVersionFixture(),
      analysisReport,
      semanticProfile: createSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["compressor", "normalize"]);
    expect(plan.steps[0]?.parameters).toEqual({
      threshold_db: -19,
      ratio: 1.6,
      attack_ms: 28,
      release_ms: 135,
      knee_db: 4,
      makeup_gain_db: 0,
    });
    expect(plan.steps[1]?.parameters).toEqual({
      mode: "integrated_lufs",
      target_integrated_lufs: -13.7,
      max_true_peak_dbtp: -1.4,
    });
    expect(plan.goals).toEqual([
      "make dynamics more controlled without over-compressing",
      "increase output level conservatively",
    ]);
    expect(plan.constraints).toEqual(
      expect.arrayContaining([
        "avoid obvious pumping or over-compression",
        "prefer measured loudness staging over raw post-compression gain boosts",
        "respect measured peak headroom",
      ]),
    );
    expect(plan.verification_targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_id: "target_controlled_loudness_range",
          metric: "dynamics.dynamic_range_db",
        }),
        expect.objectContaining({
          target_id: "target_controlled_loudness_integrated_lufs",
          metric: "levels.integrated_lufs",
          threshold: 1,
        }),
        expect.objectContaining({
          target_id: "target_controlled_loudness_peak_guard",
          regression_kind: "peak_control_regression",
        }),
      ]),
    );
  });

  it("maps the benchmarked peak-control wording to a limiter with preserve-punch checks", () => {
    const plan = planEdits({
      userRequest: "Control the peaks without crushing it.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createAnalysisReportFixture(),
      semanticProfile: createSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["limiter"]);
    expect(plan.goals).toEqual([
      "control peak excursions conservatively",
      "preserve transient impact",
    ]);
  });

  it("keeps pure peak-control prompts from adding loudness-maximizing limiter gain on low-peak sources", () => {
    const analysisReport = {
      ...createAnalysisReportFixture(),
      measurements: {
        ...createAnalysisReportFixture().measurements,
        levels: {
          ...createAnalysisReportFixture().measurements.levels,
          true_peak_dbtp: -8,
        },
      },
    } satisfies AnalysisReport;

    const plan = planEdits({
      userRequest: "Control peaks with a limiter.",
      audioVersion: createAudioVersionFixture(),
      analysisReport,
      semanticProfile: createSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["limiter"]);
    expect(plan.steps[0]?.parameters).toEqual({
      ceiling_dbtp: -1,
      input_gain_db: 0,
      release_ms: 80,
      lookahead_ms: 5,
    });
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

  it("maps steady-noise prompts to a conservative denoise step", () => {
    const plan = planEdits({
      userRequest: "Reduce hiss a bit.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createNoisyAnalysisReportFixture(),
      semanticProfile: createNoisySemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["denoise"]);
    expect(plan.steps[0]?.parameters).toEqual({
      reduction_db: 4,
      noise_floor_dbfs: -50,
    });
    expect(plan.goals).toContain("reduce steady background noise conservatively");
    expect(plan.constraints).toContain("avoid obvious denoise artifacts or transient smearing");
    expect(plan.verification_targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_id: "target_reduce_noise_floor",
          goal: "reduce steady background noise conservatively",
          metric: "artifacts.noise_floor_dbfs",
        }),
      ]),
    );
    expect(validateAgainstSchema(editPlanSchema, plan)).toBe(true);
  });

  it("maps explicit width prompts to a conservative stereo-width step", () => {
    const plan = planEdits({
      userRequest: "Widen this slightly.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createNarrowStereoAnalysisReportFixture(),
      semanticProfile: createNeutralSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["stereo_width"]);
    expect(plan.steps[0]?.parameters).toEqual({ width_multiplier: 1.12 });
    expect(plan.goals).toContain("slightly increase stereo width");
    expect(plan.constraints).toContain("keep width changes subtle and preserve mono compatibility");
    expect(plan.verification_targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_id: "target_wider_stereo_width",
          goal: "slightly increase stereo width",
          metric: "stereo.width",
        }),
      ]),
    );
    expect(validateAgainstSchema(editPlanSchema, plan)).toBe(true);
  });

  it("maps explicit stereo-centering prompts to stereo-balance correction", () => {
    const plan = planEdits({
      userRequest: "Center this more.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createImbalancedStereoAnalysisReportFixture(),
      semanticProfile: createOffCenterSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["stereo_balance_correction"]);
    expect(plan.steps[0]?.parameters).toEqual({
      target_channel: "left",
      correction_db: 2.72,
    });
    expect(plan.goals).toContain("reduce left-right stereo imbalance conservatively");
    expect(plan.constraints).toContain(
      "center the image conservatively without collapsing stereo width",
    );
    expect(plan.verification_targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_id: "target_center_stereo_balance",
          metric: "derived.absolute_stereo_balance_db",
        }),
      ]),
    );
    expect(validateAgainstSchema(editPlanSchema, plan)).toBe(true);
  });

  it("maps explicit silence-trim prompts to trim_silence with boundary verification", () => {
    const plan = planEdits({
      userRequest: "Trim the silence at the beginning and end.",
      audioVersion: createTrimSilenceAudioVersionFixture(),
      analysisReport: createTrimSilenceAnalysisReportFixture(),
      semanticProfile: createVersionScopedNeutralSemanticProfile("ver_trimSilenceFixture"),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["trim_silence"]);
    expect(plan.steps[0]?.parameters).toEqual({
      threshold_dbfs: -50,
      trim_leading: true,
      trim_trailing: true,
      window_seconds: 0.02,
    });
    expect(plan.goals).toContain("trim leading and trailing boundary silence conservatively");
    expect(plan.constraints).toContain(
      "remove only boundary silence and avoid cutting into clearly active material",
    );
    expect(plan.verification_targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_id: "target_trim_leading_silence",
          metric: "derived.leading_silence_seconds",
        }),
        expect.objectContaining({
          target_id: "target_trim_trailing_silence",
          metric: "derived.trailing_silence_seconds",
        }),
        expect.objectContaining({
          target_id: "target_trim_silence_duration_reduction",
          metric: "derived.duration_seconds",
        }),
      ]),
    );
    expect(validateAgainstSchema(editPlanSchema, plan)).toBe(true);
  });

  it("maps conservative speed-up prompts to time_stretch with duration and pitch checks", () => {
    const plan = planEdits({
      userRequest: "Speed up by 10%.",
      workspaceRoot: repoRoot,
      audioVersion: createPitchedAudioVersionFixture(),
      analysisReport: createPitchedAnalysisReportFixture(),
      semanticProfile: createVersionScopedNeutralSemanticProfile("ver_pitchedTimingFixture"),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["time_stretch"]);
    expect(plan.steps[0]?.parameters).toEqual({ stretch_ratio: 0.9 });
    expect(plan.goals).toContain("shorten the clip duration while preserving pitch");
    expect(plan.constraints).toContain("preserve pitch while changing duration");
    expect(plan.verification_targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_id: "target_time_stretch_duration",
          metric: "derived.duration_seconds",
          threshold: 0.864,
        }),
        expect.objectContaining({
          target_id: "target_time_stretch_pitch_preservation",
          metric: "derived.pitch_center_hz",
        }),
      ]),
    );
    expect(validateAgainstSchema(editPlanSchema, plan)).toBe(true);
  });

  it("maps explicit pitch-up prompts to pitch_shift with semitone-grounded verification", () => {
    const plan = planEdits({
      userRequest: "Pitch up by 2 semitones.",
      workspaceRoot: repoRoot,
      audioVersion: createPitchedAudioVersionFixture(),
      analysisReport: createPitchedAnalysisReportFixture(),
      semanticProfile: createVersionScopedNeutralSemanticProfile("ver_pitchedTimingFixture"),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["pitch_shift"]);
    expect(plan.steps[0]?.parameters).toEqual({ semitones: 2 });
    expect(plan.goals).toContain("raise the pitch by 2 semitones");
    expect(plan.constraints).toContain("keep duration close to the original after pitch shifting");
    expect(plan.verification_targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_id: "target_pitch_shift_center",
          metric: "derived.pitch_center_hz",
        }),
        expect.objectContaining({
          target_id: "target_pitch_shift_duration_guard",
          metric: "derived.duration_seconds",
          threshold: 0.96,
        }),
      ]),
    );
    expect(validateAgainstSchema(editPlanSchema, plan)).toBe(true);
  });

  it("orders compound timing prompts explicitly and composes duration verification", () => {
    const plan = planEdits({
      userRequest:
        "Trim the silence at the beginning and end, speed up by 10%, pitch up by 2 semitones, and fade out 0.1 seconds.",
      workspaceRoot: repoRoot,
      audioVersion: createPitchedAudioVersionFixture(),
      analysisReport: createPitchedBoundarySilenceAnalysisReportFixture(),
      semanticProfile: createVersionScopedNeutralSemanticProfile("ver_pitchedTimingFixture"),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual([
      "trim_silence",
      "time_stretch",
      "pitch_shift",
      "fade",
    ]);
    expect(plan.steps[0]?.parameters).toEqual({
      threshold_dbfs: -50,
      trim_leading: true,
      trim_trailing: true,
      window_seconds: 0.02,
    });
    expect(plan.steps[1]?.parameters).toEqual({ stretch_ratio: 0.9 });
    expect(plan.steps[2]?.parameters).toEqual({ semitones: 2 });
    expect(plan.steps[3]?.parameters).toEqual({ fade_out_seconds: 0.1 });
    expect(plan.verification_targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_id: "target_time_stretch_duration",
          metric: "derived.duration_seconds",
          threshold: 0.72,
        }),
        expect.objectContaining({
          target_id: "target_pitch_shift_duration_guard",
          metric: "derived.duration_seconds",
          threshold: 0.72,
        }),
      ]),
    );
    expect(validateAgainstSchema(editPlanSchema, plan)).toBe(true);
  });

  it("orders compound restoration, tonal, dynamics, and stereo phases explicitly", () => {
    const plan = planEdits({
      userRequest:
        "Remove clicks, tame the sibilance, make it darker, make it more controlled, catch peaks, and center this more.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createImbalancedStereoAnalysisReportFixture(),
      semanticProfile: createOffCenterSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual([
      "declick",
      "de_esser",
      "tilt_eq",
      "compressor",
      "limiter",
      "stereo_balance_correction",
    ]);
  });

  it("supports timing-plus-restoration prompts when the requested moves do not conflict", () => {
    const plan = planEdits({
      userRequest: "Trim the silence at the beginning and end, then remove clicks.",
      audioVersion: createTrimSilenceAudioVersionFixture(),
      analysisReport: createTrimSilenceAnalysisReportFixture(),
      semanticProfile: createVersionScopedNeutralSemanticProfile("ver_trimSilenceFixture"),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["trim_silence", "declick"]);
  });

  it("supports loudness-control-plus-tonal prompts through the explicit phase order", () => {
    const plan = planEdits({
      userRequest: "Make it darker, louder, and more controlled.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createAnalysisReportFixture(),
      semanticProfile: createSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual([
      "tilt_eq",
      "compressor",
      "normalize",
    ]);
  });

  it("supports compatible restoration-plus-tonal prompts", () => {
    const plan = planEdits({
      userRequest: "Remove clicks and make it darker.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createRestorationAnalysisReportFixture({ clipped_sample_count: 14 }),
      semanticProfile: createRestorationSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["declick", "tilt_eq"]);
  });

  it("supports safe stereo-plus-stereo prompts by recentering before width changes", () => {
    const plan = planEdits({
      userRequest: "Center this more and widen it slightly.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createImbalancedStereoAnalysisReportFixture(),
      semanticProfile: createOffCenterSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual([
      "stereo_balance_correction",
      "stereo_width",
    ]);
  });

  it("supports safe stereo-plus-tonal prompts through separate planner phases", () => {
    const plan = planEdits({
      userRequest: "Make it darker and center this more.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createImbalancedStereoAnalysisReportFixture(),
      semanticProfile: createOffCenterSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual([
      "tilt_eq",
      "stereo_balance_correction",
    ]);
  });

  it("orders timing and tonal compounds explicitly", () => {
    const plan = planEdits({
      userRequest: "Speed it up by 10% and make it darker.",
      workspaceRoot: repoRoot,
      audioVersion: createPitchedAudioVersionFixture(),
      analysisReport: createPitchedAnalysisReportFixture(),
      semanticProfile: createVersionScopedNeutralSemanticProfile("ver_pitchedTimingFixture"),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["time_stretch", "tilt_eq"]);
  });

  it("orders restoration and tonal compounds explicitly", () => {
    const plan = planEdits({
      userRequest: "Clean up clicks and make it darker.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createRestorationAnalysisReportFixture({ clipped_sample_count: 14 }),
      semanticProfile: createRestorationSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["declick", "tilt_eq"]);
  });

  it("orders tonal shaping ahead of controlled loudness compounds explicitly", () => {
    const plan = planEdits({
      userRequest: "Make it louder, more controlled, and a little warmer.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createAnalysisReportFixture(),
      semanticProfile: createSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual([
      "low_shelf",
      "compressor",
      "normalize",
    ]);
  });

  it("fails instead of inventing unsupported behavior", () => {
    try {
      planEdits({
        userRequest: "Make it better.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createSemanticProfileFixture(),
      });
      throw new Error("Expected planEdits to throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(PlanningFailure);
      expect((error as PlanningFailure).failureClass).toBe("supported_but_underspecified");
      expect((error as Error).message).toMatch(/underspecified phrasing/i);
    }
  });

  it("supports explicit click cleanup instead of rejecting it as unsupported", () => {
    const plan = planEdits({
      userRequest: "Clean this sample up by removing clicks.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createAnalysisReportFixture(),
      semanticProfile: createSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["declick"]);
  });

  it("does not emit a positive click proxy target when clipped-sample evidence is unavailable", () => {
    const plan = planEdits({
      userRequest: "Remove clicks.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createRestorationAnalysisReportFixture({ clipped_sample_count: 0 }),
      semanticProfile: createRestorationSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual(["declick"]);
    expect(plan.verification_targets).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target_id: "target_reduce_click_activity" }),
      ]),
    );
    expect(plan.verification_targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_id: "target_reduce_click_no_regression",
          regression_kind: "increased_click_proxy",
        }),
      ]),
    );
  });

  it("does not auto-trigger hum or click restoration from generic cleanup wording", () => {
    expect(() =>
      planEdits({
        userRequest: "Clean this sample up a bit.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createRestorationAnalysisReportFixture({ clipped_sample_count: 12 }),
        semanticProfile: createRestorationSemanticProfileFixture(),
      }),
    ).toThrow(/only supports conservative tonal cleanup/i);
  });

  it("fails clearly for ambiguous dynamics language", () => {
    try {
      planEdits({
        userRequest: "Make it hit harder.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createSemanticProfileFixture(),
      });
      throw new Error("Expected planEdits to throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(PlanningFailure);
      expect((error as PlanningFailure).failureClass).toBe("supported_but_underspecified");
      expect((error as Error).message).toMatch(/underspecified phrasing/i);
    }
  });

  it("treats conservative interpreted ambiguity as a deterministic planning stop", () => {
    expect(() =>
      planEdits({
        userRequest: "Clean it.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createSemanticProfileFixture(),
        intentInterpretation: {
          normalizedRequest: "Clarify the cleanup target before planning.",
          requestClassification: "supported_but_underspecified",
          nextAction: "clarify",
          clarificationQuestion:
            "Do you want less hum, fewer clicks, less harshness, or lower steady noise?",
        },
      }),
    ).toThrow(/needs clarification/i);
  });

  it("accepts a best-effort interpreted request once it resolves to a supported planner-facing prompt", () => {
    const plan = planEdits({
      userRequest: "Make it brighter and darker.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createAnalysisReportFixture(),
      semanticProfile: createSemanticProfileFixture(),
      intentInterpretation: {
        normalizedRequest: "Make it darker.",
        requestClassification: "supported",
        nextAction: "plan",
        ambiguities: ["conflicting tonal directions"],
        groundingNotes: ["best_effort policy promoted alternate interpretation: Make it darker."],
      },
    });

    expect(plan.interpreted_user_request).toBe("Make it darker.");
    expect(plan.user_request).toBe("Make it brighter and darker.");
    expect(plan.steps.map((step) => step.operation)).toEqual(["tilt_eq"]);
  });

  it("fails clearly for runtime-only requests that are not planner-enabled", () => {
    try {
      planEdits({
        userRequest: "Add reverb and echo.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createSemanticProfileFixture(),
      });
      throw new Error("Expected planEdits to throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(PlanningFailure);
      expect((error as PlanningFailure).failureClass).toBe(
        "supported_runtime_only_but_not_planner_enabled",
      );
      expect((error as PlanningFailure).details.runtime_only_operations).toEqual([
        "reverb",
        "echo",
      ]);
    }
  });

  it("fails clearly for denoise requests without steady-noise evidence", () => {
    expect(() =>
      planEdits({
        userRequest: "Remove hiss.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createSemanticProfileFixture(),
      }),
    ).toThrow(/only supports conservative denoise when analysis indicates steady noise/i);
  });

  it("fails clearly for width requests that would overreach current stereo state", () => {
    expect(() =>
      planEdits({
        userRequest: "Make it wider.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createWideSemanticProfileFixture(),
      }),
    ).toThrow(/already reads as materially wide/i);
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

  it("supports safe stereo compounds that mix centering with width changes", () => {
    const plan = planEdits({
      userRequest: "Center this more and make it wider.",
      audioVersion: createAudioVersionFixture(),
      analysisReport: createImbalancedStereoAnalysisReportFixture(),
      semanticProfile: createOffCenterSemanticProfileFixture(),
    });

    expect(plan.steps.map((step) => step.operation)).toEqual([
      "stereo_balance_correction",
      "stereo_width",
    ]);
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

  it("fails clearly for compound prompts that mix explicit trim points with silence trimming", () => {
    expect(() =>
      planEdits({
        userRequest: "Trim from 0.2s to 1.2s and trim the silence at the beginning and end.",
        audioVersion: createTrimSilenceAudioVersionFixture(),
        analysisReport: createTrimSilenceAnalysisReportFixture(),
        semanticProfile: createVersionScopedNeutralSemanticProfile("ver_trimSilenceFixture"),
      }),
    ).toThrow(/explicit time-range trimming with automatic silence trimming/i);
  });

  it("fails clearly for louder-plus-peak-control prompts without explicit normalization", () => {
    expect(() =>
      planEdits({
        userRequest: "Make it louder and catch peaks.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createSemanticProfileFixture(),
      }),
    ).toThrow(/combines louder output with peak control/i);
  });

  it("fails clearly for brightening-plus-de-essing prompts that the planner cannot sequence safely", () => {
    expect(() =>
      planEdits({
        userRequest: "Add some air and tame the sibilance.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createAnalysisReportFixture(),
        semanticProfile: createSemanticProfileFixture(),
      }),
    ).toThrow(/upper-band brightening with sibilance reduction/i);
  });

  it("fails clearly for denoise-plus-brightening prompts that would risk cleanup artifacts", () => {
    expect(() =>
      planEdits({
        userRequest: "Reduce hiss and brighten it.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createNoisyAnalysisReportFixture(),
        semanticProfile: createNoisySemanticProfileFixture(),
      }),
    ).toThrow(/broadband denoise with upper-band brightening/i);
  });

  it("fails clearly for hum-removal-plus-warmth prompts that would fight in the low band", () => {
    expect(() =>
      planEdits({
        userRequest: "Remove 60 Hz hum and make it warmer.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createRestorationAnalysisReportFixture(),
        semanticProfile: createRestorationSemanticProfileFixture(),
      }),
    ).toThrow(/combines hum removal with added warmth/i);
  });

  it("fails clearly for stereo narrowing-plus-centering when the source is not wide enough", () => {
    expect(() =>
      planEdits({
        userRequest: "Narrow this slightly and center this more.",
        audioVersion: createAudioVersionFixture(),
        analysisReport: createNarrowImbalancedStereoAnalysisReportFixture(),
        semanticProfile: createOffCenterSemanticProfileFixture(),
      }),
    ).toThrow(/combines narrowing with stereo recentering/i);
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

  it("fails clearly for pitch-shift requests on material that does not read as pitched", () => {
    expect(() =>
      planEdits({
        userRequest: "Pitch up by 2 semitones.",
        workspaceRoot: repoRoot,
        audioVersion: createPitchedAudioVersionFixture(),
        analysisReport: {
          ...createPitchedAnalysisReportFixture(),
          source_character: {
            primary_class: "percussive",
            pitched: false,
            confidence: 0.82,
          },
        },
        semanticProfile: createVersionScopedNeutralSemanticProfile("ver_pitchedTimingFixture"),
      }),
    ).toThrow(/only enables conservative pitch shifting when the current source reads as pitched/i);
  });
});

function createAudioVersionFixture(): AudioVersion {
  return audioVersionExample as unknown as AudioVersion;
}

function createTrimSilenceAudioVersionFixture(): AudioVersion {
  return {
    ...createAudioVersionFixture(),
    version_id: "ver_trimSilenceFixture",
    audio: {
      ...createAudioVersionFixture().audio,
      storage_ref: "fixtures/audio/phase-1/request-cycle-trim-silence-source.wav",
      sample_rate_hz: 22050,
      channels: 1,
      duration_seconds: 1.04,
      frame_count: Math.round(1.04 * 22050),
      channel_layout: "mono",
    },
  };
}

function createPitchedAudioVersionFixture(): AudioVersion {
  return {
    ...createAudioVersionFixture(),
    version_id: "ver_pitchedTimingFixture",
    audio: {
      ...createAudioVersionFixture().audio,
      storage_ref: "fixtures/audio/phase-1/request-cycle-pitched-timing-source.wav",
      sample_rate_hz: 22050,
      channels: 1,
      duration_seconds: 0.96,
      frame_count: Math.round(0.96 * 22050),
      channel_layout: "mono",
    },
  };
}

function createAnalysisReportFixture(): AnalysisReport {
  return {
    ...(analysisExample as unknown as AnalysisReport),
    measurements: {
      ...(analysisExample.measurements as AnalysisReport["measurements"]),
      stereo: {
        ...(analysisExample.measurements.stereo as AnalysisReport["measurements"]["stereo"]),
        balance_db: 0,
      },
      artifacts: {
        ...(analysisExample.measurements.artifacts as AnalysisReport["measurements"]["artifacts"]),
        clipped_sample_count: 0,
      },
    },
    annotations: [
      {
        ...(analysisExample.annotations?.[0] as NonNullable<AnalysisReport["annotations"]>[number]),
        bands_hz: [3000, 4500],
      },
    ],
  };
}

function createTrimSilenceAnalysisReportFixture(): AnalysisReport {
  return {
    ...createAnalysisReportFixture(),
    version_id: "ver_trimSilenceFixture",
    measurements: {
      ...createAnalysisReportFixture().measurements,
      artifacts: {
        ...createAnalysisReportFixture().measurements.artifacts,
        noise_floor_dbfs: -60,
      },
    },
    segments: [
      { kind: "silence", start_seconds: 0, end_seconds: 0.14 },
      { kind: "active", start_seconds: 0.14, end_seconds: 0.86 },
      { kind: "silence", start_seconds: 0.86, end_seconds: 1.04 },
    ],
  };
}

function createPitchedAnalysisReportFixture(): AnalysisReport {
  return {
    ...createAnalysisReportFixture(),
    version_id: "ver_pitchedTimingFixture",
    source_character: {
      primary_class: "tonal",
      pitched: true,
      confidence: 0.91,
    },
    segments: [{ kind: "active", start_seconds: 0, end_seconds: 0.96 }],
  };
}

function createPitchedBoundarySilenceAnalysisReportFixture(): AnalysisReport {
  return {
    ...createPitchedAnalysisReportFixture(),
    measurements: {
      ...createPitchedAnalysisReportFixture().measurements,
      artifacts: {
        ...createPitchedAnalysisReportFixture().measurements.artifacts,
        noise_floor_dbfs: -60,
      },
    },
    segments: [
      { kind: "silence", start_seconds: 0, end_seconds: 0.08 },
      { kind: "active", start_seconds: 0.08, end_seconds: 0.88 },
      { kind: "silence", start_seconds: 0.88, end_seconds: 0.96 },
    ],
  };
}

function createSemanticProfileFixture(): SemanticProfile {
  return semanticExample as unknown as SemanticProfile;
}

function createNoisyAnalysisReportFixture(): AnalysisReport {
  return {
    ...createAnalysisReportFixture(),
    measurements: {
      ...createAnalysisReportFixture().measurements,
      artifacts: {
        ...createAnalysisReportFixture().measurements.artifacts,
        noise_floor_dbfs: -50,
      },
    },
    annotations: [
      {
        kind: "noise",
        start_seconds: 0,
        end_seconds: 4,
        severity: 0.6,
        evidence: "sustained broadband noise floor",
      },
    ],
  };
}

function createNarrowStereoAnalysisReportFixture(): AnalysisReport {
  return {
    ...createAnalysisReportFixture(),
    measurements: {
      ...createAnalysisReportFixture().measurements,
      stereo: {
        ...createAnalysisReportFixture().measurements.stereo,
        width: 0.18,
        correlation: 0.48,
        balance_db: 0.4,
      },
    },
    annotations: [],
  };
}

function createImbalancedStereoAnalysisReportFixture(): AnalysisReport {
  return {
    ...createAnalysisReportFixture(),
    measurements: {
      ...createAnalysisReportFixture().measurements,
      stereo: {
        ...createAnalysisReportFixture().measurements.stereo,
        width: 0.24,
        correlation: 0.72,
        balance_db: 3.2,
      },
    },
    annotations: [],
  };
}

function createNarrowImbalancedStereoAnalysisReportFixture(): AnalysisReport {
  return {
    ...createAnalysisReportFixture(),
    measurements: {
      ...createAnalysisReportFixture().measurements,
      stereo: {
        ...createAnalysisReportFixture().measurements.stereo,
        width: 0.18,
        correlation: 0.76,
        balance_db: 2.9,
      },
    },
    annotations: [],
  };
}

function createNoisySemanticProfileFixture(): SemanticProfile {
  return {
    ...createNeutralSemanticProfileFixture(),
    descriptors: [
      {
        label: "noisy",
        confidence: 0.74,
        evidence_refs: ["analysis_01HZX8C7J2V3M4N5P6Q7R8S9T0:annotations[0]"],
        rationale: "Sustained broadband noise evidence is present.",
      },
    ],
  };
}

function createNeutralSemanticProfileFixture(): SemanticProfile {
  return {
    ...createSemanticProfileFixture(),
    descriptors: [],
  };
}

function createVersionScopedNeutralSemanticProfile(versionId: string): SemanticProfile {
  return {
    ...createNeutralSemanticProfileFixture(),
    version_id: versionId,
  };
}

function createWideSemanticProfileFixture(): SemanticProfile {
  return {
    ...createNeutralSemanticProfileFixture(),
    descriptors: [
      {
        label: "wide",
        confidence: 0.78,
        evidence_refs: ["analysis_01HZX8C7J2V3M4N5P6Q7R8S9T0:measurements.stereo"],
        rationale: "Side energy is already materially present.",
      },
    ],
  };
}

function createOffCenterSemanticProfileFixture(): SemanticProfile {
  return {
    ...createNeutralSemanticProfileFixture(),
    descriptors: [
      {
        label: "off_center",
        confidence: 0.76,
        evidence_refs: ["analysis_01HZX8C7J2V3M4N5P6Q7R8S9T0:measurements.stereo"],
        rationale: "Left-right balance is materially offset from center.",
      },
    ],
  };
}

function createRestorationAnalysisReportFixture(options?: {
  clipped_sample_count?: number;
}): AnalysisReport {
  return {
    ...createAnalysisReportFixture(),
    measurements: {
      ...createAnalysisReportFixture().measurements,
      artifacts: {
        ...createAnalysisReportFixture().measurements.artifacts,
        clipped_sample_count: options?.clipped_sample_count ?? 0,
      },
    },
    annotations: [
      {
        kind: "hum",
        start_seconds: 0,
        end_seconds: 4,
        bands_hz: [60, 180],
        severity: 0.58,
        evidence: "steady mains-related energy persists near 60 Hz with harmonics",
      },
      {
        kind: "click",
        start_seconds: 1.2,
        end_seconds: 1.23,
        severity: 0.54,
        evidence: "short impulsive pop around 1.22 seconds",
      },
    ],
  };
}

function createRestorationSemanticProfileFixture(): SemanticProfile {
  return {
    ...createNeutralSemanticProfileFixture(),
    descriptors: [
      {
        label: "hum_present",
        confidence: 0.78,
        evidence_refs: ["analysis_01HZX8C7J2V3M4N5P6Q7R8S9T0:annotations[0]"],
        rationale: "Steady hum evidence is present.",
      },
      {
        label: "clicks_present",
        confidence: 0.74,
        evidence_refs: ["analysis_01HZX8C7J2V3M4N5P6Q7R8S9T0:annotations[1]"],
        rationale: "Short click evidence is present.",
      },
    ],
  };
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

const repoRoot = path.resolve(import.meta.dirname, "../../..");
