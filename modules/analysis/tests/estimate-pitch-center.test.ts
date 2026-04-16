import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  estimatePitchCenter,
  isValidPitchCenterEstimate,
} from "@audio-language-interface/analysis";
import type { AudioVersion } from "@audio-language-interface/core";

import { describe, expect, it } from "vitest";
import wavefile from "wavefile";

const { WaveFile } = wavefile;

async function withTempWorkspace<T>(run: (workspaceRoot: string) => Promise<T>): Promise<T> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "analysis-pitch-center-"));

  try {
    return await run(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

function createToneSignal(
  sampleRateHz: number,
  durationSeconds: number,
  frequencyHz: number,
): Float32Array[] {
  const frameCount = Math.round(sampleRateHz * durationSeconds);
  const mono = new Float32Array(frameCount);

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / sampleRateHz;
    mono[index] = 0.3 * Math.sin(2 * Math.PI * frequencyHz * time);
  }

  return [mono];
}

function createDelayedToneSignal(
  sampleRateHz: number,
  durationSeconds: number,
  frequencyHz: number,
): Float32Array[] {
  const frameCount = Math.round(sampleRateHz * durationSeconds);
  const mono = new Float32Array(frameCount);

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / sampleRateHz;
    if (time < durationSeconds / 2) {
      continue;
    }

    mono[index] = 0.25 * Math.sin(2 * Math.PI * frequencyHz * time);
  }

  return [mono];
}

function createBroadbandNoiseSignal(sampleRateHz: number, durationSeconds: number): Float32Array[] {
  const frameCount = Math.round(sampleRateHz * durationSeconds);
  const mono = new Float32Array(frameCount);
  let seed = 0x13579bdf;

  for (let index = 0; index < frameCount; index += 1) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    const normalized = seed / 0xffffffff;
    mono[index] = (normalized * 2 - 1) * 0.04;
  }

  return [mono];
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
  };
}

function getFrameCount(channels: Float32Array[]): number {
  return channels[0]?.length ?? 0;
}

describe("estimatePitchCenter", () => {
  it("returns a stable pitch center for tonal material", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const sampleRateHz = 44100;
      const storageRef = "storage/audio/test-tone.wav";
      const channels = createToneSignal(sampleRateHz, 2, 220);

      await writeWav(workspaceRoot, storageRef, sampleRateHz, channels);

      const estimate = estimatePitchCenter(
        createAudioVersion(storageRef, sampleRateHz, channels.length, getFrameCount(channels)),
        { workspaceRoot },
      );

      expect(estimate.voicing).toBe("voiced");
      expect(estimate.frequency_hz).toBeDefined();
      expect(estimate.frequency_hz).toBeGreaterThan(218);
      expect(estimate.frequency_hz).toBeLessThan(223);
      expect(estimate.midi_note).toBe(57);
      expect(estimate.note_name).toBe("A3");
      expect(estimate.confidence).toBeGreaterThan(0.9);
      expect(estimate.uncertainty_cents).toBeLessThan(5);
      expect(estimate.voiced_window_ratio).toBe(1);
      expect(isValidPitchCenterEstimate(estimate)).toBe(true);
    });
  });

  it("stays conservative on broadband noise", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const sampleRateHz = 48000;
      const storageRef = "storage/audio/test-noise.wav";
      const channels = createBroadbandNoiseSignal(sampleRateHz, 2);

      await writeWav(workspaceRoot, storageRef, sampleRateHz, channels);

      const estimate = estimatePitchCenter(
        createAudioVersion(storageRef, sampleRateHz, channels.length, getFrameCount(channels)),
        { workspaceRoot },
      );

      expect(estimate.voicing).toBe("unvoiced");
      expect(estimate.frequency_hz).toBeUndefined();
      expect(estimate.midi_note).toBeUndefined();
      expect(estimate.note_name).toBeUndefined();
      expect(estimate.confidence).toBeLessThan(0.5);
      expect(estimate.voiced_window_count).toBe(0);
      expect(isValidPitchCenterEstimate(estimate)).toBe(true);
    });
  });

  it("finds pitched evidence even when the tone starts later in the file", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const sampleRateHz = 44100;
      const storageRef = "storage/audio/test-delayed-tone.wav";
      const channels = createDelayedToneSignal(sampleRateHz, 2, 330);

      await writeWav(workspaceRoot, storageRef, sampleRateHz, channels);

      const estimate = estimatePitchCenter(
        createAudioVersion(storageRef, sampleRateHz, channels.length, getFrameCount(channels)),
        { workspaceRoot },
      );

      expect(estimate.voicing).toBe("voiced");
      expect(estimate.frequency_hz).toBeDefined();
      expect(estimate.frequency_hz).toBeGreaterThan(325);
      expect(estimate.frequency_hz).toBeLessThan(334);
      expect(estimate.note_name).toBe("E4");
      expect(estimate.voiced_window_count).toBeGreaterThan(1);
      expect(isValidPitchCenterEstimate(estimate)).toBe(true);
    });
  });

  it("samples the tail of short clips so late pitch does not get missed", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const sampleRateHz = 44100;
      const storageRef = "storage/audio/test-short-delayed-tone.wav";
      const channels = createDelayedToneSignal(sampleRateHz, 0.07, 330);

      await writeWav(workspaceRoot, storageRef, sampleRateHz, channels);

      const estimate = estimatePitchCenter(
        createAudioVersion(storageRef, sampleRateHz, channels.length, getFrameCount(channels)),
        { workspaceRoot },
      );

      expect(estimate.voicing).not.toBe("unvoiced");
      expect(estimate.frequency_hz).toBeDefined();
      expect(estimate.frequency_hz).toBeGreaterThan(325);
      expect(estimate.frequency_hz).toBeLessThan(334);
      expect(isValidPitchCenterEstimate(estimate)).toBe(true);
    });
  });
});
