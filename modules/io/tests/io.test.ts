import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { WaveFile } from "wavefile";

import {
  buildFfprobeCommand,
  buildNormalizeAudioCommand,
  createNormalizationPlan,
  InvalidSourceReferenceError,
  importAudioFromFile,
  inspectFileMetadata,
  toWorkspaceRelativePath,
} from "../src/index.js";

const tempDirectories: string[] = [];

async function createTempWorkspace(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "io-module-"));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await import("node:fs/promises").then(({ rm }) =>
        rm(directory, { force: true, recursive: true }),
      );
    }),
  );
});

async function writeFixtureWav(filePath: string): Promise<void> {
  const wav = new WaveFile();
  const sampleRateHz = 44100;
  const durationSeconds = 1;
  const frameCount = sampleRateHz * durationSeconds;
  const left = new Int16Array(frameCount);
  const right = new Int16Array(frameCount);

  for (let index = 0; index < frameCount; index += 1) {
    const value = Math.round(Math.sin((index / sampleRateHz) * Math.PI * 2 * 440) * 16000);
    left[index] = value;
    right[index] = value;
  }

  wav.fromScratch(2, sampleRateHz, "16", [left, right]);

  const { writeFile } = await import("node:fs/promises");
  await writeFile(filePath, wav.toBuffer());
}

describe("modules/io", () => {
  it("inspects WAV metadata with contract-aligned fields", async () => {
    const workspace = await createTempWorkspace();
    const filePath = path.join(workspace, "fixtures", "tone.wav");
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(path.dirname(filePath), { recursive: true }),
    );
    await writeFixtureWav(filePath);

    const metadata = await inspectFileMetadata(filePath, {
      runFfprobe: async () => undefined,
    });

    expect(metadata.containerFormat).toBe("wav");
    expect(metadata.codec).toBe("pcm_s16le");
    expect(metadata.sampleRateHz).toBe(44100);
    expect(metadata.channels).toBe(2);
    expect(metadata.frameCount).toBe(44100);
    expect(metadata.durationSeconds).toBeCloseTo(1, 5);
    expect(metadata.bitDepth).toBe(16);
    expect(metadata.channelLayout).toBe("stereo");
  });

  it("builds explicit ffprobe and ffmpeg commands", () => {
    expect(buildFfprobeCommand("input.wav")).toEqual({
      command: "ffprobe",
      args: ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", "input.wav"],
    });

    expect(
      buildNormalizeAudioCommand("input.mp3", "output.wav", {
        containerFormat: "wav",
        codec: "pcm_s16le",
        sampleRateHz: 48000,
        channels: 2,
      }),
    ).toEqual({
      command: "ffmpeg",
      args: [
        "-y",
        "-i",
        "input.mp3",
        "-vn",
        "-sn",
        "-dn",
        "-map_metadata",
        "-1",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-c:a",
        "pcm_s16le",
        "output.wav",
      ],
    });
  });

  it("reports when normalization is or is not required", () => {
    const baseMetadata = {
      sourcePath: "input.wav",
      fileSizeBytes: 1024,
      containerFormat: "wav",
      codec: "pcm_s16le",
      sampleRateHz: 48000,
      channels: 2,
      durationSeconds: 1,
      frameCount: 48000,
      bitDepth: 16,
      channelLayout: "stereo",
    };

    expect(
      createNormalizationPlan(baseMetadata, {
        containerFormat: "wav",
        codec: "pcm_s16le",
        sampleRateHz: 48000,
        channels: 2,
      }).requiresTranscode,
    ).toBe(false);

    const changed = createNormalizationPlan(baseMetadata, {
      containerFormat: "wav",
      codec: "pcm_s16le",
      sampleRateHz: 44100,
      channels: 1,
    });

    expect(changed.requiresTranscode).toBe(true);
    expect(changed.reasons).toContain("sample_rate 48000 -> 44100");
    expect(changed.reasons).toContain("channels 2 -> 1");
  });

  it("imports a source file into storage and emits valid artifacts", async () => {
    const workspace = await createTempWorkspace();
    const sourceFilePath = path.join(workspace, "fixtures", "tone.wav");
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(path.dirname(sourceFilePath), { recursive: true }),
    );
    await writeFixtureWav(sourceFilePath);

    const result = await importAudioFromFile(sourceFilePath, {
      workspaceRoot: workspace,
      importedAt: "2026-04-14T20:20:00Z",
      tags: ["fixture"],
      notes: "module-local import test",
    });

    expect(result.normalized).toBe(false);
    expect(result.asset.schema_version).toBe("1.0.0");
    expect(result.asset.asset_id).toMatch(/^asset_[A-Za-z0-9]+$/);
    expect(result.asset.display_name).toBe("tone.wav");
    expect(result.asset.source.uri).toBe("fixtures/tone.wav");
    expect(result.asset.source.checksum_sha256).toHaveLength(64);
    expect(result.asset.media.container_format).toBe("wav");
    expect(result.asset.media.codec).toBe("pcm_s16le");
    expect(result.version.version_id).toMatch(/^ver_[A-Za-z0-9]+$/);
    expect(result.version.asset_id).toBe(result.asset.asset_id);
    expect(result.version.audio.storage_ref).toMatch(/^storage\/audio\/ver_[A-Za-z0-9]+\.wav$/);
    expect(result.version.audio.frame_count).toBe(44100);
    expect(result.version.state).toEqual({ is_original: true, is_preview: false });
    expect(result.sourceMetadata.sourcePath).toBe(sourceFilePath);
    expect(result.materializedMetadata.sourcePath).toBe(result.outputPath);
    expect(result.materializedMetadata.sourcePath).not.toBe(result.sourceMetadata.sourcePath);
    expect(result.materializedMetadata.containerFormat).toBe("wav");
    expect(result.materializedMetadata.frameCount).toBe(44100);

    const outputBuffer = await readFile(result.outputPath);
    const sourceBuffer = await readFile(sourceFilePath);
    expect(outputBuffer.equals(sourceBuffer)).toBe(true);

    const outputStat = await stat(result.outputPath);
    expect(outputStat.isFile()).toBe(true);
    expect(toWorkspaceRelativePath(result.outputPath, workspace)).toBe(
      result.version.audio.storage_ref,
    );
  });

  it("rejects output directories outside the workspace before materialization", async () => {
    const workspace = await createTempWorkspace();
    const sourceFilePath = path.join(workspace, "fixtures", "tone.wav");
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(path.dirname(sourceFilePath), { recursive: true }),
    );
    await writeFixtureWav(sourceFilePath);

    const escapedDirectoryName = `${path.basename(workspace)}-escaped-output`;
    const escapedDirectory = path.resolve(workspace, "..", escapedDirectoryName);

    await expect(
      importAudioFromFile(sourceFilePath, {
        workspaceRoot: workspace,
        outputDirectory: `../${escapedDirectoryName}`,
      }),
    ).rejects.toBeInstanceOf(InvalidSourceReferenceError);

    await expect(stat(escapedDirectory)).rejects.toThrow();
  });
});
