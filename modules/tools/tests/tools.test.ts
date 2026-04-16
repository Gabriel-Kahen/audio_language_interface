import { readFileSync } from "node:fs";
import { DEFAULT_NORMALIZATION_TARGET } from "@audio-language-interface/io";

import { describe, expect, it, vi } from "vitest";

import {
  describeTools,
  executeToolRequest,
  isValidToolResponse,
  type ToolsRuntime,
  validateToolRequestEnvelope,
} from "../src/index.js";
import type { ToolRequest, ToolResponse } from "../src/types.js";

const toolRequestExamplePath = new URL(
  "../../../contracts/examples/tool-request.json",
  import.meta.url,
);
const toolResponseExamplePath = new URL(
  "../../../contracts/examples/tool-response.json",
  import.meta.url,
);

function buildAudioVersion(versionId = "ver_candidate"): Record<string, unknown> {
  return {
    schema_version: "1.0.0",
    version_id: versionId,
    asset_id: "asset_example",
    lineage: {
      created_at: "2026-04-14T20:20:05Z",
      created_by: "modules/io",
      reason: "fixture",
    },
    audio: {
      storage_ref: "storage/audio/example.wav",
      sample_rate_hz: 44100,
      channels: 2,
      duration_seconds: 3,
      frame_count: 132300,
    },
    state: {
      is_original: true,
      is_preview: false,
    },
  };
}

function buildAudioAsset(): Record<string, unknown> {
  return {
    schema_version: "1.0.0",
    asset_id: "asset_example",
    display_name: "example.wav",
    source: {
      kind: "file",
      imported_at: "2026-04-14T20:20:04Z",
      uri: "file:///tmp/example.wav",
    },
    media: {
      container_format: "wav",
      codec: "pcm_s16le",
      sample_rate_hz: 44100,
      channels: 2,
      duration_seconds: 3,
    },
  };
}

function buildAnalysis(reportId: string, versionId: string): Record<string, unknown> {
  return {
    schema_version: "1.0.0",
    report_id: reportId,
    asset_id: "asset_example",
    version_id: versionId,
    generated_at: "2026-04-14T20:20:06Z",
    analyzer: {
      name: "baseline",
      version: "0.1.0",
    },
    summary: {
      plain_text: "Example analysis.",
    },
    measurements: {
      levels: {
        integrated_lufs: -14,
        true_peak_dbtp: -1,
      },
      dynamics: {
        crest_factor_db: 8,
        transient_density_per_second: 2,
      },
      spectral_balance: {
        low_band_db: -10,
        mid_band_db: -8,
        high_band_db: -12,
        spectral_centroid_hz: 1800,
      },
      stereo: {
        width: 0.7,
        correlation: 0.1,
      },
      artifacts: {
        clipping_detected: false,
        noise_floor_dbfs: -60,
      },
    },
  };
}

function buildSemanticProfile(reportId: string, versionId: string): Record<string, unknown> {
  return {
    schema_version: "1.0.0",
    profile_id: "semantic_example",
    analysis_report_id: reportId,
    asset_id: "asset_example",
    version_id: versionId,
    generated_at: "2026-04-14T20:20:12Z",
    descriptors: [
      {
        label: "bright",
        confidence: 0.81,
        evidence_refs: [`${reportId}:measurements.spectral_balance`],
        rationale:
          "High-band energy exceeds low-band energy and the spectral centroid is elevated.",
      },
      {
        label: "slightly_harsh",
        confidence: 0.72,
        evidence_refs: [`${reportId}:annotations[0]`],
        rationale: "Upper-mid buildup is present across the full loop.",
      },
    ],
    summary: {
      plain_text:
        "The loop reads as bright and somewhat aggressive, with mild upper-mid harshness.",
      caveats: ["Descriptor confidence may change after source-specific tuning."],
    },
    unresolved_terms: [],
  };
}

function buildRequest(overrides: Partial<ToolRequest>): ToolRequest {
  return {
    schema_version: "1.0.0",
    request_id: "toolreq_abc123",
    tool_name: "load_audio",
    arguments: {},
    requested_at: "2026-04-14T20:20:08Z",
    ...overrides,
  };
}

function createRuntimeOverrides(overrides: Partial<ToolsRuntime>): Partial<ToolsRuntime> {
  return overrides;
}

function buildEditPlan(versionId: string): Record<string, unknown> {
  return {
    schema_version: "1.0.0",
    plan_id: "plan_123",
    asset_id: "asset_example",
    version_id: versionId,
    user_request: "Trim the intro.",
    goals: ["trim intro"],
    created_at: "2026-04-14T20:20:07Z",
    steps: [
      {
        step_id: "step_trim_1",
        operation: "trim",
        target: { scope: "full_file" },
        parameters: {
          start_seconds: 0,
          end_seconds: 2.5,
        },
        expected_effects: ["trim intro"],
        safety_limits: ["preserve useful content"],
      },
    ],
  };
}

function buildSingleStepEditPlan(
  versionId: string,
  operation: string,
  parameters: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schema_version: "1.0.0",
    plan_id: "plan_123",
    asset_id: "asset_example",
    version_id: versionId,
    user_request: `Run ${operation}.`,
    goals: [`run ${operation}`],
    created_at: "2026-04-14T20:20:07Z",
    steps: [
      {
        step_id: "step_1",
        operation,
        target: { scope: "full_file" },
        parameters,
        expected_effects: ["apply requested transform"],
        safety_limits: ["stay within supported tool surface"],
      },
    ],
  };
}

function buildTransformRecord(
  inputVersionId: string,
  outputVersionId: string,
): Record<string, unknown> {
  return {
    schema_version: "1.0.0",
    record_id: "transform_123",
    plan_id: "plan_123",
    asset_id: "asset_example",
    input_version_id: inputVersionId,
    output_version_id: outputVersionId,
    started_at: "2026-04-14T20:20:07Z",
    finished_at: "2026-04-14T20:20:08Z",
    operations: [
      {
        operation: "trim",
        parameters: {
          start_seconds: 0,
          end_seconds: 2.5,
        },
        status: "applied",
      },
    ],
  };
}

describe("tools module", () => {
  it("validates the canonical ToolRequest example", () => {
    const payload = JSON.parse(readFileSync(toolRequestExamplePath, "utf8")) as unknown;
    const request = validateToolRequestEnvelope(payload);

    expect(request.tool_name).toBe("analyze_audio");
    expect(request.arguments.audio_version).toBeDefined();
  });

  it("keeps the canonical ToolResponse example envelope valid", () => {
    const payload = JSON.parse(readFileSync(toolResponseExamplePath, "utf8")) as ToolResponse;

    expect(isValidToolResponse(payload)).toBe(true);
    expect((payload.result?.report as Record<string, unknown>)?.report_id).toBe(
      "analysis_01HZX8C7J2V3M4N5P6Q7R8S9T0",
    );
  });

  it("describes the supported tool surface", () => {
    expect(describeTools()).toEqual([
      expect.objectContaining({
        name: "load_audio",
        error_codes: ["invalid_arguments", "invalid_result_contract", "handler_failed"],
      }),
      expect.objectContaining({
        name: "analyze_audio",
        error_codes: [
          "invalid_arguments",
          "provenance_mismatch",
          "invalid_result_contract",
          "handler_failed",
        ],
      }),
      expect.objectContaining({
        name: "plan_edits",
        backing_module: "planning",
        required_arguments: [
          "audio_version",
          "analysis_report",
          "semantic_profile",
          "user_request",
        ],
      }),
      expect.objectContaining({
        name: "apply_edit_plan",
        capabilities: {
          supported_operations: [
            "gain",
            "normalize",
            "trim",
            "fade",
            "pitch_shift",
            "parametric_eq",
            "high_pass_filter",
            "low_pass_filter",
            "compressor",
            "limiter",
            "time_stretch",
            "reverse",
            "mono_sum",
            "channel_swap",
            "stereo_balance_correction",
            "stereo_width",
            "denoise",
          ],
        },
      }),
      expect.objectContaining({ name: "render_preview" }),
      expect.objectContaining({ name: "compare_versions" }),
    ]);
  });

  it("returns a normalized error response for unknown tools", async () => {
    const response = await executeToolRequest(buildRequest({ tool_name: "summarize_audio" }), {
      workspaceRoot: "/tmp/workspace",
      now: () => new Date("2026-04-14T20:20:10Z"),
    });

    expect(response).toEqual({
      schema_version: "1.0.0",
      request_id: "toolreq_abc123",
      tool_name: "summarize_audio",
      status: "error",
      completed_at: "2026-04-14T20:20:10.000Z",
      error: {
        code: "unknown_tool",
        message: "Unknown tool 'summarize_audio'.",
        details: {
          available_tools: [
            "load_audio",
            "analyze_audio",
            "plan_edits",
            "apply_edit_plan",
            "render_preview",
            "compare_versions",
          ],
        },
      },
    } satisfies ToolResponse);
    expect(isValidToolResponse(response)).toBe(true);
  });

  it("routes load_audio requests through the injected runtime", async () => {
    const importAudioFromFile = vi.fn(async (_inputPath: string, _options?: unknown) => ({
      asset: buildAudioAsset(),
      version: buildAudioVersion("ver_example"),
      sourceMetadata: {
        containerFormat: "wav",
        codec: "pcm_s16le",
        sampleRateHz: 44100,
        channels: 2,
        durationSeconds: 3,
        frameCount: 132300,
      },
      materializedMetadata: {
        containerFormat: "wav",
        codec: "pcm_s16le",
        sampleRateHz: 44100,
        channels: 2,
        durationSeconds: 3,
        frameCount: 132300,
      },
      outputPath: "/tmp/workspace/storage/audio/ver_example.wav",
      normalized: false,
    }));

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "load_audio",
        arguments: {
          input_path: "fixtures/example.wav",
          output_directory: "storage/audio",
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          importAudioFromFile:
            importAudioFromFile as unknown as ToolsRuntime["importAudioFromFile"],
        }),
        now: () => new Date("2026-04-14T20:20:10Z"),
      },
    );

    expect(importAudioFromFile).toHaveBeenCalledWith("fixtures/example.wav", {
      workspaceRoot: "/tmp/workspace",
      outputDirectory: "storage/audio",
      normalizationTarget: DEFAULT_NORMALIZATION_TARGET,
    });
    expect(response.status).toBe("ok");
    expect(response.result?.output_path).toBe("/tmp/workspace/storage/audio/ver_example.wav");
    expect(isValidToolResponse(response)).toBe(true);
  });

  it("returns invalid_arguments when handler input is malformed", async () => {
    const response = await executeToolRequest(
      buildRequest({
        tool_name: "analyze_audio",
        arguments: {
          include_annotations: true,
        },
      }),
      { workspaceRoot: "/tmp/workspace" },
    );

    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("invalid_arguments");
    expect(isValidToolResponse(response)).toBe(true);
  });

  it("returns provenance_mismatch when analyze_audio request ids disagree with the payload", async () => {
    const analyzeAudioVersion = vi.fn();

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "analyze_audio",
        asset_id: "asset_other",
        arguments: {
          audio_version: buildAudioVersion("ver_candidate"),
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          analyzeAudioVersion:
            analyzeAudioVersion as unknown as ToolsRuntime["analyzeAudioVersion"],
        }),
      },
    );

    expect(analyzeAudioVersion).not.toHaveBeenCalled();
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("provenance_mismatch");
    expect(response.error?.details).toEqual({
      field: "request.asset_id",
      request_asset_id: "asset_other",
      argument_asset_id: "asset_example",
    });
  });

  it("routes plan_edits requests through the injected runtime", async () => {
    const planEdits = vi.fn(async (_options: unknown) => buildEditPlan("ver_candidate"));

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "plan_edits",
        asset_id: "asset_example",
        version_id: "ver_candidate",
        arguments: {
          audio_version: buildAudioVersion("ver_candidate"),
          analysis_report: buildAnalysis("analysis_candidate", "ver_candidate"),
          semantic_profile: buildSemanticProfile("analysis_candidate", "ver_candidate"),
          user_request: "Make it less harsh.",
          constraints: ["keep the vocal clear"],
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          planEdits: planEdits as unknown as ToolsRuntime["planEdits"],
        }),
      },
    );

    expect(planEdits).toHaveBeenCalledWith({
      userRequest: "Make it less harsh.",
      audioVersion: buildAudioVersion("ver_candidate"),
      analysisReport: buildAnalysis("analysis_candidate", "ver_candidate"),
      semanticProfile: buildSemanticProfile("analysis_candidate", "ver_candidate"),
      constraints: ["keep the vocal clear"],
    });
    expect(response.status).toBe("ok");
    expect(response.result?.edit_plan).toEqual(
      expect.objectContaining({
        plan_id: "plan_123",
        version_id: "ver_candidate",
      }),
    );
    expect(isValidToolResponse(response)).toBe(true);
  });

  it("rejects plan_edits request provenance mismatches before execution", async () => {
    const planEdits = vi.fn();

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "plan_edits",
        asset_id: "asset_other",
        arguments: {
          audio_version: buildAudioVersion("ver_candidate"),
          analysis_report: buildAnalysis("analysis_candidate", "ver_candidate"),
          semantic_profile: buildSemanticProfile("analysis_candidate", "ver_candidate"),
          user_request: "Make it less harsh.",
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          planEdits: planEdits as unknown as ToolsRuntime["planEdits"],
        }),
      },
    );

    expect(planEdits).not.toHaveBeenCalled();
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("provenance_mismatch");
    expect(response.error?.details).toEqual({
      field: "request.asset_id",
      request_asset_id: "asset_other",
      argument_asset_id: "asset_example",
    });
  });

  it("rejects malformed nested contract payloads before analyze_audio runs", async () => {
    const analyzeAudioVersion = vi.fn();

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "analyze_audio",
        arguments: {
          audio_version: {
            schema_version: "1.0.0",
            version_id: "not_a_version_id",
            asset_id: "asset_example",
            lineage: {
              created_at: "2026-04-14T20:20:05Z",
              created_by: "modules/io",
            },
            audio: {
              storage_ref: "storage/audio/example.wav",
              sample_rate_hz: 44100,
              channels: 2,
              duration_seconds: 3,
              frame_count: 132300,
            },
          },
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          analyzeAudioVersion:
            analyzeAudioVersion as unknown as ToolsRuntime["analyzeAudioVersion"],
        }),
      },
    );

    expect(analyzeAudioVersion).not.toHaveBeenCalled();
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("invalid_arguments");
    expect(response.error?.details?.field).toBe("arguments.audio_version");
  });

  it("rejects invalid canonical plan_edits outputs before returning success", async () => {
    const planEdits = vi.fn(async (_options: unknown) => ({
      plan_id: "plan_123",
    }));

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "plan_edits",
        asset_id: "asset_example",
        version_id: "ver_candidate",
        arguments: {
          audio_version: buildAudioVersion("ver_candidate"),
          analysis_report: buildAnalysis("analysis_candidate", "ver_candidate"),
          semantic_profile: buildSemanticProfile("analysis_candidate", "ver_candidate"),
          user_request: "Make it less harsh.",
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          planEdits: planEdits as unknown as ToolsRuntime["planEdits"],
        }),
      },
    );

    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("invalid_result_contract");
    expect(response.error?.message).toContain("result.edit_plan");
    expect(response.error?.details?.field).toBe("result.edit_plan");
  });

  it("surfaces handler warnings in normalized success responses", async () => {
    const applyEditPlan = vi.fn(async (_options: unknown) => ({
      outputVersion: buildAudioVersion("ver_output"),
      transformRecord: buildTransformRecord("ver_input", "ver_output"),
      commands: [
        {
          executable: "ffmpeg",
          args: ["-i", "input.wav"],
          outputPath: "/tmp/workspace/storage/audio/ver_output.wav",
        },
      ],
      warnings: ["ffmpeg warning"],
    }));

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "apply_edit_plan",
        asset_id: "asset_example",
        version_id: "ver_input",
        arguments: {
          audio_version: buildAudioVersion("ver_input"),
          edit_plan: buildEditPlan("ver_input"),
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          applyEditPlan: applyEditPlan as unknown as ToolsRuntime["applyEditPlan"],
        }),
      },
    );

    expect(response.status).toBe("ok");
    expect(response.warnings).toEqual(["ffmpeg warning"]);
    expect(response.result?.commands).toEqual([
      {
        executable: "ffmpeg",
        args: ["-i", "input.wav"],
        output_path: "/tmp/workspace/storage/audio/ver_output.wav",
      },
    ]);
  });

  it("allows supported Phase 2 dynamics operations through to transforms", async () => {
    const applyEditPlan = vi.fn(async (_options: unknown) => ({
      outputVersion: buildAudioVersion("ver_output"),
      transformRecord: {
        ...buildTransformRecord("ver_input", "ver_output"),
        operations: [
          {
            operation: "compressor",
            parameters: {
              threshold_db: -18,
              ratio: 2,
              attack_ms: 15,
              release_ms: 120,
            },
            status: "applied",
          },
        ],
      },
      commands: [],
      warnings: [],
    }));

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "apply_edit_plan",
        asset_id: "asset_example",
        version_id: "ver_input",
        arguments: {
          audio_version: buildAudioVersion("ver_input"),
          edit_plan: buildSingleStepEditPlan("ver_input", "compressor", {
            threshold_db: -18,
            ratio: 2,
            attack_ms: 15,
            release_ms: 120,
          }),
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          applyEditPlan: applyEditPlan as unknown as ToolsRuntime["applyEditPlan"],
        }),
      },
    );

    expect(applyEditPlan).toHaveBeenCalledOnce();
    expect(response.status).toBe("ok");
  });

  it("rejects mixed time_stretch parameter modes before execution", async () => {
    const applyEditPlan = vi.fn();

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "apply_edit_plan",
        asset_id: "asset_example",
        version_id: "ver_input",
        arguments: {
          audio_version: buildAudioVersion("ver_input"),
          edit_plan: buildSingleStepEditPlan("ver_input", "time_stretch", {
            stretch_ratio: 1.1,
            source_tempo_bpm: 120,
            target_tempo_bpm: 110,
          }),
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          applyEditPlan: applyEditPlan as unknown as ToolsRuntime["applyEditPlan"],
        }),
      },
    );

    expect(applyEditPlan).not.toHaveBeenCalled();
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("invalid_arguments");
    expect(response.error?.details).toMatchObject({
      field: "arguments.edit_plan",
    });
  });

  it("allows reverse plans through to transforms", async () => {
    const applyEditPlan = vi.fn(async (_options: unknown) => ({
      outputVersion: buildAudioVersion("ver_output"),
      transformRecord: {
        ...buildTransformRecord("ver_input", "ver_output"),
        operations: [
          {
            operation: "reverse",
            parameters: {},
            status: "applied",
          },
        ],
      },
      commands: [],
      warnings: [],
    }));

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "apply_edit_plan",
        asset_id: "asset_example",
        version_id: "ver_input",
        arguments: {
          audio_version: buildAudioVersion("ver_input"),
          edit_plan: buildSingleStepEditPlan("ver_input", "reverse", {}),
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          applyEditPlan: applyEditPlan as unknown as ToolsRuntime["applyEditPlan"],
        }),
      },
    );

    expect(applyEditPlan).toHaveBeenCalledOnce();
    expect(response.status).toBe("ok");
  });

  it("routes compare_versions and wraps the report", async () => {
    const compareVersions = vi.fn((_options: unknown) => ({
      schema_version: "1.0.0" as const,
      comparison_id: "compare_123",
      baseline: { ref_type: "version" as const, ref_id: "ver_base" },
      candidate: { ref_type: "version" as const, ref_id: "ver_candidate" },
      generated_at: "2026-04-14T20:20:09Z",
      metric_deltas: [],
      summary: { plain_text: "No material change." },
    }));

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "compare_versions",
        arguments: {
          baseline_version: buildAudioVersion("ver_base"),
          candidate_version: buildAudioVersion("ver_candidate"),
          baseline_analysis: buildAnalysis("analysis_base", "ver_base"),
          candidate_analysis: buildAnalysis("analysis_candidate", "ver_candidate"),
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          compareVersions: compareVersions as unknown as ToolsRuntime["compareVersions"],
        }),
      },
    );

    expect(compareVersions).toHaveBeenCalledOnce();
    expect(response.result?.comparison_report).toEqual(
      expect.objectContaining({ comparison_id: "compare_123" }),
    );
    expect(isValidToolResponse(response)).toBe(true);
  });

  it("rejects compare_versions requests with mismatched version and analysis provenance", async () => {
    const compareVersions = vi.fn();

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "compare_versions",
        arguments: {
          baseline_version: buildAudioVersion("ver_base"),
          candidate_version: buildAudioVersion("ver_candidate"),
          baseline_analysis: buildAnalysis("analysis_base", "ver_other"),
          candidate_analysis: buildAnalysis("analysis_candidate", "ver_candidate"),
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          compareVersions: compareVersions as unknown as ToolsRuntime["compareVersions"],
        }),
      },
    );

    expect(compareVersions).not.toHaveBeenCalled();
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("provenance_mismatch");
    expect(response.error?.details?.field).toBe("arguments.baseline_analysis");
  });

  it("rejects compare_versions edit_plan provenance that does not match the baseline version", async () => {
    const compareVersions = vi.fn();

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "compare_versions",
        arguments: {
          baseline_version: buildAudioVersion("ver_base"),
          candidate_version: buildAudioVersion("ver_candidate"),
          baseline_analysis: buildAnalysis("analysis_base", "ver_base"),
          candidate_analysis: buildAnalysis("analysis_candidate", "ver_candidate"),
          edit_plan: buildEditPlan("ver_other"),
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          compareVersions: compareVersions as unknown as ToolsRuntime["compareVersions"],
        }),
      },
    );

    expect(compareVersions).not.toHaveBeenCalled();
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("provenance_mismatch");
    expect(response.error?.details?.field).toBe("arguments.edit_plan.version_id");
  });

  it("rejects invalid canonical load_audio outputs before returning success", async () => {
    const importAudioFromFile = vi.fn(async (_inputPath: string, _options?: unknown) => ({
      asset: { asset_id: "asset_example" },
      version: buildAudioVersion("ver_example"),
      sourceMetadata: {
        containerFormat: "wav",
        codec: "pcm_s16le",
        sampleRateHz: 44100,
        channels: 2,
        durationSeconds: 3,
        frameCount: 132300,
      },
      materializedMetadata: {
        containerFormat: "wav",
        codec: "pcm_s16le",
        sampleRateHz: 44100,
        channels: 2,
        durationSeconds: 3,
        frameCount: 132300,
      },
      outputPath: "/tmp/workspace/storage/audio/ver_example.wav",
      normalized: false,
    }));

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "load_audio",
        arguments: {
          input_path: "fixtures/example.wav",
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          importAudioFromFile:
            importAudioFromFile as unknown as ToolsRuntime["importAudioFromFile"],
        }),
      },
    );

    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("invalid_result_contract");
    expect(response.error?.message).toContain("result.asset");
    expect(response.error?.details?.field).toBe("result.asset");
  });

  it("rejects invalid canonical apply_edit_plan outputs before returning success", async () => {
    const applyEditPlan = vi.fn(async (_options: unknown) => ({
      outputVersion: buildAudioVersion("ver_output"),
      transformRecord: {
        record_id: "transform_123",
      },
      commands: [],
      warnings: [],
    }));

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "apply_edit_plan",
        asset_id: "asset_example",
        version_id: "ver_input",
        arguments: {
          audio_version: buildAudioVersion("ver_input"),
          edit_plan: buildEditPlan("ver_input"),
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          applyEditPlan: applyEditPlan as unknown as ToolsRuntime["applyEditPlan"],
        }),
      },
    );

    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("invalid_result_contract");
    expect(response.error?.message).toContain("result.transform_record");
    expect(response.error?.details?.field).toBe("result.transform_record");
  });

  it("rejects invalid canonical render_preview outputs before returning success", async () => {
    const renderPreview = vi.fn(async (_options: unknown) => ({
      artifact: {
        render_id: "render_123",
      },
      command: {
        executable: "ffmpeg",
        args: ["-i", "input.wav"],
        outputPath: "/tmp/workspace/renders/render_123.mp3",
      },
    }));

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "render_preview",
        asset_id: "asset_example",
        version_id: "ver_candidate",
        arguments: {
          audio_version: buildAudioVersion("ver_candidate"),
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          renderPreview: renderPreview as unknown as ToolsRuntime["renderPreview"],
        }),
      },
    );

    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("invalid_result_contract");
    expect(response.error?.message).toContain("result.artifact");
    expect(response.error?.details?.field).toBe("result.artifact");
  });

  it("rejects invalid canonical compare_versions outputs before returning success", async () => {
    const compareVersions = vi.fn((_options: unknown) => ({
      comparison_id: "compare_123",
    }));

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "compare_versions",
        arguments: {
          baseline_version: buildAudioVersion("ver_base"),
          candidate_version: buildAudioVersion("ver_candidate"),
          baseline_analysis: buildAnalysis("analysis_base", "ver_base"),
          candidate_analysis: buildAnalysis("analysis_candidate", "ver_candidate"),
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          compareVersions: compareVersions as unknown as ToolsRuntime["compareVersions"],
        }),
      },
    );

    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("invalid_result_contract");
    expect(response.error?.message).toContain("result.comparison_report");
    expect(response.error?.details?.field).toBe("result.comparison_report");
  });

  it("allows supported stereo width and denoise steps through to transforms", async () => {
    const applyEditPlan = vi.fn(async (_options: unknown) => ({
      outputVersion: buildAudioVersion("ver_output"),
      transformRecord: {
        ...buildTransformRecord("ver_input", "ver_output"),
        operations: [
          {
            operation: "denoise",
            parameters: {
              reduction_db: 6,
              noise_floor_dbfs: -58,
            },
            status: "applied",
          },
          {
            operation: "stereo_width",
            parameters: {
              width_multiplier: 1.15,
            },
            status: "applied",
          },
        ],
      },
      commands: [],
      warnings: [],
    }));

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "apply_edit_plan",
        asset_id: "asset_example",
        version_id: "ver_input",
        arguments: {
          audio_version: buildAudioVersion("ver_input"),
          edit_plan: {
            schema_version: "1.0.0",
            plan_id: "plan_123",
            asset_id: "asset_example",
            version_id: "ver_input",
            user_request: "Denoise and widen this.",
            goals: ["reduce noise", "widen stereo image"],
            created_at: "2026-04-14T20:20:07Z",
            steps: [
              {
                step_id: "step_1",
                operation: "denoise",
                target: { scope: "full_file" },
                parameters: {
                  reduction_db: 6,
                  noise_floor_dbfs: -58,
                },
                expected_effects: ["reduce steady noise"],
                safety_limits: ["avoid artifacts"],
              },
              {
                step_id: "step_2",
                operation: "stereo_width",
                target: { scope: "full_file" },
                parameters: {
                  width_multiplier: 1.15,
                },
                expected_effects: ["widen image"],
                safety_limits: ["avoid phase issues"],
              },
            ],
          },
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          applyEditPlan: applyEditPlan as unknown as ToolsRuntime["applyEditPlan"],
        }),
      },
    );

    expect(applyEditPlan).toHaveBeenCalledOnce();
    expect(response.status).toBe("ok");
  });

  it("rejects stereo width plans on non-stereo audio before execution", async () => {
    const applyEditPlan = vi.fn();

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "apply_edit_plan",
        asset_id: "asset_example",
        version_id: "ver_input",
        arguments: {
          audio_version: {
            ...buildAudioVersion("ver_input"),
            audio: {
              ...((buildAudioVersion("ver_input").audio as Record<string, unknown>) ?? {}),
              channels: 1,
            },
          },
          edit_plan: buildSingleStepEditPlan("ver_input", "stereo_width", {
            width_multiplier: 1.1,
          }),
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          applyEditPlan: applyEditPlan as unknown as ToolsRuntime["applyEditPlan"],
        }),
      },
    );

    expect(applyEditPlan).not.toHaveBeenCalled();
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("invalid_arguments");
    expect(response.error?.details).toMatchObject({
      field: "arguments.edit_plan.steps[0].operation",
      operation: "stereo_width",
      required_channels: 2,
      received_channels: 1,
    });
  });

  it("rejects channel_swap plans on non-stereo audio before execution", async () => {
    const applyEditPlan = vi.fn();

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "apply_edit_plan",
        asset_id: "asset_example",
        version_id: "ver_input",
        arguments: {
          audio_version: {
            ...buildAudioVersion("ver_input"),
            audio: {
              ...((buildAudioVersion("ver_input").audio as Record<string, unknown>) ?? {}),
              channels: 1,
            },
          },
          edit_plan: buildSingleStepEditPlan("ver_input", "channel_swap", {}),
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          applyEditPlan: applyEditPlan as unknown as ToolsRuntime["applyEditPlan"],
        }),
      },
    );

    expect(applyEditPlan).not.toHaveBeenCalled();
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("invalid_arguments");
    expect(response.error?.details).toMatchObject({
      field: "arguments.edit_plan.steps[0].operation",
      operation: "channel_swap",
      required_channels: 2,
      received_channels: 1,
    });
  });

  it("rejects stereo-only steps after mono_sum using the simulated post-step channel state", async () => {
    const applyEditPlan = vi.fn();

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "apply_edit_plan",
        asset_id: "asset_example",
        version_id: "ver_input",
        arguments: {
          audio_version: buildAudioVersion("ver_input"),
          edit_plan: {
            schema_version: "1.0.0",
            plan_id: "plan_123",
            asset_id: "asset_example",
            version_id: "ver_input",
            user_request: "Collapse to mono and then widen it.",
            goals: ["collapse to mono", "widen image"],
            created_at: "2026-04-14T20:20:07Z",
            steps: [
              {
                step_id: "step_1",
                operation: "mono_sum",
                target: { scope: "full_file" },
                parameters: {},
                expected_effects: ["collapse image"],
                safety_limits: ["stay explicit"],
              },
              {
                step_id: "step_2",
                operation: "stereo_width",
                target: { scope: "full_file" },
                parameters: { width_multiplier: 1.1 },
                expected_effects: ["widen image"],
                safety_limits: ["stay explicit"],
              },
            ],
          },
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          applyEditPlan: applyEditPlan as unknown as ToolsRuntime["applyEditPlan"],
        }),
      },
    );

    expect(applyEditPlan).not.toHaveBeenCalled();
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("invalid_arguments");
    expect(response.error?.details).toMatchObject({
      field: "arguments.edit_plan.steps[1].operation",
      operation: "stereo_width",
      required_channels: 2,
      received_channels: 1,
    });
  });

  it("rejects Phase 2 transforms with non-full-file targets before execution", async () => {
    const applyEditPlan = vi.fn();

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "apply_edit_plan",
        asset_id: "asset_example",
        version_id: "ver_input",
        arguments: {
          audio_version: buildAudioVersion("ver_input"),
          edit_plan: {
            schema_version: "1.0.0",
            plan_id: "plan_123",
            asset_id: "asset_example",
            version_id: "ver_input",
            user_request: "Widen the left side only.",
            goals: ["widen the left side"],
            created_at: "2026-04-14T20:20:07Z",
            steps: [
              {
                step_id: "step_1",
                operation: "stereo_width",
                target: { scope: "channel", channel: "left" },
                parameters: { width_multiplier: 1.1 },
                expected_effects: ["widen image"],
                safety_limits: ["stay explicit"],
              },
            ],
          },
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          applyEditPlan: applyEditPlan as unknown as ToolsRuntime["applyEditPlan"],
        }),
      },
    );

    expect(applyEditPlan).not.toHaveBeenCalled();
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("invalid_arguments");
    expect(response.error?.details).toMatchObject({
      field: "arguments.edit_plan",
    });
  });

  it("allows published pitch shift operations through to transforms", async () => {
    const applyEditPlan = vi.fn(async (_options: unknown) => ({
      outputVersion: buildAudioVersion("ver_output"),
      transformRecord: {
        ...buildTransformRecord("ver_input", "ver_output"),
        operations: [
          {
            operation: "pitch_shift",
            parameters: {
              semitones: 2,
              pitch_ratio: 1.122449,
              asetrate_hz: 49500,
              tempo_ratio: 0.890909,
              atempo_factors: [0.890909],
            },
            status: "applied",
          },
        ],
      },
      commands: [],
      warnings: [],
    }));

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "apply_edit_plan",
        asset_id: "asset_example",
        version_id: "ver_input",
        arguments: {
          audio_version: buildAudioVersion("ver_input"),
          edit_plan: buildSingleStepEditPlan("ver_input", "pitch_shift", {
            semitones: 2,
          }),
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          applyEditPlan: applyEditPlan as unknown as ToolsRuntime["applyEditPlan"],
        }),
      },
    );

    expect(applyEditPlan).toHaveBeenCalledOnce();
    expect(response.status).toBe("ok");
  });

  it("rejects non-integer preview sample rates and channels", async () => {
    const renderPreview = vi.fn();

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "render_preview",
        asset_id: "asset_example",
        version_id: "ver_candidate",
        arguments: {
          audio_version: buildAudioVersion("ver_candidate"),
          sample_rate_hz: 44100.5,
          channels: 2.5,
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          renderPreview: renderPreview as unknown as ToolsRuntime["renderPreview"],
        }),
      },
    );

    expect(renderPreview).not.toHaveBeenCalled();
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("invalid_arguments");
    expect(response.error?.details?.field).toBe("arguments.sample_rate_hz");
  });

  it("returns provenance_mismatch when render_preview request version_id disagrees with the payload", async () => {
    const renderPreview = vi.fn();

    const response = await executeToolRequest(
      buildRequest({
        tool_name: "render_preview",
        asset_id: "asset_example",
        version_id: "ver_other",
        arguments: {
          audio_version: buildAudioVersion("ver_candidate"),
        },
      }),
      {
        workspaceRoot: "/tmp/workspace",
        runtime: createRuntimeOverrides({
          renderPreview: renderPreview as unknown as ToolsRuntime["renderPreview"],
        }),
      },
    );

    expect(renderPreview).not.toHaveBeenCalled();
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("provenance_mismatch");
    expect(response.error?.details).toEqual({
      field: "request.version_id",
      request_version_id: "ver_other",
      argument_version_id: "ver_candidate",
    });
  });
});
