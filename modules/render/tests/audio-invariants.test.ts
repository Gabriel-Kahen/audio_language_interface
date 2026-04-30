import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { WaveFile } from "wavefile";

import type { AudioVersion } from "../src/index.js";
import { renderComparisonPreview, renderExport, resolveRenderOutputPath } from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("render audio invariants", () => {
  it("rejects unsafe caller-controlled output paths before writing", async () => {
    const workspaceRoot = await createWorkspace();

    expect(() =>
      resolveRenderOutputPath({
        workspaceRoot,
        outputDir: "../outside-renders",
        renderId: "render_unsafe",
        extension: "wav",
        kind: "final",
      }),
    ).toThrow(/must stay inside the workspace root/u);

    expect(() =>
      resolveRenderOutputPath({
        workspaceRoot,
        outputDir: "renders/../../outside-renders",
        renderId: "render_unsafe_nested",
        extension: "wav",
        kind: "final",
      }),
    ).toThrow(/must stay inside the workspace root/u);
  });

  it("materializes final exports whose declared shape describes the output file", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createSourceVersion(workspaceRoot, {
      sampleRateHz: 44100,
      channels: 2,
      durationSeconds: 0.5,
    });

    const result = await renderExport({
      workspaceRoot,
      version,
      renderId: "render_invariantfinal",
      format: "wav",
      sampleRateHz: 22050,
      channels: 1,
    });

    const outputPath = path.join(workspaceRoot, result.artifact.output.path);
    const outputStat = await stat(outputPath);

    expect(outputStat.isFile()).toBe(true);
    expect(outputStat.size).toBe(result.artifact.output.file_size_bytes);
    expect(result.artifact.output.path).toBe("renders/render_invariantfinal.wav");
    expect(result.artifact.output.format).toBe("wav");
    expect(result.artifact.output.sample_rate_hz).toBe(22050);
    expect(result.artifact.output.channels).toBe(1);
    expect(result.artifact.output.duration_seconds).toBeCloseTo(0.5, 3);
    expect(result.artifact.warnings).toBeUndefined();
  });

  it("materializes loudness-matched A/B previews within tolerance", async () => {
    const workspaceRoot = await createWorkspace();
    const originalVersion = await createSourceVersion(workspaceRoot, {
      storageRef: "storage/audio/original.wav",
      versionId: "ver_01HYRENDERABORIGINAL001",
      sampleRateHz: 44100,
      channels: 1,
      durationSeconds: 1,
      peakAmplitude: 5000,
    });
    const editedVersion = await createSourceVersion(workspaceRoot, {
      storageRef: "storage/audio/edited.wav",
      versionId: "ver_01HYRENDERABEDITED0001",
      sampleRateHz: 44100,
      channels: 1,
      durationSeconds: 1,
      peakAmplitude: 18000,
      parentVersionId: originalVersion.version_id,
      isOriginal: false,
    });

    const result = await renderComparisonPreview({
      workspaceRoot,
      originalVersion,
      editedVersion,
      renderIds: {
        originalPreview: "render_aboriginalpreview001",
        editedPreview: "render_abeditedpreview001",
        loudnessMatchedOriginalPreview: "render_aboriginalmatched001",
        loudnessMatchedEditedPreview: "render_abeditedmatched001",
      },
      matchToleranceLufs: 1,
      maxTruePeakDbtp: -0.5,
    });

    for (const artifact of [
      result.originalPreview.artifact,
      result.editedPreview.artifact,
      result.loudnessMatchedOriginalPreview.artifact,
      result.loudnessMatchedEditedPreview.artifact,
    ]) {
      const outputStat = await stat(path.join(workspaceRoot, artifact.output.path));
      expect(outputStat.isFile()).toBe(true);
      expect(outputStat.size).toBeGreaterThan(0);
      expect(artifact.kind).toBe("preview");
      expect(artifact.output.format).toBe("mp3");
      expect(artifact.loudness_summary?.integrated_lufs).toEqual(expect.any(Number));
    }

    const matchedDelta = Math.abs(
      result.metadata.original.matched_loudness.integrated_lufs -
        result.metadata.edited.matched_loudness.integrated_lufs,
    );
    expect(matchedDelta).toBeLessThanOrEqual(result.metadata.tolerance_lufs);
    expect(result.metadata.original.matched_loudness.true_peak_dbtp).toBeLessThanOrEqual(
      result.metadata.max_true_peak_dbtp + 0.25,
    );
    expect(result.metadata.edited.matched_loudness.true_peak_dbtp).toBeLessThanOrEqual(
      result.metadata.max_true_peak_dbtp + 0.25,
    );
  });
});

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "render-invariants-"));
  tempDirs.push(workspaceRoot);
  return workspaceRoot;
}

async function createSourceVersion(
  workspaceRoot: string,
  options: {
    sampleRateHz: number;
    channels: number;
    durationSeconds: number;
    storageRef?: string;
    versionId?: AudioVersion["version_id"];
    parentVersionId?: AudioVersion["version_id"];
    isOriginal?: boolean;
    peakAmplitude?: number;
  },
): Promise<AudioVersion> {
  const storageRef = options.storageRef ?? "storage/audio/source.wav";
  await writeSineWav(path.join(workspaceRoot, storageRef), options);
  const frameCount = Math.round(options.sampleRateHz * options.durationSeconds);

  return {
    schema_version: "1.0.0",
    version_id: options.versionId ?? "ver_01HYRENDERINVARIANT000001",
    asset_id: "asset_01HYRENDERINVARIANT001",
    ...(options.parentVersionId === undefined
      ? {}
      : { parent_version_id: options.parentVersionId }),
    lineage: { created_at: "2026-04-28T12:00:00Z", created_by: "modules/io" },
    audio: {
      storage_ref: storageRef,
      sample_rate_hz: options.sampleRateHz,
      channels: options.channels,
      duration_seconds: options.durationSeconds,
      frame_count: frameCount,
      channel_layout: options.channels === 1 ? "mono" : "stereo",
    },
    state: { is_original: options.isOriginal ?? true, is_preview: false },
  };
}

async function writeSineWav(
  filePath: string,
  options: {
    sampleRateHz: number;
    channels: number;
    durationSeconds: number;
    peakAmplitude?: number;
  },
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const frameCount = Math.round(options.sampleRateHz * options.durationSeconds);
  const samples = Array.from({ length: options.channels }, (_, channel) =>
    Array.from({ length: frameCount }, (_, frame) =>
      Math.round(
        Math.sin((2 * Math.PI * (220 + channel * 220) * frame) / options.sampleRateHz) *
          (options.peakAmplitude ?? 12000),
      ),
    ),
  );
  const wav = new WaveFile();
  wav.fromScratch(options.channels, options.sampleRateHz, "16", samples);
  await writeFile(filePath, Buffer.from(wav.toBuffer()));
}
