import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AudioVersion } from "@audio-language-interface/core";
import {
  getParentVersionId,
  listAncestorVersionIds,
  resolveRevertTarget,
  type SessionGraph,
  validateSessionGraph,
} from "@audio-language-interface/history";
import { importAudioFromFile } from "@audio-language-interface/io";
import {
  type FfprobeExecutionResult,
  renderExport,
  renderPreview,
} from "@audio-language-interface/render";
import { applyEditPlan } from "@audio-language-interface/transforms";
import { describe, expect, it } from "vitest";
import { WaveFile } from "wavefile";

import {
  defaultOrchestrationDependencies,
  OrchestrationStageError,
  resolveFollowUpRequest,
  runRequestCycle,
} from "../../modules/orchestration/src/index.js";

describe("request cycle integration", () => {
  it("runs the happy path across real modules and records full provenance", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const inputPath = path.join(workspaceRoot, "fixtures", "tone.wav");
      await writeFixtureWav(inputPath, { sampleRateHz: 44_100, durationSeconds: 1.5 });

      const result = await runRequestCycle({
        workspaceRoot,
        userRequest: "Make this loop darker and less harsh, but keep the punch.",
        input: {
          kind: "import",
          inputPath,
          importOptions: {
            importedAt: "2026-04-14T20:20:00Z",
            tags: ["integration"],
            notes: "end-to-end request cycle",
          },
        },
        dependencies: {
          ...defaultOrchestrationDependencies,
          applyEditPlan: async (options) =>
            applyEditPlan({ ...options, executor: copyAudioExecutor }),
          renderPreview: async (options) =>
            renderPreview({
              ...options,
              executor: copyAudioExecutor,
              probeExecutor: createProbeExecutor({
                format: "mp3",
                codec: "mp3",
                sampleRateHz: options.sampleRateHz ?? options.version.audio.sample_rate_hz,
                channels: options.channels ?? options.version.audio.channels,
                durationSeconds: options.version.audio.duration_seconds,
              }),
            }),
          renderExport: async (options) =>
            renderExport({
              ...options,
              executor: copyAudioExecutor,
              probeExecutor: createProbeExecutor({
                format: options.format ?? "wav",
                codec: options.format === "flac" ? "flac" : "pcm_s16le",
                sampleRateHz: options.sampleRateHz ?? options.version.audio.sample_rate_hz,
                channels: options.channels ?? options.version.audio.channels,
                durationSeconds: options.version.audio.duration_seconds,
              }),
            }),
        },
      });

      const provenance = result.sessionGraph.metadata?.provenance ?? {};

      expect(validateSessionGraph(result.sessionGraph).valid).toBe(true);
      expect(result.trace.map((entry) => entry.stage)).toEqual([
        "import",
        "analyze_input",
        "semantic_profile",
        "plan",
        "apply",
        "analyze_output",
        "compare",
        "render_baseline",
        "render_candidate",
        "compare",
      ]);
      expect(result.sessionGraph.active_refs).toMatchObject({
        asset_id: result.asset.asset_id,
        version_id: result.outputVersion.version_id,
      });
      expect(getParentVersionId(result.sessionGraph, result.outputVersion.version_id)).toBe(
        result.inputVersion.version_id,
      );
      expect(listAncestorVersionIds(result.sessionGraph, result.outputVersion.version_id)).toEqual([
        result.inputVersion.version_id,
      ]);
      expect(resolveRevertTarget(result.sessionGraph)).toBe(result.inputVersion.version_id);

      expect(provenance[result.inputAnalysis.report_id]).toMatchObject({
        asset_id: result.asset.asset_id,
        version_id: result.inputVersion.version_id,
      });
      expect(provenance[result.semanticProfile?.profile_id ?? "missing"]).toMatchObject({
        asset_id: result.asset.asset_id,
        version_id: result.inputVersion.version_id,
        analysis_report_id: result.inputAnalysis.report_id,
      });
      expect(provenance[result.editPlan?.plan_id ?? "missing"]).toMatchObject({
        asset_id: result.asset.asset_id,
        version_id: result.inputVersion.version_id,
        plan_id: result.editPlan?.plan_id,
      });
      expect(provenance[result.outputVersion.version_id]).toMatchObject({
        asset_id: result.asset.asset_id,
        version_id: result.outputVersion.version_id,
        parent_version_id: result.inputVersion.version_id,
        plan_id: result.editPlan?.plan_id,
        transform_record_id: result.transformResult?.transformRecord.record_id,
      });
      expect(
        provenance[result.transformResult?.transformRecord.record_id ?? "missing"],
      ).toMatchObject({
        asset_id: result.asset.asset_id,
        input_version_id: result.inputVersion.version_id,
        output_version_id: result.outputVersion.version_id,
        plan_id: result.editPlan?.plan_id,
      });
      expect(provenance[result.baselineRender.render_id]).toMatchObject({
        asset_id: result.asset.asset_id,
        version_id: result.inputVersion.version_id,
      });
      expect(provenance[result.candidateRender.render_id]).toMatchObject({
        asset_id: result.asset.asset_id,
        version_id: result.outputVersion.version_id,
      });
      expect(provenance[result.comparisonReport.comparison_id]).toMatchObject({
        baseline_ref_id: result.baselineRender.render_id,
        baseline_ref_type: "render",
        candidate_ref_id: result.candidateRender.render_id,
        candidate_ref_type: "render",
      });

      expect(result.sessionGraph.nodes.map((node) => node.node_type)).toEqual(
        expect.arrayContaining([
          "audio_asset",
          "audio_version",
          "analysis_report",
          "semantic_profile",
          "edit_plan",
          "transform_record",
          "render_artifact",
          "comparison_report",
        ]),
      );
    });
  });

  it("returns a valid partial session graph when plan application fails", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const inputPath = path.join(workspaceRoot, "fixtures", "tone.wav");
      await writeFixtureWav(inputPath, { sampleRateHz: 44_100, durationSeconds: 1 });
      const imported = await importAudioFromFile(inputPath, {
        workspaceRoot,
        importedAt: "2026-04-14T20:25:00Z",
      });

      await expect(
        runRequestCycle({
          workspaceRoot,
          userRequest: "Make this loop darker and less harsh.",
          input: {
            kind: "existing",
            asset: imported.asset,
            version: imported.version,
          },
          dependencies: {
            ...defaultOrchestrationDependencies,
            applyEditPlan: async () => {
              throw new Error("synthetic transform failure");
            },
          },
        }),
      ).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(OrchestrationStageError);

        const stageError = error as OrchestrationStageError<{
          sessionGraph?: SessionGraph;
          semanticProfile?: { profile_id: string };
          editPlan?: { plan_id: string };
        }>;
        const partialGraph = stageError.partialResult?.sessionGraph;

        expect(stageError.stage).toBe("apply");
        expect(stageError.partialResult?.semanticProfile?.profile_id).toBeTruthy();
        expect(stageError.partialResult?.editPlan?.plan_id).toBeTruthy();
        expect(partialGraph).toBeTruthy();
        if (!partialGraph) {
          throw new Error("Expected a partial session graph for apply-stage failures.");
        }

        expect(validateSessionGraph(partialGraph).valid).toBe(true);
        expect(partialGraph.active_refs.version_id).toBe(imported.version.version_id);
        expect(partialGraph.nodes.map((node: { node_type: string }) => node.node_type)).toEqual(
          expect.arrayContaining([
            "audio_asset",
            "audio_version",
            "analysis_report",
            "semantic_profile",
            "edit_plan",
          ]),
        );
        expect(partialGraph.nodes.map((node: { node_type: string }) => node.node_type)).not.toEqual(
          expect.arrayContaining(["transform_record", "render_artifact", "comparison_report"]),
        );

        const provenance = partialGraph.metadata?.provenance ?? {};
        expect(
          provenance[stageError.partialResult?.editPlan?.plan_id ?? "missing"]?.version_id,
        ).toBe(imported.version.version_id);

        return true;
      });
    });
  });

  it("supports opt-in request interpretation while keeping deterministic planning explicit", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const inputPath = path.join(workspaceRoot, "fixtures", "tone.wav");
      await writeFixtureWav(inputPath, { sampleRateHz: 44_100, durationSeconds: 1.1 });

      const result = await runRequestCycle({
        workspaceRoot,
        userRequest: "Make this loop darker.",
        input: {
          kind: "import",
          inputPath,
          importOptions: {
            importedAt: "2026-04-14T20:26:00Z",
          },
        },
        interpretation: {
          mode: "llm_assisted",
          apiKey: "test-key",
          policy: "best_effort",
          provider: {
            kind: "openai",
            model: "gpt-5-mini",
            temperature: 0.2,
          },
        },
        dependencies: {
          ...defaultOrchestrationDependencies,
          interpretRequest: async ({
            userRequest,
            audioVersion,
            analysisReport,
            semanticProfile,
          }) => ({
            schema_version: "1.0.0",
            interpretation_id: "interpret_integration123",
            interpretation_policy: "best_effort",
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
            confidence: 0.73,
            provider: {
              kind: "openai",
              model: "gpt-5-mini",
              prompt_version: "intent_v1",
            },
            generated_at: "2026-04-21T20:45:00Z",
          }),
          applyEditPlan: async (options) =>
            applyEditPlan({ ...options, executor: copyAudioExecutor }),
          renderPreview: async (options) =>
            renderPreview({
              ...options,
              executor: copyAudioExecutor,
              probeExecutor: createProbeExecutor({
                format: "mp3",
                codec: "mp3",
                sampleRateHz: options.sampleRateHz ?? options.version.audio.sample_rate_hz,
                channels: options.channels ?? options.version.audio.channels,
                durationSeconds: options.version.audio.duration_seconds,
              }),
            }),
          renderExport: async (options) =>
            renderExport({
              ...options,
              executor: copyAudioExecutor,
              probeExecutor: createProbeExecutor({
                format: options.format ?? "wav",
                codec: options.format === "flac" ? "flac" : "pcm_s16le",
                sampleRateHz: options.sampleRateHz ?? options.version.audio.sample_rate_hz,
                channels: options.channels ?? options.version.audio.channels,
                durationSeconds: options.version.audio.duration_seconds,
              }),
            }),
        },
      });

      expect(result.intentInterpretation).toMatchObject({
        interpretation_id: "interpret_integration123",
        interpretation_policy: "best_effort",
        provider: {
          kind: "openai",
          model: "gpt-5-mini",
        },
        normalized_request: "Make this loop darker with a gentle high-shelf cut.",
      });
      expect(result.editPlan?.interpreted_user_request).toBe(
        "Make this loop darker with a gentle high-shelf cut.",
      );
      expect(result.iterations?.[0]?.intentInterpretation).toMatchObject({
        normalized_request: "Make this loop darker with a gentle high-shelf cut.",
      });
    });
  });

  it("can run one explicit revision pass while keeping iteration history inspectable", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const inputPath = path.join(workspaceRoot, "fixtures", "tone.wav");
      await writeFixtureWav(inputPath, { sampleRateHz: 44_100, durationSeconds: 1.25 });

      const result = await runRequestCycle({
        workspaceRoot,
        userRequest: "Make this loop darker and less harsh.",
        input: {
          kind: "import",
          inputPath,
          importOptions: {
            importedAt: "2026-04-14T20:27:00Z",
          },
        },
        revision: {
          enabled: true,
          shouldRevise: ({ history }) => ({
            shouldRevise: history.length === 1,
            rationale: "Integration test requests one additional explicit pass.",
          }),
        },
        dependencies: {
          ...defaultOrchestrationDependencies,
          applyEditPlan: async (options) =>
            applyEditPlan({ ...options, executor: copyAudioExecutor }),
          renderPreview: async (options) =>
            renderPreview({
              ...options,
              executor: copyAudioExecutor,
              probeExecutor: createProbeExecutor({
                format: "mp3",
                codec: "mp3",
                sampleRateHz: options.sampleRateHz ?? options.version.audio.sample_rate_hz,
                channels: options.channels ?? options.version.audio.channels,
                durationSeconds: options.version.audio.duration_seconds,
              }),
            }),
          renderExport: async (options) =>
            renderExport({
              ...options,
              executor: copyAudioExecutor,
              probeExecutor: createProbeExecutor({
                format: options.format ?? "wav",
                codec: options.format === "flac" ? "flac" : "pcm_s16le",
                sampleRateHz: options.sampleRateHz ?? options.version.audio.sample_rate_hz,
                channels: options.channels ?? options.version.audio.channels,
                durationSeconds: options.version.audio.duration_seconds,
              }),
            }),
        },
      });

      expect(result.result_kind).toBe("applied");
      expect(result.iterations).toHaveLength(2);
      expect(result.revision).toEqual({
        shouldRevise: true,
        rationale: "Integration test requests one additional explicit pass.",
        source: "caller",
      });
      expect(result.semanticProfile).toBeUndefined();
      expect(result.editPlan).toBeUndefined();
      expect(result.transformResult).toBeUndefined();
      expect(result.comparisonReport.goal_alignment?.map((goal) => goal.goal)).toEqual(
        result.iterations?.[0]?.editPlan.goals,
      );
      expect(result.outputVersion.parent_version_id).toBe(
        result.iterations?.[0]?.outputVersion.version_id,
      );
      expect(listAncestorVersionIds(result.sessionGraph, result.outputVersion.version_id)).toEqual([
        result.iterations?.[0]?.outputVersion.version_id,
        result.inputVersion.version_id,
      ]);
      expect(
        result.trace
          .filter((entry) =>
            ["semantic_profile", "plan", "apply", "analyze_output", "compare"].includes(
              entry.stage,
            ),
          )
          .filter((entry) => entry.pass !== undefined)
          .map((entry) => entry.pass),
      ).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
    });
  });

  it("supports repeated apply, alternate-version, less, and undo cycles with valid session history", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const inputPath = path.join(workspaceRoot, "fixtures", "tone.wav");
      await writeFixtureWav(inputPath, { sampleRateHz: 44_100, durationSeconds: 1.25 });
      const versions = new Map<string, AudioVersion>();
      const dependencies = {
        ...defaultOrchestrationDependencies,
        importAudioFromFile: async (
          sourcePath: string,
          options?: Parameters<typeof importAudioFromFile>[1],
        ) => {
          const imported = await importAudioFromFile(sourcePath, options);
          versions.set(imported.version.version_id, imported.version);
          return imported;
        },
        applyEditPlan: async (options: Parameters<typeof applyEditPlan>[0]) =>
          applyEditPlan({ ...options, executor: copyAudioExecutor }).then((result) => {
            versions.set(result.outputVersion.version_id, result.outputVersion as AudioVersion);
            return result;
          }),
        renderPreview: async (options: Parameters<typeof renderPreview>[0]) =>
          renderPreview({
            ...options,
            executor: copyAudioExecutor,
            probeExecutor: createProbeExecutor({
              format: "mp3",
              codec: "mp3",
              sampleRateHz: options.sampleRateHz ?? options.version.audio.sample_rate_hz,
              channels: options.channels ?? options.version.audio.channels,
              durationSeconds: options.version.audio.duration_seconds,
            }),
          }),
        renderExport: async (options: Parameters<typeof renderExport>[0]) =>
          renderExport({
            ...options,
            executor: copyAudioExecutor,
            probeExecutor: createProbeExecutor({
              format: options.format ?? "wav",
              codec: options.format === "flac" ? "flac" : "pcm_s16le",
              sampleRateHz: options.sampleRateHz ?? options.version.audio.sample_rate_hz,
              channels: options.channels ?? options.version.audio.channels,
              durationSeconds: options.version.audio.duration_seconds,
            }),
          }),
        getAudioVersionById: async ({ versionId }: { versionId: string }) =>
          versions.get(versionId),
      };

      const firstCycle = await runRequestCycle({
        workspaceRoot,
        userRequest: "Make this loop darker and less harsh.",
        input: {
          kind: "import",
          inputPath,
          importOptions: {
            importedAt: "2026-04-14T20:30:00Z",
          },
        },
        dependencies,
      });

      const secondCycle = await runRequestCycle({
        workspaceRoot,
        userRequest: "more",
        input: {
          kind: "existing",
          asset: firstCycle.asset,
          version: firstCycle.outputVersion,
          sessionGraph: firstCycle.sessionGraph,
        },
        dependencies,
      });

      const alternateCycle = await runRequestCycle({
        workspaceRoot,
        userRequest: "try another version",
        input: {
          kind: "existing",
          asset: secondCycle.asset,
          version: secondCycle.outputVersion,
          sessionGraph: secondCycle.sessionGraph,
        },
        dependencies,
      });

      const lessCycle = await runRequestCycle({
        workspaceRoot,
        userRequest: "less",
        input: {
          kind: "existing",
          asset: secondCycle.asset,
          version: secondCycle.outputVersion,
          sessionGraph: secondCycle.sessionGraph,
        },
        dependencies,
      });

      const undoCycle = await runRequestCycle({
        workspaceRoot,
        userRequest: "undo",
        input: {
          kind: "existing",
          asset: lessCycle.asset,
          version: lessCycle.outputVersion,
          sessionGraph: lessCycle.sessionGraph,
        },
        dependencies,
      });

      expect(validateSessionGraph(secondCycle.sessionGraph).valid).toBe(true);
      expect(secondCycle.result_kind).toBe("applied");
      expect(secondCycle.editPlan?.user_request).toBe("Make this loop darker and less harsh.");
      expect(
        getParentVersionId(secondCycle.sessionGraph, secondCycle.outputVersion.version_id),
      ).toBe(firstCycle.outputVersion.version_id);
      expect(
        listAncestorVersionIds(secondCycle.sessionGraph, secondCycle.outputVersion.version_id),
      ).toEqual([firstCycle.outputVersion.version_id, firstCycle.inputVersion.version_id]);
      expect(
        resolveFollowUpRequest({
          userRequest: "undo",
          versionId: secondCycle.outputVersion.version_id,
          sessionGraph: secondCycle.sessionGraph,
        }),
      ).toEqual({
        kind: "revert",
        targetVersionId: firstCycle.outputVersion.version_id,
        source: "undo",
      });

      expect(alternateCycle.result_kind).toBe("applied");
      expect(alternateCycle.followUpResolution).toMatchObject({
        kind: "apply",
        source: "try_another_version",
        resolvedUserRequest: "Make this loop darker and less harsh.",
        inputVersionId: firstCycle.outputVersion.version_id,
      });
      expect(alternateCycle.followUpResolution.kind).toBe("apply");
      if (alternateCycle.followUpResolution.kind !== "apply") {
        throw new Error("Expected apply follow-up resolution for alternate version integration.");
      }
      expect(alternateCycle.followUpResolution.branchId).toMatch(/^branch_alt_/);
      expect(alternateCycle.inputVersion.version_id).toBe(firstCycle.outputVersion.version_id);
      expect(alternateCycle.outputVersion.parent_version_id).toBe(
        firstCycle.outputVersion.version_id,
      );
      expect(alternateCycle.sessionGraph.active_refs.branch_id).toBe(
        alternateCycle.followUpResolution.branchId,
      );
      expect(validateSessionGraph(alternateCycle.sessionGraph).valid).toBe(true);

      expect(lessCycle.result_kind).toBe("reverted");
      expect(lessCycle.outputVersion.version_id).toBe(firstCycle.outputVersion.version_id);
      expect(lessCycle.sessionGraph.active_refs.version_id).toBe(
        firstCycle.outputVersion.version_id,
      );
      expect(lessCycle.followUpResolution).toEqual({
        kind: "revert",
        targetVersionId: firstCycle.outputVersion.version_id,
        source: "less",
      });
      expect(validateSessionGraph(lessCycle.sessionGraph).valid).toBe(true);

      expect(undoCycle.result_kind).toBe("reverted");
      expect(undoCycle.outputVersion.version_id).toBe(secondCycle.outputVersion.version_id);
      expect(undoCycle.sessionGraph.active_refs.version_id).toBe(
        secondCycle.outputVersion.version_id,
      );
      expect(undoCycle.followUpResolution).toEqual({
        kind: "revert",
        targetVersionId: secondCycle.outputVersion.version_id,
        source: "undo",
      });
      expect(validateSessionGraph(undoCycle.sessionGraph).valid).toBe(true);
    });
  }, 20_000);

  it("wraps follow-up resolution failures with a partial session graph", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const inputPath = path.join(workspaceRoot, "fixtures", "tone.wav");
      await writeFixtureWav(inputPath, { sampleRateHz: 44_100, durationSeconds: 1 });
      const imported = await importAudioFromFile(inputPath, {
        workspaceRoot,
        importedAt: "2026-04-14T20:35:00Z",
      });

      await expect(
        runRequestCycle({
          workspaceRoot,
          userRequest: "more",
          input: {
            kind: "existing",
            asset: imported.asset,
            version: imported.version,
          },
          dependencies: defaultOrchestrationDependencies,
        }),
      ).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(OrchestrationStageError);

        const stageError = error as OrchestrationStageError<{
          sessionGraph?: SessionGraph;
          inputAnalysis?: { version_id: string };
        }>;
        const partialGraph = stageError.partialResult?.sessionGraph;

        expect(stageError.stage).toBe("resolve_follow_up");
        expect(stageError.partialResult?.inputAnalysis?.version_id).toBe(
          imported.version.version_id,
        );
        expect(partialGraph).toBeTruthy();
        if (!partialGraph) {
          throw new Error("Expected a partial session graph for follow-up resolution failures.");
        }

        expect(validateSessionGraph(partialGraph).valid).toBe(true);
        expect(partialGraph.active_refs.version_id).toBe(imported.version.version_id);
        expect(partialGraph.nodes.map((node: { node_type: string }) => node.node_type)).toEqual(
          expect.arrayContaining(["audio_asset", "audio_version", "analysis_report"]),
        );

        return true;
      });
    });
  });
});

async function withTempWorkspace(run: (workspaceRoot: string) => Promise<void>): Promise<void> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "orchestration-integration-"));

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
