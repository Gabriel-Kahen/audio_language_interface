import type { AnalysisReport } from "@audio-language-interface/analysis";
import { defaultRuntimeCapabilityManifest } from "@audio-language-interface/capabilities";
import type { AudioVersion } from "@audio-language-interface/core";
import type { SemanticProfile } from "@audio-language-interface/semantics";
import { describe, expect, it } from "vitest";

import { assertValidIntentInterpretation, interpretRequest } from "../src/index.js";

describe("interpretRequest", () => {
  it("builds a validated interpretation artifact from an OpenAI response", async () => {
    const interpretation = await interpretRequest({
      userRequest: "Give this more sparkle and tame the annoying esses.",
      audioVersion: createAudioVersion(),
      analysisReport: createAnalysisReport(),
      semanticProfile: createSemanticProfile(),
      capabilityManifest: defaultRuntimeCapabilityManifest,
      provider: {
        kind: "openai",
        apiKey: "test-key",
        model: "gpt-4.1-mini",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    normalized_request: "Make it airier and tame the sibilance.",
                    request_classification: "supported_but_underspecified",
                    normalized_objectives: ["more_air", "tame_sibilance"],
                    candidate_descriptors: ["airy", "sibilant"],
                    clarification_question:
                      "Should the priority be added air or less sibilance first?",
                    rationale:
                      "The request maps toward upper-band lift plus sibilance control, which the current baseline planner treats as a clarification case.",
                    confidence: 0.81,
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
    });

    assertValidIntentInterpretation(interpretation);
    expect(interpretation.user_request).toBe("Give this more sparkle and tame the annoying esses.");
    expect(interpretation.normalized_request).toBe("Make it airier and tame the sibilance.");
    expect(interpretation.provider.kind).toBe("openai");
  });

  it("builds a validated interpretation artifact from a Google response", async () => {
    const interpretation = await interpretRequest({
      userRequest: "Make this feel more centered and a touch wider.",
      audioVersion: createAudioVersion(),
      analysisReport: createAnalysisReport(),
      semanticProfile: createSemanticProfile(),
      capabilityManifest: defaultRuntimeCapabilityManifest,
      provider: {
        kind: "google",
        apiKey: "test-key",
        model: "gemini-2.5-flash",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        normalized_request: "Center this more and make it wider.",
                        request_classification: "supported",
                        normalized_objectives: ["more_centered", "wider"],
                        candidate_descriptors: ["off_center", "wide"],
                        rationale:
                          "The request maps cleanly onto the current conservative stereo balance and width prompt family.",
                        confidence: 0.76,
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
    });

    expect(interpretation.normalized_request).toBe("Center this more and make it wider.");
    expect(interpretation.provider.kind).toBe("google");
  });

  it("fails when the provider returns invalid structured JSON", async () => {
    await expect(
      interpretRequest({
        userRequest: "Make it crunchy.",
        audioVersion: createAudioVersion(),
        analysisReport: createAnalysisReport(),
        semanticProfile: createSemanticProfile(),
        capabilityManifest: defaultRuntimeCapabilityManifest,
        provider: {
          kind: "openai",
          apiKey: "test-key",
          model: "gpt-4.1-mini",
        },
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"bad":true}' } }],
            }),
            { status: 200 },
          ),
      }),
    ).rejects.toThrow(/invalid candidate payload/i);
  });
});

function createAudioVersion(): AudioVersion {
  return {
    schema_version: "1.0.0",
    version_id: "ver_interp123",
    asset_id: "asset_interp123",
    lineage: {
      created_at: "2026-04-21T20:00:00Z",
      created_by: "tests",
    },
    audio: {
      storage_ref: "storage/audio/interp.wav",
      sample_rate_hz: 44100,
      channels: 2,
      duration_seconds: 2.4,
      frame_count: 105840,
      channel_layout: "stereo",
    },
    state: {
      is_original: true,
      is_preview: false,
    },
  };
}

function createAnalysisReport(): AnalysisReport {
  return {
    schema_version: "1.0.0",
    report_id: "analysis_interp123",
    asset_id: "asset_interp123",
    version_id: "ver_interp123",
    generated_at: "2026-04-21T20:00:01Z",
    analyzer: {
      name: "test-analyzer",
      version: "1.0.0",
    },
    summary: {
      plain_text:
        "Slightly bright stereo clip with mild sibilance and a small right-leaning image.",
    },
    measurements: {
      spectral_balance: {
        low_band_db: -14,
        mid_band_db: -11.5,
        high_band_db: -8.5,
        brightness_tilt_db: 5.5,
        harshness_ratio_db: 3,
        spectral_centroid_hz: 3100,
      },
      dynamics: {
        dynamic_range_db: 7.2,
        crest_factor_db: 8.5,
        transient_density_per_second: 1.4,
        rms_short_term_dbfs: -20.2,
      },
      levels: {
        integrated_lufs: -16,
        true_peak_dbtp: -1.4,
        sample_peak_dbfs: -1.8,
        rms_dbfs: -18.5,
        headroom_db: 1.8,
      },
      stereo: {
        width: 0.28,
        correlation: 0.62,
        balance_db: 1.9,
      },
      artifacts: {
        clipping_detected: false,
        noise_floor_dbfs: -70,
        clipped_sample_count: 0,
        hum_detected: false,
        hum_harmonic_count: 0,
        click_detected: false,
        click_count: 0,
        click_rate_per_second: 0,
      },
    },
    annotations: [],
  };
}

function createSemanticProfile(): SemanticProfile {
  return {
    schema_version: "1.0.0",
    profile_id: "semantic_interp123",
    analysis_report_id: "analysis_interp123",
    asset_id: "asset_interp123",
    version_id: "ver_interp123",
    generated_at: "2026-04-21T20:00:02Z",
    descriptors: [
      {
        label: "bright",
        confidence: 0.78,
        evidence_refs: ["analysis_interp123:measurements.spectral_balance"],
        rationale: "Top-end energy is clearly elevated.",
      },
      {
        label: "off_center",
        confidence: 0.72,
        evidence_refs: ["analysis_interp123:measurements.stereo"],
        rationale: "Stereo balance is measurably right-leaning.",
      },
    ],
    unresolved_terms: ["sibilant"],
    summary: {
      plain_text: "Bright stereo clip with a mild rightward imbalance.",
    },
  };
}
