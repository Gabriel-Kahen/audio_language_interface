import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { WaveFile } from "wavefile";

import type { AudioVersion } from "../src/index.js";
import { renderExport, resolveRenderOutputPath } from "../src/index.js";

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
});

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "render-invariants-"));
  tempDirs.push(workspaceRoot);
  return workspaceRoot;
}

async function createSourceVersion(
  workspaceRoot: string,
  options: { sampleRateHz: number; channels: number; durationSeconds: number },
): Promise<AudioVersion> {
  const storageRef = "storage/audio/source.wav";
  await writeSineWav(path.join(workspaceRoot, storageRef), options);
  const frameCount = Math.round(options.sampleRateHz * options.durationSeconds);

  return {
    schema_version: "1.0.0",
    version_id: "ver_01HYRENDERINVARIANT000001",
    asset_id: "asset_01HYRENDERINVARIANT001",
    lineage: { created_at: "2026-04-28T12:00:00Z", created_by: "modules/io" },
    audio: {
      storage_ref: storageRef,
      sample_rate_hz: options.sampleRateHz,
      channels: options.channels,
      duration_seconds: options.durationSeconds,
      frame_count: frameCount,
      channel_layout: "stereo",
    },
    state: { is_original: true, is_preview: false },
  };
}

async function writeSineWav(
  filePath: string,
  options: { sampleRateHz: number; channels: number; durationSeconds: number },
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const frameCount = Math.round(options.sampleRateHz * options.durationSeconds);
  const samples = Array.from({ length: options.channels }, (_, channel) =>
    Array.from({ length: frameCount }, (_, frame) =>
      Math.round(
        Math.sin((2 * Math.PI * (220 + channel * 220) * frame) / options.sampleRateHz) * 12000,
      ),
    ),
  );
  const wav = new WaveFile();
  wav.fromScratch(options.channels, options.sampleRateHz, "16", samples);
  await writeFile(filePath, Buffer.from(wav.toBuffer()));
}
