import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";
import wavefile from "wavefile";

import type { AudioVersion } from "../src/index.js";
import { analyzeAudioVersion, isValidAnalysisReport } from "../src/index.js";

const { WaveFile } = wavefile;

async function withTempWorkspace<T>(run: (workspaceRoot: string) => Promise<T>): Promise<T> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "analysis-module-"));

  try {
    return await run(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

function createStereoSineWithSilence(
  sampleRateHz: number,
  durationSeconds: number,
): Float32Array[] {
  const frameCount = Math.round(sampleRateHz * durationSeconds);
  const left = new Float32Array(frameCount);
  const right = new Float32Array(frameCount);

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / sampleRateHz;
    const active = time >= 0.5 && time <= 1.5;
    const amplitude = active ? 0.3 : 0.0002;
    left[index] = amplitude * Math.sin(2 * Math.PI * 220 * time);
    right[index] = amplitude * Math.sin(2 * Math.PI * 440 * time + Math.PI / 4);
  }

  return [left, right];
}

function createTransientClipSignal(sampleRateHz: number, durationSeconds: number): Float32Array[] {
  const frameCount = Math.round(sampleRateHz * durationSeconds);
  const mono = new Float32Array(frameCount);
  const pulseSpacing = Math.floor(sampleRateHz * 0.25);

  for (let index = 0; index < frameCount; index += 1) {
    const base = 0.05 * Math.sin(2 * Math.PI * 120 * (index / sampleRateHz));
    mono[index] = base;
  }

  for (let onset = pulseSpacing; onset < frameCount; onset += pulseSpacing) {
    for (let offset = 0; offset < 24 && onset + offset < frameCount; offset += 1) {
      mono[onset + offset] = 1;
    }
  }

  return [mono];
}

function createStereoClipCountSignal(
  sampleRateHz: number,
  durationSeconds: number,
): Float32Array[] {
  const frameCount = Math.round(sampleRateHz * durationSeconds);
  const left = new Float32Array(frameCount);
  const right = new Float32Array(frameCount);

  left[10] = 1;
  left[20] = 1;
  right[20] = -1;
  right[30] = -1;

  return [left, right];
}

async function writeWav(
  workspaceRoot: string,
  storageRef: string,
  sampleRateHz: number,
  channels: Float32Array[],
): Promise<void> {
  const wav = new WaveFile();
  wav.fromScratch(channels.length, sampleRateHz, "32f", channels);
  const targetPath = join(workspaceRoot, storageRef);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, wav.toBuffer());
}

function createAudioVersion(
  storageRef: string,
  sampleRateHz: number,
  channels: number,
  frameCount: number,
): AudioVersion {
  return {
    schema_version: "1.0.0",
    version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T0",
    asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
    lineage: {
      created_at: "2026-04-14T20:20:05Z",
      created_by: "modules/io",
      reason: "test fixture",
    },
    audio: {
      storage_ref: storageRef,
      sample_rate_hz: sampleRateHz,
      channels,
      duration_seconds: frameCount / sampleRateHz,
      frame_count: frameCount,
      channel_layout: channels === 1 ? "mono" : "stereo",
    },
    state: {
      is_original: true,
      is_preview: false,
    },
  };
}

function getFrameCount(channels: Float32Array[]): number {
  return channels[0]?.length ?? 0;
}

describe("analyzeAudioVersion", () => {
  it("produces a contract-aligned report for a simple stereo WAV", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const sampleRateHz = 44100;
      const durationSeconds = 2;
      const storageRef = "storage/audio/test-stereo.wav";
      const channels = createStereoSineWithSilence(sampleRateHz, durationSeconds);

      await writeWav(workspaceRoot, storageRef, sampleRateHz, channels);

      const report = await analyzeAudioVersion(
        createAudioVersion(storageRef, sampleRateHz, channels.length, getFrameCount(channels)),
        {
          workspaceRoot,
          generatedAt: "2026-04-14T20:20:10Z",
        },
      );

      expect(isValidAnalysisReport(report)).toBe(true);
      expect(report.measurements.levels.integrated_lufs).toBeLessThan(-5);
      expect(
        Math.abs(report.measurements.levels.integrated_lufs - report.measurements.levels.rms_dbfs),
      ).toBeGreaterThan(0.1);
      expect(report.measurements.levels.true_peak_dbtp).toBeGreaterThanOrEqual(
        report.measurements.levels.sample_peak_dbfs - 0.01,
      );
      expect(report.measurements.stereo.width).toBeGreaterThan(0.1);
      expect(report.measurements.artifacts.clipping_detected).toBe(false);
      expect(report.segments?.some((segment) => segment.kind === "silence")).toBe(true);
      expect(report.source_character?.pitched).toBe(true);
      expect(report.summary.plain_text.length).toBeGreaterThan(0);
    });
  });

  it("detects clipping and elevated transient density", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const sampleRateHz = 48000;
      const durationSeconds = 2;
      const storageRef = "storage/audio/test-transient.wav";
      const channels = createTransientClipSignal(sampleRateHz, durationSeconds);

      await writeWav(workspaceRoot, storageRef, sampleRateHz, channels);

      const report = await analyzeAudioVersion(
        createAudioVersion(storageRef, sampleRateHz, channels.length, getFrameCount(channels)),
        {
          workspaceRoot,
          generatedAt: "2026-04-14T20:20:10Z",
        },
      );

      expect(report.measurements.artifacts.clipping_detected).toBe(true);
      expect(report.measurements.artifacts.clipped_sample_count).toBeGreaterThan(0);
      expect(report.measurements.dynamics.transient_density_per_second).toBeGreaterThan(1);
      expect(report.annotations?.some((annotation) => annotation.kind === "clipping")).toBe(true);
      expect(report.summary.plain_text).toContain("Clipping is present");
    });
  });

  it("defaults generated_at deterministically from the input lineage timestamp", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const sampleRateHz = 44100;
      const durationSeconds = 1;
      const storageRef = "storage/audio/test-deterministic.wav";
      const channels = createStereoSineWithSilence(sampleRateHz, durationSeconds);

      await writeWav(workspaceRoot, storageRef, sampleRateHz, channels);

      const audioVersion = createAudioVersion(
        storageRef,
        sampleRateHz,
        channels.length,
        getFrameCount(channels),
      );

      const firstReport = await analyzeAudioVersion(audioVersion, { workspaceRoot });
      const secondReport = await analyzeAudioVersion(audioVersion, { workspaceRoot });

      expect(firstReport.generated_at).toBe(audioVersion.lineage.created_at);
      expect(secondReport.generated_at).toBe(audioVersion.lineage.created_at);
      expect(secondReport).toEqual(firstReport);
    });
  });

  it("rejects non-WAV storage references for the current baseline", async () => {
    const audioVersion = createAudioVersion("storage/audio/test-input.mp3", 44100, 2, 44100);

    await expect(analyzeAudioVersion(audioVersion)).rejects.toThrow(
      "Unsupported audio format for analysis baseline",
    );
  });

  it("rejects AudioVersion metadata that does not match the decoded file", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const sampleRateHz = 44100;
      const durationSeconds = 1;
      const storageRef = "storage/audio/test-metadata.wav";
      const channels = createStereoSineWithSilence(sampleRateHz, durationSeconds);

      await writeWav(workspaceRoot, storageRef, sampleRateHz, channels);

      await expect(
        analyzeAudioVersion(
          createAudioVersion(storageRef, 48000, channels.length, getFrameCount(channels)),
          {
            workspaceRoot,
          },
        ),
      ).rejects.toThrow("AudioVersion metadata does not match decoded file");
    });
  });

  it("counts clipped samples across channels", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const sampleRateHz = 44100;
      const durationSeconds = 1;
      const storageRef = "storage/audio/test-clipped-samples.wav";
      const channels = createStereoClipCountSignal(sampleRateHz, durationSeconds);

      await writeWav(workspaceRoot, storageRef, sampleRateHz, channels);

      const report = await analyzeAudioVersion(
        createAudioVersion(storageRef, sampleRateHz, channels.length, getFrameCount(channels)),
        {
          workspaceRoot,
          generatedAt: "2026-04-14T20:20:10Z",
        },
      );

      expect(report.measurements.artifacts.clipping_detected).toBe(true);
      expect(report.measurements.artifacts.clipped_sample_count).toBe(4);
      expect(
        report.annotations?.find((annotation) => annotation.kind === "clipping")?.evidence,
      ).toContain("4 clipped samples across 3 frames");
    });
  });
});
