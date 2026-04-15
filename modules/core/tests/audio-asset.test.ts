import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createAudioAsset, validateAudioAsset } from "../src/index.js";

const audioAssetExamplePath = new URL(
  "../../../contracts/examples/audio-asset.json",
  import.meta.url,
);

describe("audio asset", () => {
  it("validates the canonical example payload", () => {
    const payload = JSON.parse(readFileSync(audioAssetExamplePath, "utf8")) as unknown;
    const result = validateAudioAsset(payload);

    expect(result.ok).toBe(true);
  });

  it("creates a valid asset with generated defaults", () => {
    const asset = createAudioAsset({
      display_name: "snare_loop.wav",
      source: {
        kind: "file",
        uri: "fixtures/audio/snare_loop.wav",
      },
      media: {
        container_format: "wav",
        codec: "pcm_s16le",
        sample_rate_hz: 44_100,
        channels: 2,
        duration_seconds: 4,
      },
      tags: ["drum", "loop"],
    });

    expect(validateAudioAsset(JSON.parse(JSON.stringify(asset))).ok).toBe(true);
    expect(asset.asset_id).toMatch(/^asset_[A-Za-z0-9]+$/);
    expect(asset.source.imported_at).toMatch(/Z$/);
  });

  it("preserves an explicitly empty notes field", () => {
    const asset = createAudioAsset({
      display_name: "snare_loop.wav",
      source: {
        kind: "file",
        uri: "fixtures/audio/snare_loop.wav",
      },
      media: {
        container_format: "wav",
        codec: "pcm_s16le",
        sample_rate_hz: 44_100,
        channels: 2,
        duration_seconds: 4,
      },
      notes: "",
    });

    expect(asset).toHaveProperty("notes", "");
    expect(validateAudioAsset(JSON.parse(JSON.stringify(asset))).ok).toBe(true);
  });

  it("rejects invalid timestamps even when the schema format would allow offsets", () => {
    const result = validateAudioAsset({
      schema_version: "1.0.0",
      asset_id: "asset_abc123",
      display_name: "snare_loop.wav",
      source: {
        kind: "file",
        imported_at: "2026-04-14T20:20:00+02:00",
      },
      media: {
        container_format: "wav",
        codec: "pcm_s16le",
        sample_rate_hz: 44_100,
        channels: 2,
        duration_seconds: 4,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ instancePath: "/source/imported_at" })]),
      );
    }
  });

  it("rejects invalid calendar timestamps that the Date parser would normalize", () => {
    const result = validateAudioAsset({
      schema_version: "1.0.0",
      asset_id: "asset_abc123",
      display_name: "snare_loop.wav",
      source: {
        kind: "file",
        imported_at: "2026-02-30T20:20:00Z",
      },
      media: {
        container_format: "wav",
        codec: "pcm_s16le",
        sample_rate_hz: 44_100,
        channels: 2,
        duration_seconds: 4,
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ instancePath: "/source/imported_at" })]),
      );
    }
  });
});
