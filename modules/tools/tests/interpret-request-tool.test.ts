import { describe, expect, it, vi } from "vitest";

import { describeTools, executeToolRequest, type ToolsRuntime } from "../src/index.js";

describe("interpret_request tool", () => {
  it("appears in the published tool surface", () => {
    expect(describeTools()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "interpret_request",
          backing_module: "interpretation",
        }),
      ]),
    );
  });

  it("routes explicit interpretation requests through the runtime and returns the artifact", async () => {
    const interpretRequest = vi.fn().mockResolvedValue({
      schema_version: "1.0.0",
      interpretation_id: "interpret_tool123",
      interpretation_policy: "best_effort",
      asset_id: "asset_example",
      version_id: "ver_example",
      analysis_report_id: "analysis_example",
      semantic_profile_id: "semantic_example",
      user_request: "Make it darker and cleaner.",
      normalized_request: "Make it darker and less harsh.",
      request_classification: "supported",
      next_action: "plan",
      normalized_objectives: ["darker", "less_harsh"],
      candidate_descriptors: ["bright", "harsh"],
      rationale: "The request maps to modest darker tonal balancing and harshness reduction.",
      confidence: 0.74,
      provider: {
        kind: "openai",
        model: "gpt-4.1-mini",
        prompt_version: "intent_v1",
      },
      generated_at: "2026-04-21T22:30:01Z",
    });

    const response = await executeToolRequest(
      {
        schema_version: "1.0.0",
        request_id: "toolreq_interpret123",
        tool_name: "interpret_request",
        requested_at: "2026-04-21T22:30:00Z",
        asset_id: "asset_example",
        version_id: "ver_example",
        arguments: {
          audio_version: {
            schema_version: "1.0.0",
            version_id: "ver_example",
            asset_id: "asset_example",
            lineage: {
              created_at: "2026-04-21T22:00:00Z",
              created_by: "modules/io",
            },
            audio: {
              storage_ref: "storage/audio/example.wav",
              sample_rate_hz: 44100,
              channels: 2,
              duration_seconds: 3,
              frame_count: 132300,
              channel_layout: "stereo",
            },
            state: {
              is_original: true,
              is_preview: false,
            },
          },
          analysis_report: {
            schema_version: "1.0.0",
            report_id: "analysis_example",
            asset_id: "asset_example",
            version_id: "ver_example",
            generated_at: "2026-04-21T22:00:01Z",
            analyzer: {
              name: "baseline",
              version: "0.1.0",
            },
            summary: {
              plain_text: "Bright stereo loop with mild harshness.",
            },
            measurements: {
              levels: {
                integrated_lufs: -14,
                true_peak_dbtp: -1,
                sample_peak_dbfs: -1.2,
                rms_dbfs: -17,
                headroom_db: 1,
              },
              dynamics: {
                crest_factor_db: 8,
                transient_density_per_second: 2,
                rms_short_term_dbfs: -17.4,
                dynamic_range_db: 6.2,
              },
              spectral_balance: {
                low_band_db: -10,
                mid_band_db: -8,
                high_band_db: -6.5,
                brightness_tilt_db: 3.5,
                harshness_ratio_db: 2.4,
                spectral_centroid_hz: 2800,
              },
              stereo: {
                width: 0.6,
                correlation: 0.2,
                balance_db: 0.4,
              },
              artifacts: {
                clipping_detected: false,
                noise_floor_dbfs: -68,
                clipped_sample_count: 0,
                hum_detected: false,
                hum_harmonic_count: 0,
                click_detected: false,
                click_count: 0,
                click_rate_per_second: 0,
              },
            },
            annotations: [],
          },
          semantic_profile: {
            schema_version: "1.0.0",
            profile_id: "semantic_example",
            analysis_report_id: "analysis_example",
            asset_id: "asset_example",
            version_id: "ver_example",
            generated_at: "2026-04-21T22:00:02Z",
            descriptors: [
              {
                label: "bright",
                confidence: 0.81,
                evidence_refs: ["analysis_example:measurements.spectral_balance"],
                rationale: "The high band is elevated relative to the mids.",
              },
            ],
            unresolved_terms: ["harsh"],
            summary: {
              plain_text: "Bright loop with possible mild harshness.",
            },
          },
          user_request: "Make it darker and cleaner.",
          interpretation_policy: "best_effort",
          session_context: {
            current_version_id: "ver_example",
            previous_request: "Make it darker.",
            original_user_request: "not that much",
            follow_up_source: "repeat_last_request",
          },
          provider: {
            kind: "openai",
            api_key: "sk-example",
            model: "gpt-4.1-mini",
            temperature: 0,
            max_retries: 1,
          },
        },
      },
      {
        workspaceRoot: "/tmp/ali-tools",
        runtime: { interpretRequest } satisfies Partial<ToolsRuntime>,
      },
    );

    expect(response.status).toBe("ok");
    expect(interpretRequest).toHaveBeenCalledTimes(1);
    expect(interpretRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: "best_effort",
        sessionContext: {
          current_version_id: "ver_example",
          previous_request: "Make it darker.",
          original_user_request: "not that much",
          follow_up_source: "repeat_last_request",
        },
        provider: expect.objectContaining({
          maxRetries: 1,
        }),
      }),
    );
    expect(response.result?.intent_interpretation).toMatchObject({
      interpretation_id: "interpret_tool123",
      interpretation_policy: "best_effort",
      normalized_request: "Make it darker and less harsh.",
    });
  });

  it("accepts codex_cli provider arguments without an api key", async () => {
    const interpretRequest = vi.fn().mockResolvedValue({
      schema_version: "1.0.0",
      interpretation_id: "interpret_codex123",
      interpretation_policy: "best_effort",
      asset_id: "asset_example",
      version_id: "ver_example",
      analysis_report_id: "analysis_example",
      semantic_profile_id: "semantic_example",
      user_request: "Clean it up a bit.",
      normalized_request: "Reduce steady background noise conservatively.",
      request_classification: "supported",
      next_action: "plan",
      normalized_objectives: ["cleaner", "denoise"],
      candidate_descriptors: ["cleaner"],
      rationale: "Codex CLI selected the strongest grounded cleanup interpretation.",
      confidence: 0.62,
      provider: {
        kind: "codex_cli",
        model: "chatgpt",
        prompt_version: "intent_v2",
      },
      generated_at: "2026-04-27T20:30:01Z",
    });

    const response = await executeToolRequest(
      {
        schema_version: "1.0.0",
        request_id: "toolreq_interpretcodex123",
        tool_name: "interpret_request",
        requested_at: "2026-04-27T20:30:00Z",
        asset_id: "asset_example",
        version_id: "ver_example",
        arguments: {
          audio_version: {
            schema_version: "1.0.0",
            version_id: "ver_example",
            asset_id: "asset_example",
            lineage: {
              created_at: "2026-04-21T22:00:00Z",
              created_by: "modules/io",
            },
            audio: {
              storage_ref: "storage/audio/example.wav",
              sample_rate_hz: 44100,
              channels: 2,
              duration_seconds: 3,
              frame_count: 132300,
              channel_layout: "stereo",
            },
            state: {
              is_original: true,
              is_preview: false,
            },
          },
          analysis_report: {
            schema_version: "1.0.0",
            report_id: "analysis_example",
            asset_id: "asset_example",
            version_id: "ver_example",
            generated_at: "2026-04-21T22:00:01Z",
            analyzer: {
              name: "baseline",
              version: "0.1.0",
            },
            summary: {
              plain_text: "Bright stereo loop with mild harshness.",
            },
            measurements: {
              levels: {
                integrated_lufs: -14,
                true_peak_dbtp: -1,
                sample_peak_dbfs: -1.2,
                rms_dbfs: -17,
                headroom_db: 1,
              },
              dynamics: {
                crest_factor_db: 8,
                transient_density_per_second: 2,
                rms_short_term_dbfs: -17.4,
                dynamic_range_db: 6.2,
              },
              spectral_balance: {
                low_band_db: -10,
                mid_band_db: -8,
                high_band_db: -6.5,
                brightness_tilt_db: 3.5,
                harshness_ratio_db: 2.4,
                spectral_centroid_hz: 2800,
              },
              stereo: {
                width: 0.6,
                correlation: 0.2,
                balance_db: 0.4,
              },
              artifacts: {
                clipping_detected: false,
                noise_floor_dbfs: -68,
                clipped_sample_count: 0,
                hum_detected: false,
                hum_harmonic_count: 0,
                click_detected: false,
                click_count: 0,
                click_rate_per_second: 0,
              },
            },
            annotations: [],
          },
          semantic_profile: {
            schema_version: "1.0.0",
            profile_id: "semantic_example",
            analysis_report_id: "analysis_example",
            asset_id: "asset_example",
            version_id: "ver_example",
            generated_at: "2026-04-21T22:00:02Z",
            descriptors: [],
            unresolved_terms: [],
            summary: {
              plain_text: "Relatively clean loop.",
            },
          },
          user_request: "Clean it up a bit.",
          interpretation_policy: "best_effort",
          provider: {
            kind: "codex_cli",
            profile: "chatgpt",
            max_retries: 2,
          },
        },
      },
      {
        workspaceRoot: "/tmp/ali-tools",
        runtime: { interpretRequest } satisfies Partial<ToolsRuntime>,
      },
    );

    expect(response.status).toBe("ok");
    expect(interpretRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: {
          kind: "codex_cli",
          profile: "chatgpt",
          maxRetries: 2,
        },
      }),
    );
    expect(response.result?.intent_interpretation).toMatchObject({
      interpretation_id: "interpret_codex123",
      provider: {
        kind: "codex_cli",
        model: "chatgpt",
      },
    });
  });
});
