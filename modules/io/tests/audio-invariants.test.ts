import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { WaveFile } from "wavefile";

import { importAudioFromFile, inspectFileMetadata } from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("io audio invariants", () => {
  it("materializes normalized imports with explicit duration, channel, and sample-rate metadata", async () => {
    const workspaceRoot = await createWorkspace();
    const sourcePath = path.join(workspaceRoot, "fixtures", "stereo-source.wav");
    await writeSineWav(sourcePath, { sampleRateHz: 44100, channels: 2, durationSeconds: 0.4 });

    const result = await importAudioFromFile(sourcePath, {
      workspaceRoot,
      importedAt: "2026-04-28T12:00:00Z",
      normalizationTarget: {
        containerFormat: "wav",
        codec: "pcm_s16le",
        sampleRateHz: 22050,
        channels: 1,
      },
    });

    const outputStat = await stat(result.outputPath);
    const materialized = await inspectFileMetadata(result.outputPath);

    expect(outputStat.isFile()).toBe(true);
    expect(outputStat.size).toBeGreaterThan(0);
    expect(result.normalized).toBe(true);
    expect(result.version.audio.storage_ref).toMatch(/^storage\/audio\/ver_[a-f0-9]+\.wav$/u);
    expect(result.version.audio.sample_rate_hz).toBe(22050);
    expect(result.version.audio.channels).toBe(1);
    expect(result.version.audio.channel_layout).toBe("mono");
    expect(result.version.audio.frame_count).toBe(materialized.frameCount);
    expect(result.version.audio.duration_seconds).toBeCloseTo(materialized.durationSeconds, 6);
    expect(materialized.sampleRateHz).toBe(22050);
    expect(materialized.channels).toBe(1);
    expect(materialized.durationSeconds).toBeCloseTo(0.4, 2);
  });
});

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "io-invariants-"));
  tempDirs.push(workspaceRoot);
  return workspaceRoot;
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
        Math.sin((2 * Math.PI * (220 + channel * 110) * frame) / options.sampleRateHz) * 12000,
      ),
    ),
  );
  const wav = new WaveFile();
  wav.fromScratch(options.channels, options.sampleRateHz, "16", samples);
  await writeFile(filePath, Buffer.from(wav.toBuffer()));
}
