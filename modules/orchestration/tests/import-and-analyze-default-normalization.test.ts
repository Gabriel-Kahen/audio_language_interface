import { DEFAULT_NORMALIZATION_TARGET } from "@audio-language-interface/io";
import { describe, expect, it, vi } from "vitest";

import { importAndAnalyze, type OrchestrationDependencies } from "../src/index.js";

describe("importAndAnalyze default normalization", () => {
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
    const analyzeAudioVersion = vi.fn(async (version: { version_id: string }) => ({
      schema_version: "1.0.0",
      report_id: "analysis_example",
      asset_id: "asset_example",
      version_id: version.version_id,
      generated_at: "2026-04-14T20:20:09Z",
      analyzer: {
        name: "baseline",
        version: "0.1.0",
      },
      summary: {
        plain_text: "Example analysis.",
      },
      measurements: {
        levels: {
          integrated_lufs: -14,
          true_peak_dbtp: -1,
          rms_dbfs: -18,
          sample_peak_dbfs: -1,
          headroom_db: 1,
        },
        dynamics: {
          crest_factor_db: 8,
          transient_density_per_second: 2,
          rms_short_term_dbfs: -16,
          dynamic_range_db: 12,
        },
        spectral_balance: {
          low_band_db: -10,
          mid_band_db: -8,
          high_band_db: -12,
          spectral_centroid_hz: 1800,
        },
        stereo: {
          width: 0.7,
          correlation: 0.1,
          balance_db: 0,
        },
        artifacts: {
          clipping_detected: false,
          noise_floor_dbfs: -60,
          clipped_sample_count: 0,
        },
      },
    }));

    await importAndAnalyze({
      inputPath: "fixtures/example.mp3",
      dependencies: {
        importAudioFromFile:
          importAudioFromFile as unknown as OrchestrationDependencies["importAudioFromFile"],
        analyzeAudioVersion:
          analyzeAudioVersion as unknown as OrchestrationDependencies["analyzeAudioVersion"],
      },
    });

    expect(importAudioFromFile).toHaveBeenCalledWith("fixtures/example.mp3", {
      normalizationTarget: DEFAULT_NORMALIZATION_TARGET,
    });
    expect(analyzeAudioVersion).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ version_id: "ver_example" }),
      undefined,
    );
  });
});
