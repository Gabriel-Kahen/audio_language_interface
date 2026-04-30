import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { validateSessionGraph } from "@audio-language-interface/history";
import {
  type FfprobeExecutionResult,
  renderExport,
  renderPreview,
} from "@audio-language-interface/render";
import { createAudioLanguageSession } from "@audio-language-interface/sdk";
import { applyEditPlan } from "@audio-language-interface/transforms";
import { describe, expect, it } from "vitest";
import { WaveFile } from "wavefile";

describe("createAudioLanguageSession", () => {
  it("imports audio and initializes canonical session state", async () => {
    await withTempWorkspace(async (root) => {
      const inputPath = path.join(root, "fixtures", "tone.wav");
      await writeFixtureWav(inputPath, { sampleRateHz: 44_100, durationSeconds: 1 });

      const session = await createAudioLanguageSession({
        workspaceDir: "workspace",
        cwd: root,
        dependencies: createTestDependencies(),
      });

      const imported = await session.importAudio({ input: "fixtures/tone.wav" });
      const state = session.getState();

      expect(imported.asset.asset_id).toBe(imported.version.asset_id);
      expect(imported.version.audio.duration_seconds).toBe(1);
      expect(imported.analysisReport.version_id).toBe(imported.version.version_id);
      expect(validateSessionGraph(imported.sessionGraph).valid).toBe(true);
      expect(state.asset?.asset_id).toBe(imported.asset.asset_id);
      expect(state.currentVersion?.version_id).toBe(imported.version.version_id);
      expect(state.availableVersions.map((version) => version.version_id)).toEqual([
        imported.version.version_id,
      ]);

      const secondInputPath = path.join(root, "fixtures", "second-tone.wav");
      await writeFixtureWav(secondInputPath, { sampleRateHz: 44_100, durationSeconds: 0.75 });
      const secondImport = await session.importAudio({ input: "fixtures/second-tone.wav" });

      expect(secondImport.asset.asset_id).not.toBe(imported.asset.asset_id);
      expect(session.getState().availableVersions.map((version) => version.version_id)).toEqual([
        secondImport.version.version_id,
      ]);
    });
  });

  it("edits, follows up, renders, and compares through the stable SDK surface", async () => {
    await withTempWorkspace(async (root) => {
      const inputPath = path.join(root, "fixtures", "loop.wav");
      await writeFixtureWav(inputPath, { sampleRateHz: 44_100, durationSeconds: 1.25 });

      const session = await createAudioLanguageSession({
        workspaceDir: "workspace",
        cwd: root,
        renderKind: "final",
        dependencies: createTestDependencies(),
      });

      const editResult = await session.edit({
        input: "fixtures/loop.wav",
        request: "make it warmer and less harsh",
      });

      expect(editResult.resultKind).toBe("applied");
      if (editResult.resultKind !== "applied") {
        throw new Error(`Expected applied edit result, got ${editResult.resultKind}.`);
      }
      expect(editResult.asset.asset_id).toBe(editResult.outputVersion.asset_id);
      expect(editResult.editPlan?.steps.map((step) => step.operation)).toEqual([
        "notch_filter",
        "low_shelf",
      ]);
      expect(editResult.transformRecord?.output_version_id).toBe(
        editResult.outputVersion.version_id,
      );
      expect(editResult.renderArtifact.version_id).toBe(editResult.outputVersion.version_id);
      expect(editResult.comparisonReport.candidate.ref_id).toBe(
        editResult.outputVersion.version_id,
      );
      expect(validateSessionGraph(editResult.sessionGraph).valid).toBe(true);

      const followUpResult = await session.followUp({ request: "more" });
      expect(followUpResult.resultKind).toBe("applied");
      if (followUpResult.resultKind !== "applied") {
        throw new Error(`Expected applied follow-up result, got ${followUpResult.resultKind}.`);
      }
      expect(followUpResult.inputVersion.version_id).toBe(editResult.outputVersion.version_id);
      expect(followUpResult.outputVersion.parent_version_id).toBe(
        editResult.outputVersion.version_id,
      );

      const renderArtifact = await session.render();
      expect(renderArtifact.version_id).toBe(followUpResult.outputVersion.version_id);
      expect(renderArtifact.kind).toBe("final");

      const comparisonReport = await session.compare();
      expect(comparisonReport.baseline.ref_id).toBe(followUpResult.inputVersion.version_id);
      expect(comparisonReport.candidate.ref_id).toBe(followUpResult.outputVersion.version_id);

      const state = session.getState();
      expect(state.currentVersion?.version_id).toBe(followUpResult.outputVersion.version_id);
      expect(state.sessionGraph?.active_refs.version_id).toBe(
        followUpResult.outputVersion.version_id,
      );
      expect(state.availableVersions.map((version) => version.version_id)).toEqual(
        expect.arrayContaining([
          editResult.inputVersion.version_id,
          editResult.outputVersion.version_id,
          followUpResult.outputVersion.version_id,
        ]),
      );
    });
  });
});

function createTestDependencies() {
  return {
    applyEditPlan: async (options: Parameters<typeof applyEditPlan>[0]) =>
      applyEditPlan({ ...options, executor: copyAudioExecutor }),
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
  };
}

async function withTempWorkspace(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "sdk-integration-"));

  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
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
