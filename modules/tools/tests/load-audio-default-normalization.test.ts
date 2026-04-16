import { DEFAULT_NORMALIZATION_TARGET } from "@audio-language-interface/io";
import { describe, expect, it, vi } from "vitest";

import { executeToolRequest, type ToolsRuntime } from "../src/index.js";
import type { ToolRequest } from "../src/types.js";

function buildRequest(): ToolRequest {
  return {
    schema_version: "1.0.0",
    request_id: "toolreq_defaultnorm",
    tool_name: "load_audio",
    requested_at: "2026-04-14T20:20:08Z",
    arguments: {
      input_path: "fixtures/example.mp3",
    },
  };
}

describe("load_audio default normalization", () => {
  it("defaults to the WAV analysis target when no normalization target is supplied", async () => {
    const importAudioFromFile = vi.fn(async () => ({
      asset: {
        schema_version: "1.0.0",
        asset_id: "asset_example",
        display_name: "example.mp3",
        source: {
          kind: "file",
          uri: "fixtures/example.mp3",
          imported_at: "2026-04-14T20:20:08Z",
          checksum_sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
        media: {
          container_format: "wav",
          codec: "pcm_s16le",
          sample_rate_hz: 48_000,
          channels: 2,
          duration_seconds: 3,
        },
      },
      version: {
        schema_version: "1.0.0",
        version_id: "ver_example",
        asset_id: "asset_example",
        lineage: {
          created_at: "2026-04-14T20:20:08Z",
          created_by: "modules/io",
          reason: "initial import",
        },
        audio: {
          storage_ref: "storage/audio/ver_example.wav",
          sample_rate_hz: 48_000,
          channels: 2,
          duration_seconds: 3,
          frame_count: 144_000,
        },
        state: {
          is_original: true,
          is_preview: false,
        },
      },
      sourceMetadata: {
        sourcePath: "/tmp/workspace/fixtures/example.mp3",
        fileSizeBytes: 1,
        containerFormat: "mp3",
        codec: "mp3",
        sampleRateHz: 44_100,
        channels: 2,
        durationSeconds: 3,
        frameCount: 132_300,
      },
      materializedMetadata: {
        sourcePath: "/tmp/workspace/storage/audio/ver_example.wav",
        fileSizeBytes: 1,
        containerFormat: "wav",
        codec: "pcm_s16le",
        sampleRateHz: 48_000,
        channels: 2,
        durationSeconds: 3,
        frameCount: 144_000,
      },
      outputPath: "/tmp/workspace/storage/audio/ver_example.wav",
      normalized: true,
    }));

    await executeToolRequest(buildRequest(), {
      workspaceRoot: "/tmp/workspace",
      runtime: {
        importAudioFromFile: importAudioFromFile as unknown as ToolsRuntime["importAudioFromFile"],
      },
      now: () => new Date("2026-04-14T20:20:10Z"),
    });

    expect(importAudioFromFile).toHaveBeenCalledWith("fixtures/example.mp3", {
      workspaceRoot: "/tmp/workspace",
      normalizationTarget: DEFAULT_NORMALIZATION_TARGET,
    });
  });
});
