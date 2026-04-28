import { readFileSync } from "node:fs";

import type { AnalysisAnnotation, AnalysisReport } from "@audio-language-interface/analysis";
import { describe, expect, it } from "vitest";

import { buildSemanticProfile, isValidSemanticProfile } from "../src/index.js";

type ReportOverrides = Omit<Partial<AnalysisReport>, "measurements"> & {
  measurements?: Omit<
    Partial<AnalysisReport["measurements"]>,
    "levels" | "dynamics" | "spectral_balance" | "stereo" | "artifacts"
  > & {
    levels?: Partial<AnalysisReport["measurements"]["levels"]>;
    dynamics?: Partial<AnalysisReport["measurements"]["dynamics"]>;
    spectral_balance?: Partial<AnalysisReport["measurements"]["spectral_balance"]>;
    stereo?: Partial<AnalysisReport["measurements"]["stereo"]>;
    artifacts?: Partial<AnalysisReport["measurements"]["artifacts"]>;
  };
};

function loadExampleReport(): AnalysisReport {
  const fileUrl = new URL("../../../contracts/examples/analysis-report.json", import.meta.url);
  return JSON.parse(readFileSync(fileUrl, "utf8")) as AnalysisReport;
}

function createDynamics(
  overrides: Partial<AnalysisReport["measurements"]["dynamics"]> = {},
): AnalysisReport["measurements"]["dynamics"] {
  const base = loadExampleReport().measurements.dynamics;
  const crestFactorDb = overrides.crest_factor_db ?? base.crest_factor_db ?? 10.3;
  const transientDensityPerSecond =
    overrides.transient_density_per_second ?? base.transient_density_per_second ?? 2;

  return {
    crest_factor_db: crestFactorDb,
    transient_density_per_second: transientDensityPerSecond,
    rms_short_term_dbfs: overrides.rms_short_term_dbfs ?? base.rms_short_term_dbfs ?? -18,
    dynamic_range_db: overrides.dynamic_range_db ?? base.dynamic_range_db ?? 8,
    transient_crest_db: overrides.transient_crest_db ?? crestFactorDb,
    punch_window_ratio:
      overrides.punch_window_ratio ??
      (transientDensityPerSecond >= 1.5 && crestFactorDb >= 10 ? 0.5 : 0.12),
  };
}

function createSpectralBalance(
  overrides: Partial<AnalysisReport["measurements"]["spectral_balance"]> = {},
): AnalysisReport["measurements"]["spectral_balance"] {
  const base = loadExampleReport().measurements.spectral_balance;
  const lowBandDb = overrides.low_band_db ?? base.low_band_db;
  const midBandDb = overrides.mid_band_db ?? base.mid_band_db;
  const highBandDb = overrides.high_band_db ?? base.high_band_db;

  return {
    low_band_db: lowBandDb,
    mid_band_db: midBandDb,
    high_band_db: highBandDb,
    spectral_centroid_hz: overrides.spectral_centroid_hz ?? base.spectral_centroid_hz,
    brightness_tilt_db: overrides.brightness_tilt_db ?? highBandDb - lowBandDb,
    presence_band_db: overrides.presence_band_db ?? highBandDb,
    harshness_ratio_db: overrides.harshness_ratio_db ?? highBandDb - midBandDb,
  };
}

function createReport(overrides: ReportOverrides = {}): AnalysisReport {
  return {
    ...loadExampleReport(),
    ...overrides,
    summary: {
      ...loadExampleReport().summary,
      ...overrides.summary,
    },
    measurements: {
      ...loadExampleReport().measurements,
      ...overrides.measurements,
      dynamics: createDynamics(overrides.measurements?.dynamics),
      spectral_balance: createSpectralBalance(overrides.measurements?.spectral_balance),
      stereo: {
        ...loadExampleReport().measurements.stereo,
        balance_db: 0,
        ...overrides.measurements?.stereo,
      },
      artifacts: {
        ...loadExampleReport().measurements.artifacts,
        clipped_sample_count: 0,
        ...overrides.measurements?.artifacts,
      },
      levels: {
        ...loadExampleReport().measurements.levels,
        rms_dbfs: -16,
        sample_peak_dbfs: -1.5,
        headroom_db: 1.5,
        ...overrides.measurements?.levels,
      },
    },
  };
}

function createAnnotation(annotation: AnalysisAnnotation): AnalysisAnnotation {
  return annotation;
}

describe("buildSemanticProfile", () => {
  it("builds a contract-aligned profile from bright and spatial evidence", () => {
    const report = createReport({
      annotations: [
        ...(loadExampleReport().annotations ?? []),
        {
          kind: "stereo_width",
          start_seconds: 0,
          end_seconds: 4,
          severity: 0.58,
          evidence: "stable side energy reaches width 0.62 with local correlation 0.41",
        },
        {
          kind: "transient_impact",
          start_seconds: 0,
          end_seconds: 4,
          bands_hz: [60, 4000],
          severity: 0.64,
          evidence: "window crest 12.1 dB at -18.4 dBFS short-term level",
        },
      ],
    });

    const profile = buildSemanticProfile(report);
    const labels = profile.descriptors.map((descriptor) => descriptor.label);

    expect(isValidSemanticProfile(profile)).toBe(true);
    expect(labels).toContain("bright");
    expect(labels).toContain("wide");
    expect(labels).toContain("punchy");
    expect(labels).toContain("slightly_harsh");
    expect(profile.descriptors.every((descriptor) => descriptor.evidence_refs.length > 0)).toBe(
      true,
    );
    expect(profile.summary.plain_text).toContain("suggests a drum loop");
  });

  it("maps clipping and collapsed width into explicit descriptors without inferring cleanliness", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          stereo: {
            width: 0.02,
            correlation: 1,
            balance_db: 0,
          },
          artifacts: {
            clipping_detected: true,
            noise_floor_dbfs: -42,
            clipped_sample_count: 128,
          },
          spectral_balance: createSpectralBalance({
            low_band_db: -12,
            mid_band_db: -11,
            high_band_db: -12.5,
            spectral_centroid_hz: 2000,
          }),
          dynamics: createDynamics({
            crest_factor_db: 7.5,
            transient_density_per_second: 0.9,
            rms_short_term_dbfs: -18,
            dynamic_range_db: 5,
          }),
        },
        annotations: [],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).toEqual(
      expect.arrayContaining(["mono", "clipped", "balanced"]),
    );
    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toEqual(
      expect.arrayContaining(["clean", "noisy"]),
    );
  });

  it("assigns distorted and crunchy when clipped peaks also keep bright transient bite", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          levels: {
            ...loadExampleReport().measurements.levels,
            integrated_lufs: -12.2,
            true_peak_dbtp: -0.2,
            rms_dbfs: -14,
            sample_peak_dbfs: -0.1,
            headroom_db: 0.1,
          },
          dynamics: createDynamics({
            crest_factor_db: 10.8,
            transient_density_per_second: 1.9,
            rms_short_term_dbfs: -14.8,
            dynamic_range_db: 7.4,
            transient_crest_db: 10.1,
            punch_window_ratio: 0.34,
          }),
          spectral_balance: createSpectralBalance({
            low_band_db: -15.5,
            mid_band_db: -11.4,
            high_band_db: -7.9,
            spectral_centroid_hz: 2860,
            brightness_tilt_db: 7.6,
            presence_band_db: -8.3,
            harshness_ratio_db: 4.8,
          }),
          artifacts: {
            clipping_detected: true,
            noise_floor_dbfs: -67,
            clipped_sample_count: 96,
          },
        },
        annotations: [
          createAnnotation({
            kind: "transient_impact",
            start_seconds: 0,
            end_seconds: 4,
            bands_hz: [80, 5000],
            severity: 0.52,
            evidence: "hard transient windows keep biting upper-mid peaks",
          }),
          createAnnotation({
            kind: "harshness",
            start_seconds: 0,
            end_seconds: 4,
            bands_hz: [2800, 5200],
            severity: 0.43,
            evidence: "bright clipped ridge keeps upper-mid bite elevated",
          }),
        ],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).toEqual(
      expect.arrayContaining(["clipped", "distorted", "crunchy"]),
    );
  });

  it("keeps borderline evidence unresolved instead of over-assigning descriptors", () => {
    const profile = buildSemanticProfile(
      createReport({
        summary: {
          plain_text: "Low-confidence baseline analysis.",
          confidence: 0.5,
        },
        measurements: {
          ...loadExampleReport().measurements,
          spectral_balance: createSpectralBalance({
            low_band_db: -14,
            mid_band_db: -12,
            high_band_db: -9.5,
            spectral_centroid_hz: 2000,
          }),
          stereo: {
            width: 0.3,
            correlation: 0.7,
            balance_db: 0,
          },
          dynamics: createDynamics({
            crest_factor_db: 8,
            transient_density_per_second: 1.1,
            rms_short_term_dbfs: -18,
            dynamic_range_db: 6,
          }),
          artifacts: {
            clipping_detected: false,
            noise_floor_dbfs: -68,
            clipped_sample_count: 0,
          },
        },
        annotations: [
          {
            kind: "harshness",
            start_seconds: 0,
            end_seconds: 4,
            bands_hz: [3000, 4500],
            severity: 0.24,
            evidence: "mild upper-mid ridge",
          },
        ],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).toEqual([]);
    expect(profile.unresolved_terms).toEqual(["bright", "controlled", "slightly_harsh", "wide"]);
    expect(profile.summary.caveats).toBeDefined();
  });

  it("assigns dark only when low-frequency tilt and centroid both support it", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          spectral_balance: createSpectralBalance({
            low_band_db: -9,
            mid_band_db: -10.5,
            high_band_db: -15.5,
            spectral_centroid_hz: 1650,
          }),
        },
        annotations: [],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).toContain("dark");
    expect(profile.unresolved_terms ?? []).not.toContain("dark");
  });

  it("keeps tonal balance unresolved when band tilt is neutral but centroid remains elevated", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          spectral_balance: createSpectralBalance({
            low_band_db: -12,
            mid_band_db: -10,
            high_band_db: -10.4,
            spectral_centroid_hz: 2825,
          }),
        },
        annotations: [],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("balanced");
    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("bright");
    expect(profile.unresolved_terms).toContain("bright");
  });

  it("assigns muddy when low-mid buildup clearly outweighs upper presence", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          spectral_balance: createSpectralBalance({
            low_band_db: -14,
            mid_band_db: -8,
            high_band_db: -13,
            spectral_centroid_hz: 1600,
          }),
        },
        annotations: [],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).toContain("muddy");
    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("warm");
  });

  it("assigns warm when low-band weight is present without muddy masking", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          spectral_balance: createSpectralBalance({
            low_band_db: -10,
            mid_band_db: -11.2,
            high_band_db: -13.2,
            spectral_centroid_hz: 1900,
          }),
        },
        annotations: [],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).toContain("warm");
    expect(profile.unresolved_terms ?? []).not.toContain("warm");
  });

  it("assigns relaxed when transients and upper-band bite are both restrained", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          levels: {
            ...loadExampleReport().measurements.levels,
            integrated_lufs: -17.1,
            true_peak_dbtp: -3.1,
            rms_dbfs: -18.2,
            sample_peak_dbfs: -3.6,
            headroom_db: 3.6,
          },
          dynamics: createDynamics({
            crest_factor_db: 7.8,
            transient_density_per_second: 0.82,
            rms_short_term_dbfs: -17.3,
            dynamic_range_db: 6.1,
            transient_crest_db: 7.6,
            punch_window_ratio: 0.1,
          }),
          spectral_balance: createSpectralBalance({
            low_band_db: -12.8,
            mid_band_db: -11.7,
            high_band_db: -10.9,
            spectral_centroid_hz: 2120,
            brightness_tilt_db: 1.9,
            presence_band_db: -11.2,
            harshness_ratio_db: 0.5,
          }),
          artifacts: {
            clipping_detected: false,
            noise_floor_dbfs: -70,
            clipped_sample_count: 0,
          },
        },
        annotations: [],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).toContain("relaxed");
    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("aggressive");
  });

  it("assigns aggressive when punchy transients and upper-band bite combine", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          levels: {
            ...loadExampleReport().measurements.levels,
            integrated_lufs: -13.9,
            true_peak_dbtp: -1.1,
            rms_dbfs: -15.5,
            sample_peak_dbfs: -1.4,
            headroom_db: 1.4,
          },
          dynamics: createDynamics({
            crest_factor_db: 10.7,
            transient_density_per_second: 1.85,
            rms_short_term_dbfs: -16.1,
            dynamic_range_db: 7.5,
            transient_crest_db: 10.2,
            punch_window_ratio: 0.32,
          }),
          spectral_balance: createSpectralBalance({
            low_band_db: -16.5,
            mid_band_db: -12.3,
            high_band_db: -8.1,
            spectral_centroid_hz: 2940,
            brightness_tilt_db: 8.4,
            presence_band_db: -8.5,
            harshness_ratio_db: 4.2,
          }),
        },
        annotations: [
          createAnnotation({
            kind: "transient_impact",
            start_seconds: 0,
            end_seconds: 4,
            bands_hz: [70, 4200],
            severity: 0.46,
            evidence: "strong repeated impact windows stay forward in the mix",
          }),
          createAnnotation({
            kind: "harshness",
            start_seconds: 0,
            end_seconds: 4,
            bands_hz: [3000, 4800],
            severity: 0.41,
            evidence: "persistent upper-mid bite remains clearly elevated",
          }),
        ],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).toEqual(
      expect.arrayContaining(["aggressive", "punchy"]),
    );
  });

  it("assigns airy only when top-end lift stays open rather than harsh", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          spectral_balance: createSpectralBalance({
            low_band_db: -18,
            mid_band_db: -13,
            high_band_db: -10.5,
            spectral_centroid_hz: 3200,
          }),
        },
        annotations: [],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).toEqual(
      expect.arrayContaining(["bright", "airy"]),
    );
    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("sibilant");
  });

  it("assigns sibilant when strong upper-presence harshness evidence is explicit", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          spectral_balance: createSpectralBalance({
            low_band_db: -18,
            mid_band_db: -14,
            high_band_db: -7,
            spectral_centroid_hz: 3100,
          }),
        },
        annotations: [
          createAnnotation({
            kind: "harshness",
            start_seconds: 0,
            end_seconds: 4,
            bands_hz: [2500, 6000],
            severity: 0.68,
            evidence: "presence-band energy spikes sharply on consonant bursts around 5 kHz",
          }),
        ],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).toEqual(
      expect.arrayContaining(["sibilant", "slightly_harsh"]),
    );
    expect(profile.unresolved_terms ?? []).not.toContain("sibilant");
  });

  it("keeps near-threshold punch evidence unresolved", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          dynamics: createDynamics({
            crest_factor_db: 9.1,
            transient_density_per_second: 1.25,
            rms_short_term_dbfs: -18,
            dynamic_range_db: 6,
          }),
        },
        annotations: [
          {
            kind: "transient_impact",
            start_seconds: 0,
            end_seconds: 4,
            bands_hz: [60, 4000],
            severity: 0.24,
            evidence: "window crest 8.1 dB at -20.0 dBFS short-term level",
          },
        ],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("punchy");
    expect(profile.unresolved_terms).toContain("punchy");
  });

  it("assigns controlled when dynamics stay moderate and contained", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          levels: {
            ...loadExampleReport().measurements.levels,
            integrated_lufs: -16,
            true_peak_dbtp: -3,
            rms_dbfs: -17,
            sample_peak_dbfs: -4,
            headroom_db: 4,
          },
          dynamics: createDynamics({
            crest_factor_db: 7.5,
            transient_density_per_second: 0.9,
            rms_short_term_dbfs: -16,
            dynamic_range_db: 6.2,
            transient_crest_db: 7.8,
            punch_window_ratio: 0.12,
          }),
          artifacts: {
            clipping_detected: false,
            noise_floor_dbfs: -68,
            clipped_sample_count: 0,
          },
        },
        annotations: [],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).toContain("controlled");
    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("punchy");
  });

  it("assigns loud and quiet only at conservative level extremes", () => {
    const loudProfile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          levels: {
            ...loadExampleReport().measurements.levels,
            integrated_lufs: -9.8,
            true_peak_dbtp: -0.6,
            rms_dbfs: -12.5,
            sample_peak_dbfs: -0.8,
            headroom_db: 0.8,
          },
        },
      }),
    );
    const quietProfile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          levels: {
            ...loadExampleReport().measurements.levels,
            integrated_lufs: -22.5,
            true_peak_dbtp: -8,
            rms_dbfs: -24,
            sample_peak_dbfs: -9,
            headroom_db: 9,
          },
        },
      }),
    );

    expect(loudProfile.descriptors.map((descriptor) => descriptor.label)).toContain("loud");
    expect(quietProfile.descriptors.map((descriptor) => descriptor.label)).toContain("quiet");
  });

  it("assigns level_unstable when wide dynamic swings and level spread agree", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          levels: {
            ...loadExampleReport().measurements.levels,
            integrated_lufs: -17.5,
            true_peak_dbtp: -2.4,
            rms_dbfs: -18.5,
            sample_peak_dbfs: -2.8,
            headroom_db: 2.8,
          },
          dynamics: createDynamics({
            crest_factor_db: 11.5,
            transient_density_per_second: 1.2,
            rms_short_term_dbfs: -12,
            dynamic_range_db: 13.5,
            transient_crest_db: 10.8,
            punch_window_ratio: 0.18,
          }),
        },
        annotations: [],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).toContain("level_unstable");
    expect(profile.summary.plain_text).toContain("level unstable");
  });

  it("keeps mild harshness unresolved below the assignment threshold", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          spectral_balance: createSpectralBalance({
            low_band_db: -14,
            mid_band_db: -11.5,
            high_band_db: -4.8,
            spectral_centroid_hz: 2550,
          }),
        },
        annotations: [
          {
            kind: "harshness",
            start_seconds: 0,
            end_seconds: 4,
            bands_hz: [3000, 4500],
            severity: 0.34,
            evidence: "modest upper-mid ridge",
          },
        ],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain(
      "slightly_harsh",
    );
    expect(profile.unresolved_terms).toContain("slightly_harsh");
  });

  it("maps explicit restoration annotations into hum_present and clicks_present", () => {
    const profile = buildSemanticProfile(
      createReport({
        annotations: [
          createAnnotation({
            kind: "hum",
            start_seconds: 0,
            end_seconds: 4,
            bands_hz: [60, 180],
            severity: 0.57,
            evidence: "steady mains-related tone persists at 60 Hz with harmonics",
          }),
          createAnnotation({
            kind: "click",
            start_seconds: 1.2,
            end_seconds: 1.23,
            severity: 0.52,
            evidence: "short impulsive pop reaches 0.88 full scale around 1.22 seconds",
          }),
        ],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).toEqual(
      expect.arrayContaining(["hum_present", "clicks_present"]),
    );
  });

  it("keeps weak restoration evidence unresolved instead of over-assigning", () => {
    const profile = buildSemanticProfile(
      createReport({
        annotations: [
          createAnnotation({
            kind: "hum",
            start_seconds: 0,
            end_seconds: 4,
            bands_hz: [60, 180],
            severity: 0.24,
            evidence: "possible faint low-frequency tone near the mains region",
          }),
          createAnnotation({
            kind: "clicks",
            start_seconds: 2,
            end_seconds: 2.04,
            severity: 0.22,
            evidence: "possible short click-like burst near 2.02 seconds",
          }),
        ],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toEqual(
      expect.arrayContaining(["hum_present", "clicks_present"]),
    );
    expect(profile.unresolved_terms).toEqual(
      expect.arrayContaining(["hum_present", "clicks_present"]),
    );
  });

  it("keeps restoration labels unresolved when the annotation shape is not consistent with hum or clicks", () => {
    const profile = buildSemanticProfile(
      createReport({
        annotations: [
          createAnnotation({
            kind: "hum",
            start_seconds: 0,
            end_seconds: 0.04,
            bands_hz: [420, 900],
            severity: 0.66,
            evidence: "brief mid-band tone that does not stay in the mains region",
          }),
          createAnnotation({
            kind: "click",
            start_seconds: 1.5,
            end_seconds: 1.9,
            severity: 0.58,
            evidence: "longer burst that is not clearly impulse-like",
          }),
        ],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toEqual(
      expect.arrayContaining(["hum_present", "clicks_present"]),
    );
    expect(profile.unresolved_terms).toEqual(
      expect.arrayContaining(["hum_present", "clicks_present"]),
    );
  });

  it("uses more cautious summary wording when evidence remains unresolved", () => {
    const profile = buildSemanticProfile(
      createReport({
        summary: {
          plain_text: "Lower-confidence analysis with unresolved tonal evidence.",
          confidence: 0.68,
        },
        measurements: {
          ...loadExampleReport().measurements,
          stereo: {
            width: 0.31,
            correlation: 0.55,
            balance_db: 0,
          },
        },
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).toContain("bright");
    expect(profile.summary.plain_text).toContain("shows evidence of");
  });

  it("uses the semantic profile creation time for generated_at", () => {
    const report = loadExampleReport();
    const before = Date.now();
    const profile = buildSemanticProfile(report);
    const after = Date.now();

    expect(Date.parse(profile.generated_at)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(profile.generated_at)).toBeLessThanOrEqual(after);
  });

  it("allows callers to override generated_at while keeping profile_id deterministic", () => {
    const report = loadExampleReport();
    const generatedAt = "2026-04-15T00:00:00.000Z";
    const firstProfile = buildSemanticProfile(report, { generatedAt });
    const secondProfile = buildSemanticProfile(report, { generatedAt });

    expect(firstProfile.generated_at).toBe(generatedAt);
    expect(secondProfile.generated_at).toBe(generatedAt);
    expect(secondProfile).toEqual(firstProfile);
  });

  it("keeps wide unresolved when width is high but correlation is ambiguous", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          stereo: {
            width: 0.41,
            correlation: -0.05,
            balance_db: 0,
          },
        },
        annotations: [
          {
            kind: "stereo_ambiguity",
            start_seconds: 0,
            end_seconds: 4,
            severity: 0.52,
            evidence: "side energy reaches width 0.41 while local correlation falls to -0.05",
          },
        ],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("wide");
    expect(profile.unresolved_terms).toContain("wide");
  });

  it("assigns wide at the threshold when stable width coverage is sustained", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          stereo: {
            width: 0.35,
            correlation: 0.2,
            balance_db: 0,
          },
        },
        annotations: [
          {
            kind: "stereo_width",
            start_seconds: 0,
            end_seconds: 0.4,
            severity: 0.25,
            evidence:
              "stable side energy reaches width 0.35 with local correlation 0.20 over 0.40 seconds",
          },
        ],
        segments: [{ kind: "loop", start_seconds: 0, end_seconds: 4 }],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).toContain("wide");
    expect(profile.unresolved_terms ?? []).not.toContain("wide");
  });

  it("assigns off_center when measured stereo balance is materially skewed", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          stereo: {
            width: 0.24,
            correlation: 0.72,
            balance_db: 3.1,
          },
        },
        annotations: [],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).toContain("off_center");
    expect(profile.unresolved_terms ?? []).not.toContain("off_center");
  });

  it("keeps off_center unresolved when stereo balance is only mildly skewed", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          stereo: {
            width: 0.24,
            correlation: 0.72,
            balance_db: 1.5,
          },
        },
        annotations: [],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("off_center");
    expect(profile.unresolved_terms).toContain("off_center");
  });

  it("keeps wide unresolved when stable width evidence is too brief", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          stereo: {
            width: 0.4,
            correlation: 0.32,
            balance_db: 0,
          },
        },
        annotations: [
          {
            kind: "stereo_width",
            start_seconds: 0,
            end_seconds: 0.08,
            severity: 0.42,
            evidence:
              "stable side energy reaches width 0.40 with local correlation 0.32 over 0.08 seconds",
          },
        ],
        segments: [{ kind: "loop", start_seconds: 0, end_seconds: 4 }],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("wide");
    expect(profile.unresolved_terms).toContain("wide");
  });

  it("keeps wide unresolved when spread conflicts with major channel imbalance", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          stereo: {
            width: 0.44,
            correlation: 0.33,
            balance_db: 5.2,
          },
        },
        annotations: [
          {
            kind: "stereo_width",
            start_seconds: 0,
            end_seconds: 1.2,
            severity: 0.58,
            evidence:
              "stable side energy reaches width 0.44 with local correlation 0.33 over 1.20 seconds at up to 5.2 dB channel imbalance",
          },
        ],
        segments: [{ kind: "loop", start_seconds: 0, end_seconds: 4 }],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("wide");
    expect(profile.unresolved_terms).toContain("wide");
  });

  it("does not assign wide when correlation is strongly negative", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          stereo: {
            width: 0.44,
            correlation: -0.55,
            balance_db: 0,
          },
        },
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("wide");
    expect(profile.unresolved_terms ?? []).not.toContain("wide");
  });

  it("keeps wide unresolved when explicit ambiguity evidence remains materially present", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          stereo: {
            width: 0.44,
            correlation: -0.55,
            balance_db: 0,
          },
        },
        annotations: [
          {
            kind: "stereo_ambiguity",
            start_seconds: 0,
            end_seconds: 0.8,
            severity: 0.63,
            evidence: "side energy reaches width 0.46 while local correlation falls to -0.55",
          },
        ],
        segments: [{ kind: "loop", start_seconds: 0, end_seconds: 4 }],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("wide");
    expect(profile.unresolved_terms).toContain("wide");
  });

  it("assigns noisy only when localized noise evidence and elevated floor agree", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          artifacts: {
            clipping_detected: false,
            noise_floor_dbfs: -46,
            clipped_sample_count: 0,
          },
        },
        annotations: [
          {
            kind: "noise",
            start_seconds: 0,
            end_seconds: 4,
            bands_hz: [2000, 12000],
            severity: 0.67,
            evidence:
              "sustained low-level broadband activity peaks at -45.5 dBFS with 4.1 dB crest and 0.42 zero-crossing ratio",
          },
        ],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).toContain("noisy");
    expect(profile.unresolved_terms ?? []).not.toContain("noisy");
  });

  it("keeps noise unresolved when only the aggregate floor is elevated", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          artifacts: {
            clipping_detected: false,
            noise_floor_dbfs: -52,
            clipped_sample_count: 0,
          },
        },
        annotations: [],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("noisy");
    expect(profile.unresolved_terms).toContain("noisy");
  });

  it("assigns noisy at the threshold when floor and sustained coverage agree", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          artifacts: {
            clipping_detected: false,
            noise_floor_dbfs: -50,
            clipped_sample_count: 0,
          },
        },
        annotations: [
          {
            kind: "noise",
            start_seconds: 0,
            end_seconds: 0.4,
            bands_hz: [2000, 12000],
            severity: 0.45,
            evidence:
              "sustained low-level broadband activity lasts 0.40 seconds, peaks at -49.2 dBFS, sits up to 0.8 dB above the estimated floor, and reaches 0.28 zero-crossing ratio with 4.7 dB crest",
          },
        ],
        segments: [{ kind: "loop", start_seconds: 0, end_seconds: 4 }],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).toContain("noisy");
    expect(profile.unresolved_terms ?? []).not.toContain("noisy");
  });

  it("keeps noise unresolved when sustained noise evidence is too brief", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          artifacts: {
            clipping_detected: false,
            noise_floor_dbfs: -48,
            clipped_sample_count: 0,
          },
        },
        annotations: [
          {
            kind: "noise",
            start_seconds: 0,
            end_seconds: 0.08,
            bands_hz: [2000, 12000],
            severity: 0.62,
            evidence:
              "sustained low-level broadband activity lasts 0.08 seconds, peaks at -47.9 dBFS, sits up to 0.5 dB above the estimated floor, and reaches 0.34 zero-crossing ratio with 4.2 dB crest",
          },
        ],
        segments: [{ kind: "loop", start_seconds: 0, end_seconds: 4 }],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("noisy");
    expect(profile.unresolved_terms).toContain("noisy");
  });

  it("keeps noise unresolved when localized noise evidence conflicts with a low floor estimate", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          artifacts: {
            clipping_detected: false,
            noise_floor_dbfs: -68,
            clipped_sample_count: 0,
          },
        },
        annotations: [
          {
            kind: "noise",
            start_seconds: 0,
            end_seconds: 1.0,
            bands_hz: [2000, 12000],
            severity: 0.72,
            evidence:
              "sustained low-level broadband activity lasts 1.00 seconds, peaks at -62.5 dBFS, sits up to 5.5 dB above the estimated floor, and reaches 0.41 zero-crossing ratio with 3.8 dB crest",
          },
        ],
        segments: [{ kind: "loop", start_seconds: 0, end_seconds: 4 }],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("noisy");
    expect(profile.unresolved_terms).toContain("noisy");
  });

  it("keeps punch unresolved when strong transient evidence conflicts with compressed dynamics", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          dynamics: createDynamics({
            crest_factor_db: 10.5,
            transient_density_per_second: 1.9,
            transient_crest_db: 11.4,
            punch_window_ratio: 0.42,
            dynamic_range_db: 3.9,
          }),
        },
        annotations: [
          {
            kind: "transient_impact",
            start_seconds: 0,
            end_seconds: 4,
            bands_hz: [60, 4000],
            severity: 0.62,
            evidence: "window crest 11.4 dB at -18.2 dBFS short-term level",
          },
        ],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("punchy");
    expect(profile.unresolved_terms).toContain("punchy");
  });

  it("keeps wide unresolved when stable spread conflicts with stereo ambiguity evidence", () => {
    const profile = buildSemanticProfile(
      createReport({
        measurements: {
          ...loadExampleReport().measurements,
          stereo: {
            width: 0.42,
            correlation: 0.24,
            balance_db: 0,
          },
        },
        annotations: [
          {
            kind: "stereo_width",
            start_seconds: 0,
            end_seconds: 4,
            severity: 0.55,
            evidence: "stable side energy reaches width 0.42 with local correlation 0.24",
          },
          {
            kind: "stereo_ambiguity",
            start_seconds: 1,
            end_seconds: 2,
            severity: 0.46,
            evidence: "side energy reaches width 0.44 while local correlation falls to -0.03",
          },
        ],
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("wide");
    expect(profile.unresolved_terms).toContain("wide");
  });
});
