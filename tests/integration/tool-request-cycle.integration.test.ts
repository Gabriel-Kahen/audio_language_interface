import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { FfprobeExecutionResult } from "@audio-language-interface/render";
import { describe, expect, it } from "vitest";
import { WaveFile } from "wavefile";

import {
  defaultOrchestrationDependencies,
  runRequestCycle,
} from "../../modules/orchestration/src/index.js";
import { executeToolRequest } from "../../modules/tools/src/index.js";

describe("run_request_cycle tool integration", () => {
  it("supports multi-step follow-up editing through the tool surface", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const inputPath = path.join(workspaceRoot, "fixtures", "tone.wav");
      await writeFixtureWav(inputPath, { sampleRateHz: 44_100, durationSeconds: 1.25 });

      const runtime = {
        runRequestCycle: (options: Parameters<typeof runRequestCycle>[0]) =>
          runRequestCycle({
            ...options,
            dependencies: {
              ...options.dependencies,
              applyEditPlan: async (applyOptions) =>
                defaultOrchestrationDependencies.applyEditPlan({
                  ...applyOptions,
                  executor: copyAudioExecutor,
                }),
              renderPreview: async (renderOptions) =>
                defaultOrchestrationDependencies.renderPreview({
                  ...renderOptions,
                  executor: copyAudioExecutor,
                  probeExecutor: createProbeExecutor({
                    format: "mp3",
                    codec: "mp3",
                    sampleRateHz:
                      renderOptions.sampleRateHz ?? renderOptions.version.audio.sample_rate_hz,
                    channels: renderOptions.channels ?? renderOptions.version.audio.channels,
                    durationSeconds: renderOptions.version.audio.duration_seconds,
                  }),
                }),
              renderExport: async (renderOptions) =>
                defaultOrchestrationDependencies.renderExport({
                  ...renderOptions,
                  executor: copyAudioExecutor,
                  probeExecutor: createProbeExecutor({
                    format: renderOptions.format ?? "wav",
                    codec: renderOptions.format === "flac" ? "flac" : "pcm_s16le",
                    sampleRateHz:
                      renderOptions.sampleRateHz ?? renderOptions.version.audio.sample_rate_hz,
                    channels: renderOptions.channels ?? renderOptions.version.audio.channels,
                    durationSeconds: renderOptions.version.audio.duration_seconds,
                  }),
                }),
            },
          }),
      };

      const initial = await executeToolRequest(
        {
          schema_version: "1.0.0",
          request_id: "toolreq_cycleimport1",
          tool_name: "run_request_cycle",
          requested_at: "2026-04-21T21:00:00Z",
          session_id: "session_toolcycle",
          arguments: {
            user_request: "Make this loop darker and less harsh.",
            input: {
              kind: "import",
              input_path: inputPath,
            },
          },
        },
        {
          workspaceRoot,
          runtime,
        },
      );

      expect(initial.status).toBe("ok");
      const initialResult = extractSuccessfulResult(initial);

      const more = await executeToolRequest(
        {
          schema_version: "1.0.0",
          request_id: "toolreq_cyclemore1",
          tool_name: "run_request_cycle",
          requested_at: "2026-04-21T21:00:01Z",
          session_id: "session_toolcycle",
          asset_id: String((initialResult.asset as Record<string, unknown>).asset_id),
          version_id: String((initialResult.output_version as Record<string, unknown>).version_id),
          arguments: {
            user_request: "more",
            input: {
              kind: "existing",
              asset: initialResult.asset,
              audio_version: initialResult.output_version,
              session_graph: initialResult.session_graph,
              available_versions: [initialResult.input_version, initialResult.output_version],
            },
          },
        },
        {
          workspaceRoot,
          runtime,
        },
      );

      expect(more.status).toBe("ok");
      const moreResult = extractSuccessfulResult(more);
      expect(moreResult.follow_up_resolution).toMatchObject({
        kind: "apply",
        source: "repeat_last_request",
      });

      const alternate = await executeToolRequest(
        {
          schema_version: "1.0.0",
          request_id: "toolreq_cyclealt1",
          tool_name: "run_request_cycle",
          requested_at: "2026-04-21T21:00:02Z",
          session_id: "session_toolcycle",
          asset_id: String((moreResult.asset as Record<string, unknown>).asset_id),
          version_id: String((moreResult.output_version as Record<string, unknown>).version_id),
          arguments: {
            user_request: "try another version",
            input: {
              kind: "existing",
              asset: moreResult.asset,
              audio_version: moreResult.output_version,
              session_graph: moreResult.session_graph,
              available_versions: [
                initialResult.input_version,
                initialResult.output_version,
                moreResult.output_version,
              ],
            },
          },
        },
        {
          workspaceRoot,
          runtime,
        },
      );

      expect(alternate.status).toBe("ok");
      const alternateResult = extractSuccessfulResult(alternate);
      expect(alternateResult.follow_up_resolution).toMatchObject({
        kind: "apply",
        source: "try_another_version",
        branch_id: expect.stringMatching(/^branch_alt_/),
      });
      expect(alternateResult.input_version).toMatchObject({
        version_id: (initialResult.output_version as Record<string, unknown>).version_id,
      });
      expect((alternateResult.session_graph as Record<string, unknown>).active_refs).toMatchObject({
        branch_id: (alternateResult.follow_up_resolution as Record<string, unknown>).branch_id,
      });
    });
  }, 15_000);

  it("returns explicit request interpretation artifacts when tool callers opt into LLM assistance", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const inputPath = path.join(workspaceRoot, "fixtures", "tone.wav");
      await writeFixtureWav(inputPath, { sampleRateHz: 44_100, durationSeconds: 1 });

      const runtime = {
        runRequestCycle: (options: Parameters<typeof runRequestCycle>[0]) =>
          runRequestCycle({
            ...options,
            dependencies: {
              ...options.dependencies,
              interpretRequest: async ({
                userRequest,
                audioVersion,
                analysisReport,
                semanticProfile,
              }) => ({
                schema_version: "1.0.0",
                interpretation_id: "interpret_toolcycle123",
                asset_id: audioVersion.asset_id,
                version_id: audioVersion.version_id,
                analysis_report_id: analysisReport.report_id,
                semantic_profile_id: semanticProfile.profile_id,
                user_request: userRequest,
                normalized_request: "Make this loop darker with a gentle high-shelf cut.",
                request_classification: "supported",
                next_action: "plan",
                normalized_objectives: ["darker"],
                candidate_descriptors: ["dark"],
                rationale:
                  "Clarified the tonal request into a more explicit deterministic planning prompt.",
                confidence: 0.71,
                provider: {
                  kind: "openai",
                  model: "gpt-5-mini",
                  prompt_version: "intent_v1",
                },
                generated_at: "2026-04-21T21:20:00Z",
              }),
              applyEditPlan: async (applyOptions) =>
                defaultOrchestrationDependencies.applyEditPlan({
                  ...applyOptions,
                  executor: copyAudioExecutor,
                }),
              renderPreview: async (renderOptions) =>
                defaultOrchestrationDependencies.renderPreview({
                  ...renderOptions,
                  executor: copyAudioExecutor,
                  probeExecutor: createProbeExecutor({
                    format: "mp3",
                    codec: "mp3",
                    sampleRateHz:
                      renderOptions.sampleRateHz ?? renderOptions.version.audio.sample_rate_hz,
                    channels: renderOptions.channels ?? renderOptions.version.audio.channels,
                    durationSeconds: renderOptions.version.audio.duration_seconds,
                  }),
                }),
              renderExport: async (renderOptions) =>
                defaultOrchestrationDependencies.renderExport({
                  ...renderOptions,
                  executor: copyAudioExecutor,
                  probeExecutor: createProbeExecutor({
                    format: renderOptions.format ?? "wav",
                    codec: renderOptions.format === "flac" ? "flac" : "pcm_s16le",
                    sampleRateHz:
                      renderOptions.sampleRateHz ?? renderOptions.version.audio.sample_rate_hz,
                    channels: renderOptions.channels ?? renderOptions.version.audio.channels,
                    durationSeconds: renderOptions.version.audio.duration_seconds,
                  }),
                }),
            },
          }),
      };

      const response = await executeToolRequest(
        {
          schema_version: "1.0.0",
          request_id: "toolreq_cycleinterpret1",
          tool_name: "run_request_cycle",
          requested_at: "2026-04-21T21:20:00Z",
          session_id: "session_toolcycleinterpret",
          arguments: {
            user_request: "Make this loop darker.",
            interpretation: {
              mode: "llm_assisted",
              api_key: "test-key",
              prompt_version: "intent_v1",
              provider: {
                kind: "openai",
                model: "gpt-5-mini",
                temperature: 0.2,
              },
            },
            input: {
              kind: "import",
              input_path: inputPath,
            },
          },
        },
        {
          workspaceRoot,
          runtime,
        },
      );
      expect(response.status).toBe("ok");
      const result = extractSuccessfulResult(response);
      expect(result.intent_interpretation).toMatchObject({
        interpretation_id: "interpret_toolcycle123",
        provider: {
          kind: "openai",
          model: "gpt-5-mini",
        },
        normalized_request: "Make this loop darker with a gentle high-shelf cut.",
        generated_at: "2026-04-21T21:20:00Z",
      });
      expect((result.edit_plan as Record<string, unknown>).user_request).toBe(
        "Make this loop darker.",
      );
    });
  });

  it("returns an explicit error when follow-up history is not materialized through available_versions", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const inputPath = path.join(workspaceRoot, "fixtures", "tone.wav");
      await writeFixtureWav(inputPath, { sampleRateHz: 44_100, durationSeconds: 1 });

      const runtime = {
        runRequestCycle: (options: Parameters<typeof runRequestCycle>[0]) =>
          runRequestCycle({
            ...options,
            dependencies: {
              ...options.dependencies,
              applyEditPlan: async (applyOptions) =>
                defaultOrchestrationDependencies.applyEditPlan({
                  ...applyOptions,
                  executor: copyAudioExecutor,
                }),
              renderPreview: async (renderOptions) =>
                defaultOrchestrationDependencies.renderPreview({
                  ...renderOptions,
                  executor: copyAudioExecutor,
                  probeExecutor: createProbeExecutor({
                    format: "mp3",
                    codec: "mp3",
                    sampleRateHz:
                      renderOptions.sampleRateHz ?? renderOptions.version.audio.sample_rate_hz,
                    channels: renderOptions.channels ?? renderOptions.version.audio.channels,
                    durationSeconds: renderOptions.version.audio.duration_seconds,
                  }),
                }),
              renderExport: async (renderOptions) =>
                defaultOrchestrationDependencies.renderExport({
                  ...renderOptions,
                  executor: copyAudioExecutor,
                  probeExecutor: createProbeExecutor({
                    format: renderOptions.format ?? "wav",
                    codec: renderOptions.format === "flac" ? "flac" : "pcm_s16le",
                    sampleRateHz:
                      renderOptions.sampleRateHz ?? renderOptions.version.audio.sample_rate_hz,
                    channels: renderOptions.channels ?? renderOptions.version.audio.channels,
                    durationSeconds: renderOptions.version.audio.duration_seconds,
                  }),
                }),
            },
          }),
      };

      const initial = await executeToolRequest(
        {
          schema_version: "1.0.0",
          request_id: "toolreq_cyclebase2",
          tool_name: "run_request_cycle",
          requested_at: "2026-04-21T21:10:00Z",
          session_id: "session_toolcycle2",
          arguments: {
            user_request: "Make this loop darker and less harsh.",
            input: {
              kind: "import",
              input_path: inputPath,
            },
          },
        },
        {
          workspaceRoot,
          runtime,
        },
      );

      const initialResult = extractSuccessfulResult(initial);

      const less = await executeToolRequest(
        {
          schema_version: "1.0.0",
          request_id: "toolreq_cycleless2",
          tool_name: "run_request_cycle",
          requested_at: "2026-04-21T21:10:01Z",
          session_id: "session_toolcycle2",
          asset_id: String((initialResult.asset as Record<string, unknown>).asset_id),
          version_id: String((initialResult.output_version as Record<string, unknown>).version_id),
          arguments: {
            user_request: "less",
            input: {
              kind: "existing",
              asset: initialResult.asset,
              audio_version: initialResult.output_version,
              session_graph: initialResult.session_graph,
            },
          },
        },
        {
          workspaceRoot,
          runtime,
        },
      );

      expect(less.status).toBe("error");
      expect(less.error).toMatchObject({
        code: "invalid_arguments",
        details: {
          field: "arguments.input.available_versions",
        },
      });
    });
  });
});

function extractSuccessfulResult(response: Awaited<ReturnType<typeof executeToolRequest>>) {
  const result = response.result;
  if (response.status !== "ok" || !result) {
    throw new Error("Expected successful run_request_cycle tool response.");
  }

  return result;
}

async function withTempWorkspace(run: (workspaceRoot: string) => Promise<void>): Promise<void> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "tool-request-cycle-integration-"));

  try {
    await run(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function writeFixtureWav(
  filePath: string,
  options: { sampleRateHz: number; durationSeconds: number },
): Promise<void> {
  const wav = new WaveFile();
  const frameCount = Math.round(options.sampleRateHz * options.durationSeconds);
  const left = new Int16Array(frameCount);
  const right = new Int16Array(frameCount);

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / options.sampleRateHz;
    left[index] = Math.round(Math.sin(2 * Math.PI * 220 * time) * 10_000);
    right[index] = Math.round(Math.sin(2 * Math.PI * 1760 * time) * 6_000);
  }

  wav.fromScratch(2, options.sampleRateHz, "16", [left, right]);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, wav.toBuffer());
}

async function copyAudioExecutor(command: {
  args: string[];
  outputPath: string;
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const inputPath = command.args[1] === "-i" ? command.args[2] : undefined;
  if (!inputPath) {
    throw new Error("Expected ffmpeg-style command arguments to include an input path.");
  }

  await mkdir(path.dirname(command.outputPath), { recursive: true });
  await copyFile(inputPath, command.outputPath);

  return {
    exitCode: 0,
    stdout: "copied fixture audio",
    stderr: "",
  };
}

function createProbeExecutor(metadata: {
  format: string;
  codec: string;
  sampleRateHz: number;
  channels: number;
  durationSeconds: number;
}): () => Promise<FfprobeExecutionResult> {
  return async () => ({
    exitCode: 0,
    stdout: JSON.stringify({
      streams: [
        {
          codec_type: "audio",
          codec_name: metadata.codec,
          sample_rate: String(metadata.sampleRateHz),
          channels: metadata.channels,
        },
      ],
      format: {
        format_name: metadata.format,
        duration: String(metadata.durationSeconds),
      },
    }),
    stderr: "",
  });
}
