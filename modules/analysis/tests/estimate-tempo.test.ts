import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { estimateTempo, isValidTempoEstimate } from "@audio-language-interface/analysis";
import type { AudioVersion } from "@audio-language-interface/core";
import { describe, expect, it } from "vitest";
import wavefile from "wavefile";

const { WaveFile } = wavefile;

async function withTempWorkspace<T>(run: (workspaceRoot: string) => Promise<T>): Promise<T> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "analysis-tempo-"));

  try {
    return await run(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
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

function createMetronomePulseSignal(
  sampleRateHz: number,
  durationSeconds: number,
  bpm: number,
): Float32Array[] {
  const frameCount = Math.round(sampleRateHz * durationSeconds);
  const mono = new Float32Array(frameCount);
  const intervalFrames = Math.round((sampleRateHz * 60) / bpm);
  const pulseLengthFrames = Math.max(48, Math.round(sampleRateHz * 0.015));
  const startFrame = Math.round(sampleRateHz * 0.5);

  for (let onset = startFrame; onset < frameCount; onset += intervalFrames) {
    for (let offset = 0; offset < pulseLengthFrames && onset + offset < frameCount; offset += 1) {
      const envelope = Math.exp(-offset / Math.max(sampleRateHz * 0.003, 1));
      mono[onset + offset] =
        (mono[onset + offset] ?? 0) +
        0.92 * envelope * Math.sin(2 * Math.PI * 1600 * (offset / sampleRateHz));
    }
  }

  return [mono];
}

function createIrregularPulseSignal(
  sampleRateHz: number,
  durationSeconds: number,
  pulseTimesSeconds: readonly number[],
): Float32Array[] {
  const frameCount = Math.round(sampleRateHz * durationSeconds);
  const mono = new Float32Array(frameCount);
  const pulseLengthFrames = Math.max(48, Math.round(sampleRateHz * 0.012));

  for (const pulseTimeSeconds of pulseTimesSeconds) {
    const onset = Math.round(pulseTimeSeconds * sampleRateHz);
    for (let offset = 0; offset < pulseLengthFrames && onset + offset < frameCount; offset += 1) {
      const envelope = Math.exp(-offset / Math.max(sampleRateHz * 0.0025, 1));
      mono[onset + offset] =
        (mono[onset + offset] ?? 0) +
        0.88 * envelope * Math.sin(2 * Math.PI * 1200 * (offset / sampleRateHz));
    }
  }

  return [mono];
}

describe("estimateTempo", () => {
  it("estimates the BPM of a metronomic pulse train", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const sampleRateHz = 48000;
      const durationSeconds = 4;
      const storageRef = "storage/audio/test-tempo-120.wav";
      const channels = createMetronomePulseSignal(sampleRateHz, durationSeconds, 120);

      await writeWav(workspaceRoot, storageRef, sampleRateHz, channels);

      const estimate = estimateTempo(
        createAudioVersion(storageRef, sampleRateHz, channels.length, getFrameCount(channels)),
        { workspaceRoot },
      );

      expect(isValidTempoEstimate(estimate)).toBe(true);
      expect(estimate.bpm).toBeCloseTo(120, 1);
      expect(estimate.beat_interval_seconds).toBeCloseTo(0.5, 2);
      expect(estimate.confidence).toBeGreaterThan(0.75);
    });
  });

  it("remains deterministic across repeated runs", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const sampleRateHz = 44100;
      const durationSeconds = 4.5;
      const storageRef = "storage/audio/test-tempo-90.wav";
      const channels = createMetronomePulseSignal(sampleRateHz, durationSeconds, 90);
      const audioVersion = createAudioVersion(
        storageRef,
        sampleRateHz,
        channels.length,
        getFrameCount(channels),
      );

      await writeWav(workspaceRoot, storageRef, sampleRateHz, channels);

      const firstEstimate = estimateTempo(audioVersion, { workspaceRoot });
      const secondEstimate = estimateTempo(audioVersion, { workspaceRoot });

      expect(firstEstimate).toEqual(secondEstimate);
      expect(isValidTempoEstimate(firstEstimate)).toBe(true);
      expect(firstEstimate.bpm).toBeCloseTo(90, 1);
      expect(firstEstimate.confidence).toBeGreaterThan(0.6);
    });
  });

  it("returns no BPM when transient spacing is too inconsistent", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const sampleRateHz = 48000;
      const durationSeconds = 4;
      const storageRef = "storage/audio/test-tempo-irregular.wav";
      const channels = createIrregularPulseSignal(
        sampleRateHz,
        durationSeconds,
        [0.32, 0.91, 1.43, 2.27, 2.81, 3.67],
      );

      await writeWav(workspaceRoot, storageRef, sampleRateHz, channels);

      const estimate = estimateTempo(
        createAudioVersion(storageRef, sampleRateHz, channels.length, getFrameCount(channels)),
        { workspaceRoot },
      );

      expect(estimate.bpm).toBeNull();
      expect(estimate.confidence).toBeLessThan(0.35);
      expect(estimate.ambiguity_candidates_bpm?.length ?? 0).toBeGreaterThan(0);
    });
  });

  it("stays conservative when sparse regular pulses only support a slower out-of-range grid", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const sampleRateHz = 48000;
      const durationSeconds = 6;
      const storageRef = "storage/audio/test-tempo-sparse.wav";
      const channels = createIrregularPulseSignal(
        sampleRateHz,
        durationSeconds,
        [0.5, 2.0, 3.5, 5.0],
      );

      await writeWav(workspaceRoot, storageRef, sampleRateHz, channels);

      const estimate = estimateTempo(
        createAudioVersion(storageRef, sampleRateHz, channels.length, getFrameCount(channels)),
        { workspaceRoot },
      );

      expect(isValidTempoEstimate(estimate)).toBe(true);
      expect(estimate.bpm).toBeNull();
      expect(estimate.confidence).toBeLessThan(0.7);
      expect(estimate.ambiguity_candidates_bpm ?? []).not.toContain(80);
    });
  });
});
