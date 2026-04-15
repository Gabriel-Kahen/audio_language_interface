import { readFileSync } from "node:fs";

import type { AnalysisReport } from "@audio-language-interface/analysis";
import { describe, expect, it } from "vitest";

import { buildSemanticProfile, isValidSemanticProfile } from "../src/index.js";

function loadExampleReport(): AnalysisReport {
  const fileUrl = new URL("../../../contracts/examples/analysis-report.json", import.meta.url);
  return JSON.parse(readFileSync(fileUrl, "utf8")) as AnalysisReport;
}

function createDynamics(
  overrides: Partial<AnalysisReport["measurements"]["dynamics"]> = {},
): AnalysisReport["measurements"]["dynamics"] {
  const base = loadExampleReport().measurements.dynamics;
  const crestFactorDb = overrides.crest_factor_db ?? base.crest_factor_db;
  const transientDensityPerSecond =
    overrides.transient_density_per_second ?? base.transient_density_per_second;

  return {
    crest_factor_db: crestFactorDb,
    transient_density_per_second: transientDensityPerSecond,
    rms_short_term_dbfs: overrides.rms_short_term_dbfs ?? base.rms_short_term_dbfs,
    dynamic_range_db: overrides.dynamic_range_db ?? base.dynamic_range_db,
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

function createReport(overrides: Partial<AnalysisReport> = {}): AnalysisReport {
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
        ...overrides.measurements?.stereo,
      },
      artifacts: {
        ...loadExampleReport().measurements.artifacts,
        ...overrides.measurements?.artifacts,
      },
      levels: {
        ...loadExampleReport().measurements.levels,
        ...overrides.measurements?.levels,
      },
    },
  };
}

describe("buildSemanticProfile", () => {
  it("builds a contract-aligned profile from bright and spatial evidence", () => {
    const report = loadExampleReport();

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
    expect(profile.unresolved_terms).toEqual(["bright", "slightly_harsh", "wide"]);
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
      }),
    );

    expect(profile.descriptors.map((descriptor) => descriptor.label)).not.toContain("punchy");
    expect(profile.unresolved_terms).toContain("punchy");
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
});
