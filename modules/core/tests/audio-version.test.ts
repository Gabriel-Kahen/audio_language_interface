import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createAudioVersion, validateAudioVersion } from "../src/index.js";

const audioVersionExamplePath = new URL(
  "../../../contracts/examples/audio-version.json",
  import.meta.url,
);

describe("audio version", () => {
  it("validates the canonical example payload", () => {
    const payload = JSON.parse(readFileSync(audioVersionExamplePath, "utf8")) as unknown;
    const result = validateAudioVersion(payload);

    expect(result.ok).toBe(true);
  });

  it("creates a valid version with generated defaults", () => {
    const version = createAudioVersion({
      asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
      lineage: {
        created_by: "modules/io",
        reason: "initial import",
      },
      audio: {
        storage_ref: "storage/audio/original.wav",
        sample_rate_hz: 44_100,
        channels: 2,
        duration_seconds: 4,
        frame_count: 176_400,
        channel_layout: "stereo",
      },
      state: {
        is_original: true,
        is_preview: false,
      },
    });

    expect(validateAudioVersion(JSON.parse(JSON.stringify(version))).ok).toBe(true);
    expect(version.version_id).toMatch(/^ver_[A-Za-z0-9]+$/);
    expect(version.lineage.created_at).toMatch(/Z$/);
  });

  it("rejects self-parented versions", () => {
    const result = validateAudioVersion({
      schema_version: "1.0.0",
      version_id: "ver_abc123",
      asset_id: "asset_abc123",
      parent_version_id: "ver_abc123",
      lineage: {
        created_at: "2026-04-14T20:20:05Z",
        created_by: "modules/io",
      },
      audio: {
        storage_ref: "storage/audio/example.wav",
        sample_rate_hz: 44_100,
        channels: 2,
        duration_seconds: 4,
        frame_count: 176_400,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ instancePath: "/parent_version_id" })]),
      );
    }
  });

  it("rejects absolute storage references", () => {
    const result = validateAudioVersion({
      schema_version: "1.0.0",
      version_id: "ver_abc123",
      asset_id: "asset_abc123",
      lineage: {
        created_at: "2026-04-14T20:20:05Z",
        created_by: "modules/io",
      },
      audio: {
        storage_ref: "/tmp/example.wav",
        sample_rate_hz: 44_100,
        channels: 2,
        duration_seconds: 4,
        frame_count: 176_400,
      },
    });

    expect(result.ok).toBe(false);
  });

  it("rejects non-POSIX or traversing storage references", () => {
    const windowsPathResult = validateAudioVersion({
      schema_version: "1.0.0",
      version_id: "ver_abc123",
      asset_id: "asset_abc123",
      lineage: {
        created_at: "2026-04-14T20:20:05Z",
        created_by: "modules/io",
      },
      audio: {
        storage_ref: "storage\\audio\\example.wav",
        sample_rate_hz: 44_100,
        channels: 2,
        duration_seconds: 4,
        frame_count: 176_400,
      },
    });

    const traversalResult = validateAudioVersion({
      schema_version: "1.0.0",
      version_id: "ver_abc123",
      asset_id: "asset_abc123",
      lineage: {
        created_at: "2026-04-14T20:20:05Z",
        created_by: "modules/io",
      },
      audio: {
        storage_ref: "storage/../example.wav",
        sample_rate_hz: 44_100,
        channels: 2,
        duration_seconds: 4,
        frame_count: 176_400,
      },
    });

    expect(windowsPathResult.ok).toBe(false);
    expect(traversalResult.ok).toBe(false);
  });

  it("rejects frame counts that do not agree with duration", () => {
    const result = validateAudioVersion({
      schema_version: "1.0.0",
      version_id: "ver_abc123",
      asset_id: "asset_abc123",
      lineage: {
        created_at: "2026-04-14T20:20:05Z",
        created_by: "modules/io",
      },
      audio: {
        storage_ref: "storage/audio/example.wav",
        sample_rate_hz: 44_100,
        channels: 2,
        duration_seconds: 4,
        frame_count: 176_500,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ instancePath: "/audio/frame_count" })]),
      );
    }
  });
});
