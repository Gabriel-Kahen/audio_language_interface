import { readFileSync } from "node:fs";

import {
  createSessionGraph,
  recordAudioAsset,
  recordAudioVersion,
  type SessionGraph,
} from "@audio-language-interface/history";
import {
  OrchestrationStageError,
  type RequestCycleResult,
} from "@audio-language-interface/orchestration";
import { describe, expect, it, vi } from "vitest";
import { ToolInputError } from "../src/errors.js";
import { describeTools, executeToolRequest, type ToolsRuntime } from "../src/index.js";
import type { ToolRequest } from "../src/types.js";

const repoRoot = new URL("../../..", import.meta.url);

function readExample<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, repoRoot), "utf8")) as T;
}

function buildAudioAsset() {
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
  } as const;
}

function buildAudioVersion(versionId: string, parentVersionId?: string) {
  return {
    schema_version: "1.0.0",
    version_id: versionId,
    asset_id: "asset_example",
    ...(parentVersionId === undefined ? {} : { parent_version_id: parentVersionId }),
    lineage: {
      created_at: "2026-04-14T20:20:05Z",
      created_by: "modules/io",
      reason: "fixture",
    },
    audio: {
      storage_ref: `storage/audio/${versionId}.wav`,
      sample_rate_hz: 44100,
      channels: 2,
      duration_seconds: 3,
      frame_count: 132300,
    },
    state: {
      is_original: parentVersionId === undefined,
      is_preview: false,
    },
  };
}

function buildAnalysis(reportId: string, versionId: string) {
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
        balance_db: 0,
      },
      artifacts: {
        clipping_detected: false,
        noise_floor_dbfs: -60,
        clipped_sample_count: 0,
        hum_detected: false,
        hum_harmonic_count: 0,
        click_detected: false,
        click_count: 0,
        click_rate_per_second: 0,
      },
    },
  };
}

function buildSessionGraph(
  asset: ReturnType<typeof buildAudioAsset>,
  versions: ReturnType<typeof buildAudioVersion>[],
): SessionGraph {
  const [activeVersion] = versions.slice(-1);
  if (!activeVersion) {
    throw new Error("Expected at least one version to build a SessionGraph test fixture.");
  }

  let sessionGraph = createSessionGraph({
    session_id: "session_example",
    created_at: activeVersion.lineage.created_at,
    active_refs: {
      asset_id: asset.asset_id,
      version_id: activeVersion.version_id,
    },
  });

  sessionGraph = recordAudioAsset(sessionGraph, asset);
  for (const version of versions) {
    sessionGraph = recordAudioVersion(sessionGraph, version);
  }
  return sessionGraph;
}

function buildRequest(overrides: Partial<ToolRequest>): ToolRequest {
  return {
    schema_version: "1.0.0",
    request_id: "toolreq_runrequestcycle123",
    tool_name: "run_request_cycle",
    arguments: {},
    requested_at: "2026-04-21T20:20:08Z",
    ...overrides,
  };
}

function buildRequestCycleResult(): RequestCycleResult {
  const asset = buildAudioAsset();
  const inputVersion = buildAudioVersion("ver_input");
  const outputVersion = buildAudioVersion("ver_output", inputVersion.version_id);
  const inputAnalysis = buildAnalysis("analysis_input", inputVersion.version_id);
  const outputAnalysis = buildAnalysis("analysis_output", outputVersion.version_id);
  const semanticProfile = readExample<Record<string, unknown>>(
    "contracts/examples/semantic-profile.json",
  );
  const editPlan = readExample<Record<string, unknown>>("contracts/examples/edit-plan.json");
  const transformRecord = readExample<Record<string, unknown>>(
    "contracts/examples/transform-record.json",
  );
  const renderArtifact = readExample<Record<string, unknown>>(
    "contracts/examples/render-artifact.json",
  );
  const comparisonReport = readExample<Record<string, unknown>>(
    "contracts/examples/comparison-report.json",
  );
  const sessionGraph = buildSessionGraph(asset, [inputVersion, outputVersion]);

  return {
    result_kind: "applied",
    asset: asset as unknown as RequestCycleResult["asset"],
    inputVersion: inputVersion as unknown as RequestCycleResult["inputVersion"],
    inputAnalysis: inputAnalysis as unknown as RequestCycleResult["inputAnalysis"],
    followUpResolution: {
      kind: "apply",
      resolvedUserRequest: "Make it darker.",
      source: "try_another_version",
      inputVersionId: inputVersion.version_id,
      branchId: "branch_alt_example_1",
    },
    iterations: [
      {
        iteration: 1,
        inputVersion: inputVersion as unknown as RequestCycleResult["inputVersion"],
        outputVersion: outputVersion as unknown as RequestCycleResult["outputVersion"],
        inputAnalysis: inputAnalysis as unknown as RequestCycleResult["inputAnalysis"],
        outputAnalysis: outputAnalysis as unknown as RequestCycleResult["outputAnalysis"],
        semanticProfile: semanticProfile as unknown as NonNullable<
          RequestCycleResult["semanticProfile"]
        >,
        intentInterpretation: {
          schema_version: "1.0.0",
          interpretation_id: "interpret_cycle123",
          asset_id: asset.asset_id,
          version_id: inputVersion.version_id,
          analysis_report_id: "analysis_input",
          semantic_profile_id: String(
            (semanticProfile as Record<string, unknown>).profile_id ?? "semantic_profile_id",
          ),
          user_request: "Make it darker.",
          normalized_request: "Make it darker with a gentle high-shelf cut.",
          request_classification: "supported",
          normalized_objectives: ["darker"],
          candidate_descriptors: ["dark"],
          rationale: "Make the tonal move explicit without bypassing deterministic planning.",
          confidence: 0.72,
          provider: {
            kind: "openai",
            model: "gpt-5-mini",
            prompt_version: "intent_v1",
          },
          generated_at: "2026-04-21T20:25:00Z",
        },
        editPlan: editPlan as unknown as NonNullable<RequestCycleResult["editPlan"]>,
        comparisonReport:
          comparisonReport as unknown as RequestCycleResult["versionComparisonReport"],
        transformResult: {
          outputVersion: outputVersion as unknown as RequestCycleResult["outputVersion"],
          transformRecord: transformRecord as unknown as NonNullable<
            RequestCycleResult["transformResult"]
          >["transformRecord"],
          commands: [
            {
              executable: "ffmpeg",
              args: ["-i", "input.wav", "output.wav"],
              outputPath: "output.wav",
            },
          ],
          warnings: [],
        },
      },
    ],
    revision: {
      shouldRevise: false,
      rationale: "Initial pass satisfied the request.",
      source: "default_policy",
    },
    semanticProfile: semanticProfile as unknown as NonNullable<
      RequestCycleResult["semanticProfile"]
    >,
    intentInterpretation: {
      schema_version: "1.0.0",
      interpretation_id: "interpret_cycle123",
      asset_id: asset.asset_id,
      version_id: inputVersion.version_id,
      analysis_report_id: "analysis_input",
      semantic_profile_id: String(
        (semanticProfile as Record<string, unknown>).profile_id ?? "semantic_profile_id",
      ),
      user_request: "Make it darker.",
      normalized_request: "Make it darker with a gentle high-shelf cut.",
      request_classification: "supported",
      normalized_objectives: ["darker"],
      candidate_descriptors: ["dark"],
      rationale: "Make the tonal move explicit without bypassing deterministic planning.",
      confidence: 0.72,
      provider: {
        kind: "openai",
        model: "gpt-5-mini",
        prompt_version: "intent_v1",
      },
      generated_at: "2026-04-21T20:25:00Z",
    },
    editPlan: editPlan as unknown as NonNullable<RequestCycleResult["editPlan"]>,
    outputVersion: outputVersion as unknown as RequestCycleResult["outputVersion"],
    transformResult: {
      outputVersion: outputVersion as unknown as RequestCycleResult["outputVersion"],
      transformRecord: transformRecord as unknown as NonNullable<
        RequestCycleResult["transformResult"]
      >["transformRecord"],
      commands: [
        {
          executable: "ffmpeg",
          args: ["-i", "input.wav", "output.wav"],
          outputPath: "output.wav",
        },
      ],
      warnings: [],
    },
    outputAnalysis: outputAnalysis as unknown as RequestCycleResult["outputAnalysis"],
    versionComparisonReport:
      comparisonReport as unknown as RequestCycleResult["versionComparisonReport"],
    baselineRender: renderArtifact as unknown as RequestCycleResult["baselineRender"],
    candidateRender: renderArtifact as unknown as RequestCycleResult["candidateRender"],
    renderComparisonReport:
      comparisonReport as unknown as RequestCycleResult["renderComparisonReport"],
    comparisonReport: comparisonReport as unknown as RequestCycleResult["comparisonReport"],
    sessionGraph,
    trace: [
      {
        stage: "resolve_follow_up",
        status: "ok",
        started_at: "2026-04-21T20:20:00Z",
        completed_at: "2026-04-21T20:20:00Z",
        attempts: 1,
      },
      {
        stage: "compare",
        status: "ok",
        started_at: "2026-04-21T20:20:01Z",
        completed_at: "2026-04-21T20:20:02Z",
        attempts: 1,
      },
    ],
  };
}

describe("run_request_cycle tool", () => {
  it("appears in the published tool surface", () => {
    expect(describeTools()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "run_request_cycle",
          backing_module: "orchestration",
          optional_arguments: expect.arrayContaining(["interpretation"]),
        }),
      ]),
    );
  });

  it("routes existing-input follow-up requests through orchestration and exposes session-aware results", async () => {
    const asset = buildAudioAsset();
    const baselineVersion = buildAudioVersion("ver_base");
    const currentVersion = buildAudioVersion("ver_current", baselineVersion.version_id);
    const sessionGraph = buildSessionGraph(asset, [baselineVersion, currentVersion]);
    const requestCycleResult = buildRequestCycleResult();
    const runRequestCycle = vi.fn().mockResolvedValue(requestCycleResult);

    const response = await executeToolRequest(
      buildRequest({
        session_id: sessionGraph.session_id,
        asset_id: asset.asset_id,
        version_id: currentVersion.version_id,
        arguments: {
          user_request: "try another version",
          input: {
            kind: "existing",
            asset,
            audio_version: currentVersion,
            session_graph: sessionGraph,
            available_versions: [baselineVersion],
          },
          revision: {
            enabled: true,
          },
        },
      }),
      {
        workspaceRoot: "/tmp/ali-tools",
        runtime: { runRequestCycle } satisfies Partial<ToolsRuntime>,
      },
    );

    expect(response.status).toBe("ok");
    expect(response.result?.follow_up_resolution).toMatchObject({
      kind: "apply",
      source: "try_another_version",
      branch_id: "branch_alt_example_1",
      input_version_id: "ver_input",
    });
    expect(response.result?.session_graph).toBeDefined();
    expect(response.result?.trace).toEqual(expect.any(Array));

    expect(runRequestCycle).toHaveBeenCalledTimes(1);
    const [call] = runRequestCycle.mock.calls;
    expect(call?.[0]?.sessionId).toBe(sessionGraph.session_id);
    expect(call?.[0]?.input).toMatchObject({
      kind: "existing",
      asset,
      version: currentVersion,
      sessionGraph,
    });
    await expect(
      call?.[0]?.dependencies.getAudioVersionById({
        asset,
        sessionGraph,
        versionId: baselineVersion.version_id,
      }),
    ).resolves.toEqual(baselineVersion);
  });

  it("forwards interpretation config into orchestration and exposes explicit interpretation artifacts", async () => {
    const asset = buildAudioAsset();
    const currentVersion = buildAudioVersion("ver_current");
    const sessionGraph = buildSessionGraph(asset, [currentVersion]);
    const requestCycleResult = buildRequestCycleResult();
    const runRequestCycle = vi.fn().mockImplementation(async (options) => {
      expect(options.interpretation).toMatchObject({
        mode: "llm_assisted",
        apiKey: "test-key",
        provider: {
          kind: "openai",
          model: "gpt-5-mini",
          temperature: 0.2,
          apiBaseUrl: "http://localhost:11434/v1",
        },
      });
      expect(options.dependencies.interpretRequest).toEqual(expect.any(Function));
      return requestCycleResult;
    });

    const response = await executeToolRequest(
      buildRequest({
        session_id: sessionGraph.session_id,
        asset_id: asset.asset_id,
        version_id: currentVersion.version_id,
        arguments: {
          user_request: "Make it darker.",
          interpretation: {
            mode: "llm_assisted",
            api_key: "test-key",
            prompt_version: "intent_v1",
            provider: {
              kind: "openai",
              model: "gpt-5-mini",
              temperature: 0.2,
              api_base_url: "http://localhost:11434/v1",
            },
          },
          input: {
            kind: "existing",
            asset,
            audio_version: currentVersion,
            session_graph: sessionGraph,
          },
        },
      }),
      {
        workspaceRoot: "/tmp/ali-tools",
        runtime: { runRequestCycle } satisfies Partial<ToolsRuntime>,
      },
    );

    expect(response.status).toBe("ok");
    expect(response.result?.intent_interpretation).toMatchObject({
      interpretation_id: "interpret_cycle123",
      provider: {
        kind: "openai",
        model: "gpt-5-mini",
      },
      normalized_request: "Make it darker with a gentle high-shelf cut.",
    });
    expect(response.result?.iterations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          intent_interpretation: expect.objectContaining({
            normalized_request: "Make it darker with a gentle high-shelf cut.",
          }),
        }),
      ]),
    );
  });

  it("rejects existing-input requests when the request session id does not match the session graph", async () => {
    const asset = buildAudioAsset();
    const currentVersion = buildAudioVersion("ver_current");
    const sessionGraph = buildSessionGraph(asset, [currentVersion]);

    const response = await executeToolRequest(
      buildRequest({
        session_id: "session_other",
        arguments: {
          user_request: "more",
          input: {
            kind: "existing",
            asset,
            audio_version: currentVersion,
            session_graph: sessionGraph,
          },
        },
      }),
      {
        workspaceRoot: "/tmp/ali-tools",
      },
    );

    expect(response.status).toBe("error");
    expect(response.error).toMatchObject({
      code: "provenance_mismatch",
    });
  });

  it("surfaces historical follow-up lookup failures as invalid_arguments", async () => {
    const asset = buildAudioAsset();
    const currentVersion = buildAudioVersion("ver_current");
    const sessionGraph = buildSessionGraph(asset, [currentVersion]);
    const runRequestCycle = vi.fn().mockRejectedValue(
      new OrchestrationStageError({
        stage: "load_follow_up_input",
        error: new ToolInputError(
          "invalid_arguments",
          "Historical AudioVersion 'ver_missing' is not available in arguments.input.available_versions.",
          {
            field: "arguments.input.available_versions",
            version_id: "ver_missing",
          },
        ),
        attempts: 1,
      }),
    );

    const response = await executeToolRequest(
      buildRequest({
        session_id: sessionGraph.session_id,
        arguments: {
          user_request: "try another version",
          input: {
            kind: "existing",
            asset,
            audio_version: currentVersion,
            session_graph: sessionGraph,
          },
        },
      }),
      {
        workspaceRoot: "/tmp/ali-tools",
        runtime: { runRequestCycle } satisfies Partial<ToolsRuntime>,
      },
    );

    expect(response.status).toBe("error");
    expect(response.error).toMatchObject({
      code: "invalid_arguments",
      details: {
        field: "arguments.input.available_versions",
        version_id: "ver_missing",
      },
    });
  });
});
