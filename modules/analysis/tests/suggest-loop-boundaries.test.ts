import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  isValidLoopBoundarySuggestionSet,
  type LoopBoundarySuggestionSet,
  suggestLoopBoundaries,
} from "@audio-language-interface/analysis";
import type { AudioVersion } from "@audio-language-interface/core";
import { describe, expect, it } from "vitest";
import wavefile from "wavefile";

const { WaveFile } = wavefile;

async function withTempWorkspace<T>(run: (workspaceRoot: string) => Promise<T>): Promise<T> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "analysis-loop-boundaries-"));

  try {
    return await run(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
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
      created_at: "2026-04-16T12:00:00Z",
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

function createPulseLoopPattern(sampleRateHz: number, cycleDurationSeconds: number): Float32Array {
  const frameCount = Math.round(sampleRateHz * cycleDurationSeconds);
  const mono = new Float32Array(frameCount);

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / sampleRateHz;
    mono[index] = 0.09 * Math.sin(2 * Math.PI * 180 * time);
  }

  const transientLength = Math.max(1, Math.round(sampleRateHz * 0.02));
  for (let index = 0; index < transientLength && index < frameCount; index += 1) {
    mono[index] = (mono[index] ?? 0) + 0.97 * Math.exp(-index / Math.max(sampleRateHz * 0.003, 1));
  }

  return mono;
}

function repeatPattern(
  pattern: Float32Array,
  repeatCount: number,
  prefixFrames = 0,
): Float32Array[] {
  const mono = new Float32Array(prefixFrames + pattern.length * repeatCount);
  for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
    mono.set(pattern, prefixFrames + repeatIndex * pattern.length);
  }

  return [mono];
}

function createNonRepeatingFixture(sampleRateHz: number, durationSeconds: number): Float32Array[] {
  const frameCount = Math.round(sampleRateHz * durationSeconds);
  const mono = new Float32Array(frameCount);

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / sampleRateHz;
    const sweep = 140 + 520 * time;
    const envelope = 0.05 + 0.18 * (index / Math.max(frameCount - 1, 1));
    mono[index] =
      envelope * Math.sin(2 * Math.PI * sweep * time) +
      0.03 * Math.sin(2 * Math.PI * (sweep * 0.37) * time + Math.PI / 5);
  }

  return [mono];
}

function createSilentFixture(sampleRateHz: number, durationSeconds: number): Float32Array[] {
  const frameCount = Math.round(sampleRateHz * durationSeconds);
  return [new Float32Array(frameCount)];
}

function expectTopSuggestion(
  suggestions: LoopBoundarySuggestionSet,
): NonNullable<LoopBoundarySuggestionSet["suggestions"][number]> {
  const topSuggestion = suggestions.suggestions[0];
  expect(topSuggestion).toBeDefined();
  return topSuggestion as NonNullable<LoopBoundarySuggestionSet["suggestions"][number]>;
}

describe("suggestLoopBoundaries", () => {
  it("prefers a single repeated cycle over longer composite repeats", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const sampleRateHz = 48000;
      const cycleDurationSeconds = 0.5;
      const pattern = createPulseLoopPattern(sampleRateHz, cycleDurationSeconds);
      const storageRef = "storage/audio/repeating-cycle.wav";
      const channels = repeatPattern(pattern, 4);
      const frameCount = channels[0]?.length ?? 0;

      await writeWav(workspaceRoot, storageRef, sampleRateHz, channels);

      const suggestions = suggestLoopBoundaries(
        createAudioVersion(storageRef, sampleRateHz, channels.length, frameCount),
        {
          workspaceRoot,
          generatedAt: "2026-04-16T12:00:10Z",
        },
      );

      const topSuggestion = expectTopSuggestion(suggestions);
      expect(suggestions.loop_boundary_suggestion_id).toMatch(/^loopbounds_/);
      expect(topSuggestion.start_seconds).toBe(0);
      expect(topSuggestion.end_seconds).toBeCloseTo(0.5, 2);
      expect(topSuggestion.duration_seconds).toBeCloseTo(0.5, 2);
      expect(topSuggestion.confidence).toBeGreaterThan(0.85);
      expect(topSuggestion.rationale).toContain("repeats in adjacent audio");
      expect(isValidLoopBoundarySuggestionSet(suggestions)).toBe(true);
    });
  });

  it("can suggest loop boundaries that begin after a non-repeating lead-in", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const sampleRateHz = 44100;
      const cycleDurationSeconds = 0.4;
      const pattern = createPulseLoopPattern(sampleRateHz, cycleDurationSeconds);
      const prefixFrames = Math.round(sampleRateHz * 0.2);
      const storageRef = "storage/audio/offset-loop.wav";
      const channels = repeatPattern(pattern, 3, prefixFrames);
      const frameCount = channels[0]?.length ?? 0;

      await writeWav(workspaceRoot, storageRef, sampleRateHz, channels);

      const suggestions = suggestLoopBoundaries(
        createAudioVersion(storageRef, sampleRateHz, channels.length, frameCount),
        {
          workspaceRoot,
          generatedAt: "2026-04-16T12:00:10Z",
        },
      );

      const topSuggestion = expectTopSuggestion(suggestions);
      expect(topSuggestion.start_seconds).toBeCloseTo(0.2, 2);
      expect(topSuggestion.end_seconds).toBeCloseTo(0.6, 2);
      expect(topSuggestion.duration_seconds).toBeCloseTo(0.4, 2);
      expect(topSuggestion.confidence).toBeGreaterThan(0.8);
      expect(isValidLoopBoundarySuggestionSet(suggestions)).toBe(true);
    });
  });

  it("returns no suggestions when adjacent repetition support is weak", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const sampleRateHz = 44100;
      const durationSeconds = 1.6;
      const storageRef = "storage/audio/non-repeating.wav";
      const channels = createNonRepeatingFixture(sampleRateHz, durationSeconds);
      const frameCount = channels[0]?.length ?? 0;

      await writeWav(workspaceRoot, storageRef, sampleRateHz, channels);

      const suggestions = suggestLoopBoundaries(
        createAudioVersion(storageRef, sampleRateHz, channels.length, frameCount),
        {
          workspaceRoot,
          generatedAt: "2026-04-16T12:00:10Z",
        },
      );

      expect(suggestions.suggestions).toHaveLength(0);
      expect(isValidLoopBoundarySuggestionSet(suggestions)).toBe(true);
    });
  });

  it("does not score silence-only regions as loop candidates", async () => {
    await withTempWorkspace(async (workspaceRoot) => {
      const sampleRateHz = 44100;
      const durationSeconds = 1.6;
      const storageRef = "storage/audio/silent.wav";
      const channels = createSilentFixture(sampleRateHz, durationSeconds);
      const frameCount = channels[0]?.length ?? 0;

      await writeWav(workspaceRoot, storageRef, sampleRateHz, channels);

      const suggestions = suggestLoopBoundaries(
        createAudioVersion(storageRef, sampleRateHz, channels.length, frameCount),
        {
          workspaceRoot,
          generatedAt: "2026-04-16T12:00:10Z",
        },
      );

      expect(suggestions.suggestions).toHaveLength(0);
      expect(isValidLoopBoundarySuggestionSet(suggestions)).toBe(true);
    });
  });
});
