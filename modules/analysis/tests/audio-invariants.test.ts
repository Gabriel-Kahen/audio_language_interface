import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { analyzeAudioVersion, isValidAnalysisReport } from "@audio-language-interface/analysis";
import type { AudioVersion } from "@audio-language-interface/core";
import { afterEach, describe, expect, it } from "vitest";
import { WaveFile } from "wavefile";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("analysis audio invariants", () => {
  it("rejects AudioVersion metadata that does not match the decoded WAV", async () => {
    const workspaceRoot = await createWorkspace();
    const storageRef = "storage/audio/source.wav";
    await writeSineWav(path.join(workspaceRoot, storageRef), {
      sampleRateHz: 44100,
      channels: 1,
      durationSeconds: 0.5,
    });

    const version = createVersion(storageRef, {
      sampleRateHz: 48000,
      channels: 1,
      durationSeconds: 0.5,
    });

    await expect(analyzeAudioVersion(version, { workspaceRoot })).rejects.toThrow(
      /sample_rate_hz declared 48000 but decoded 44100/u,
    );
  });

  it("emits schema-valid reports with explicit measured sample-domain fields", async () => {
    const workspaceRoot = await createWorkspace();
    const storageRef = "storage/audio/source.wav";
    await writeSineWav(path.join(workspaceRoot, storageRef), {
      sampleRateHz: 44100,
      channels: 1,
      durationSeconds: 0.5,
    });

    const report = await analyzeAudioVersion(createVersion(storageRef), {
      workspaceRoot,
      generatedAt: "2026-04-28T12:00:00Z",
    });

    expect(isValidAnalysisReport(report)).toBe(true);
    expect(report.generated_at).toBe("2026-04-28T12:00:00Z");
    expect(report.measurements.levels.rms_dbfs).toEqual(expect.any(Number));
    expect(report.measurements.levels.sample_peak_dbfs).toEqual(expect.any(Number));
    expect(report.measurements.levels.headroom_db).toEqual(expect.any(Number));
    expect(report.measurements.artifacts.clipping_detected).toBe(false);
  });
});

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "analysis-invariants-"));
  tempDirs.push(workspaceRoot);
  return workspaceRoot;
}

function createVersion(
  storageRef: string,
  options: { sampleRateHz?: number; channels?: number; durationSeconds?: number } = {},
): AudioVersion {
  const sampleRateHz = options.sampleRateHz ?? 44100;
  const channels = options.channels ?? 1;
  const durationSeconds = options.durationSeconds ?? 0.5;
  return {
    schema_version: "1.0.0",
    version_id: "ver_01HYANALYSISINVARIANT001",
    asset_id: "asset_01HYANALYSISINVARIANT1",
    lineage: { created_at: "2026-04-28T11:59:00Z", created_by: "modules/io" },
    audio: {
      storage_ref: storageRef,
      sample_rate_hz: sampleRateHz,
      channels,
      duration_seconds: durationSeconds,
      frame_count: Math.round(sampleRateHz * durationSeconds),
      channel_layout: channels === 1 ? "mono" : "stereo",
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
  const samples = Array.from({ length: options.channels }, () =>
    Array.from({ length: frameCount }, (_, frame) =>
      Math.round(Math.sin((2 * Math.PI * 440 * frame) / options.sampleRateHz) * 10000),
    ),
  );
  const wav = new WaveFile();
  wav.fromScratch(options.channels, options.sampleRateHz, "16", samples);
  await writeFile(filePath, Buffer.from(wav.toBuffer()));
}
