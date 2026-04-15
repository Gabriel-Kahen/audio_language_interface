import type { AnalysisAnnotation, AnalysisReport } from "@audio-language-interface/analysis";

import { annotationEvidenceRef, measurementEvidenceRef } from "./evidence.js";
import type { SemanticAssessment, SemanticDescriptor } from "./types.js";

export function assessDescriptors(report: AnalysisReport): SemanticAssessment {
  const descriptors: SemanticDescriptor[] = [];
  const unresolvedTerms = new Set<string>();

  addBrightnessDescriptors(report, descriptors, unresolvedTerms);
  addSpatialDescriptors(report, descriptors, unresolvedTerms);
  addDynamicsDescriptors(report, descriptors, unresolvedTerms);
  addArtifactDescriptors(report, descriptors);
  addNoiseDescriptors(report, descriptors, unresolvedTerms);
  addHarshnessDescriptors(report, descriptors, unresolvedTerms);

  return {
    descriptors: descriptors.sort((left, right) => right.confidence - left.confidence),
    unresolvedTerms: [...unresolvedTerms].sort(),
  };
}

function addBrightnessDescriptors(
  report: AnalysisReport,
  descriptors: SemanticDescriptor[],
  unresolvedTerms: Set<string>,
): void {
  const spectralBalance = report.measurements.spectral_balance;
  const highMinusLow = spectralBalance.high_band_db - spectralBalance.low_band_db;
  const brightnessTiltDb = spectralBalance.brightness_tilt_db ?? highMinusLow;
  const centroidHz = spectralBalance.spectral_centroid_hz;
  const evidenceRef = measurementEvidenceRef(report, "spectral_balance");

  if (
    (brightnessTiltDb >= 6 && centroidHz >= 2400) ||
    (brightnessTiltDb >= 8 && centroidHz >= 2200)
  ) {
    descriptors.push({
      label: "bright",
      confidence: clamp(
        0.64 +
          Math.min((brightnessTiltDb - 6) / 14, 0.16) +
          Math.min((centroidHz - 2400) / 5000, 0.1),
      ),
      evidence_refs: [evidenceRef],
      rationale:
        "High-band energy exceeds low-band energy by a clear margin and the spectral centroid is elevated.",
    });
    return;
  }

  if (
    (brightnessTiltDb <= -5 && centroidHz <= 1700) ||
    (brightnessTiltDb <= -7 && centroidHz <= 2000)
  ) {
    descriptors.push({
      label: "dark",
      confidence: clamp(
        0.64 +
          Math.min((-5 - brightnessTiltDb) / 14, 0.16) +
          Math.min((1700 - centroidHz) / 2500, 0.1),
      ),
      evidence_refs: [evidenceRef],
      rationale:
        "Low-band energy dominates the high band and the spectral centroid stays comparatively low.",
    });
    return;
  }

  if (Math.abs(brightnessTiltDb) <= 2.5 && centroidHz >= 1600 && centroidHz <= 2600) {
    descriptors.push({
      label: "balanced",
      confidence: clamp(0.63 + (2.5 - Math.abs(brightnessTiltDb)) / 10),
      evidence_refs: [evidenceRef],
      rationale:
        "Low- and high-band energy remain within a narrow range and the spectral centroid stays near the middle of the current supported range.",
    });
    return;
  }

  if (brightnessTiltDb >= 4 || centroidHz >= 2200) {
    unresolvedTerms.add("bright");
  }

  if (brightnessTiltDb <= -4 || centroidHz <= 1800) {
    unresolvedTerms.add("dark");
  }
}

function addSpatialDescriptors(
  report: AnalysisReport,
  descriptors: SemanticDescriptor[],
  unresolvedTerms: Set<string>,
): void {
  const stereo = report.measurements.stereo;
  const evidenceRef = measurementEvidenceRef(report, "stereo");
  const annotations = report.annotations ?? [];
  const wideAnnotation = findStrongestAnnotation(annotations, "stereo_width");
  const ambiguityAnnotation = findStrongestAnnotation(annotations, "stereo_ambiguity");
  const hasWidthConflict =
    Math.abs(stereo.balance_db) >= 4.5 ||
    (ambiguityAnnotation?.annotation.severity ?? 0) >= 0.3 ||
    stereo.correlation < 0.1;

  if (stereo.width <= 0.05) {
    descriptors.push({
      label: "mono",
      confidence: clamp(0.78 + Math.min((0.05 - stereo.width) * 2, 0.12)),
      evidence_refs: [evidenceRef],
      rationale: "Stereo width is very low, so the signal behaves effectively as mono.",
    });
    return;
  }

  if (stereo.width <= 0.12) {
    descriptors.push({
      label: "narrow",
      confidence: clamp(0.62 + Math.min((0.12 - stereo.width) * 1.5, 0.16)),
      evidence_refs: [evidenceRef],
      rationale: "Stereo width is present but remains tightly constrained.",
    });
    return;
  }

  if (
    stereo.width >= 0.35 &&
    stereo.correlation >= 0.2 &&
    stereo.correlation < 0.95 &&
    Math.abs(stereo.balance_db) < 4.5 &&
    (wideAnnotation?.annotation.severity ?? 0) >= 0.25 &&
    !hasWidthConflict
  ) {
    descriptors.push({
      label: "wide",
      confidence: clamp(
        0.64 +
          Math.min((stereo.width - 0.35) / 0.45, 0.18) +
          Math.min((0.95 - stereo.correlation) / 2, 0.1),
      ),
      evidence_refs: [evidenceRef, annotationEvidenceRef(report, wideAnnotation?.index ?? 0)],
      rationale:
        "Side energy is meaningfully present, localized stereo-width evidence is sustained, and correlation remains materially positive rather than ambiguous.",
    });
    return;
  }

  if (
    (stereo.width >= 0.28 && stereo.correlation > -0.2) ||
    (wideAnnotation && Math.abs(stereo.balance_db) >= 4.5)
  ) {
    unresolvedTerms.add("wide");
  }

  if (stereo.width <= 0.18) {
    unresolvedTerms.add("narrow");
  }
}

function addDynamicsDescriptors(
  report: AnalysisReport,
  descriptors: SemanticDescriptor[],
  unresolvedTerms: Set<string>,
): void {
  const dynamics = report.measurements.dynamics;
  const annotations = report.annotations ?? [];
  const transientCrestDb = dynamics.transient_crest_db ?? dynamics.crest_factor_db;
  const punchWindowRatio =
    dynamics.punch_window_ratio ??
    (dynamics.transient_density_per_second >= 1.5 && dynamics.crest_factor_db >= 10 ? 0.5 : 0.12);
  const transientImpactAnnotation = findStrongestAnnotation(annotations, "transient_impact");
  const transientImpactSeverity = transientImpactAnnotation?.annotation.severity ?? 0;
  const hasPunchConflict =
    report.measurements.artifacts.clipping_detected || dynamics.dynamic_range_db < 4.5;

  if (
    dynamics.transient_density_per_second >= 1.5 &&
    dynamics.crest_factor_db >= 10 &&
    transientCrestDb >= 9.5 &&
    punchWindowRatio >= 0.3 &&
    dynamics.dynamic_range_db >= 6 &&
    transientImpactSeverity >= 0.3 &&
    !hasPunchConflict
  ) {
    descriptors.push({
      label: "punchy",
      confidence: clamp(
        0.6 +
          Math.min((dynamics.transient_density_per_second - 1.5) / 4, 0.16) +
          Math.min((transientCrestDb - 9) / 8, 0.1) +
          Math.min((punchWindowRatio - 0.3) / 0.5, 0.08),
      ),
      evidence_refs: [
        measurementEvidenceRef(report, "dynamics"),
        annotationEvidenceRef(report, transientImpactAnnotation?.index ?? 0),
      ],
      rationale:
        "Transient activity, localized impact evidence, and short-term punch windows are all elevated without clear compression-like counterevidence.",
    });
    return;
  }

  if (
    (dynamics.transient_density_per_second >= 1.1 &&
      dynamics.crest_factor_db >= 8.5 &&
      (transientCrestDb >= 8 || punchWindowRatio >= 0.18)) ||
    transientImpactSeverity >= 0.2 ||
    (hasPunchConflict &&
      dynamics.transient_density_per_second >= 1.1 &&
      dynamics.crest_factor_db >= 9)
  ) {
    unresolvedTerms.add("punchy");
  }
}

function addArtifactDescriptors(report: AnalysisReport, descriptors: SemanticDescriptor[]): void {
  const artifacts = report.measurements.artifacts;
  const evidenceRef = measurementEvidenceRef(report, "artifacts");

  if (artifacts.clipping_detected) {
    descriptors.push({
      label: "clipped",
      confidence: 0.97,
      evidence_refs: [evidenceRef],
      rationale: "The analysis detected one or more clipped samples.",
    });
  }
}

function addNoiseDescriptors(
  report: AnalysisReport,
  descriptors: SemanticDescriptor[],
  unresolvedTerms: Set<string>,
): void {
  const artifacts = report.measurements.artifacts;
  const annotations = report.annotations ?? [];
  const noiseAnnotation = findStrongestAnnotation(annotations, "noise");
  const noiseSeverity = noiseAnnotation?.annotation.severity ?? 0;

  if (
    noiseAnnotation &&
    ((noiseSeverity >= 0.45 && artifacts.noise_floor_dbfs >= -50) ||
      (noiseSeverity >= 0.6 && artifacts.noise_floor_dbfs >= -56))
  ) {
    descriptors.push({
      label: "noisy",
      confidence: clamp(
        0.56 + noiseSeverity * 0.24 + Math.min((artifacts.noise_floor_dbfs + 56) / 18, 0.12),
      ),
      evidence_refs: [
        measurementEvidenceRef(report, "artifacts"),
        annotationEvidenceRef(report, noiseAnnotation.index),
      ],
      rationale: noiseAnnotation.annotation.evidence?.length
        ? `A sustained noise annotation is present and the estimated floor is elevated: ${noiseAnnotation.annotation.evidence}.`
        : "A sustained noise annotation is present and the estimated floor is elevated.",
    });
    return;
  }

  if (noiseSeverity >= 0.25 || artifacts.noise_floor_dbfs >= -56) {
    unresolvedTerms.add("noisy");
  }
}

function addHarshnessDescriptors(
  report: AnalysisReport,
  descriptors: SemanticDescriptor[],
  unresolvedTerms: Set<string>,
): void {
  const annotations = report.annotations ?? [];
  const harshnessAnnotation = findStrongestAnnotation(annotations, "harshness");

  if (!harshnessAnnotation) {
    return;
  }

  const { annotation, index } = harshnessAnnotation;
  const upperMidExcessDb =
    report.measurements.spectral_balance.harshness_ratio_db ??
    report.measurements.spectral_balance.high_band_db -
      report.measurements.spectral_balance.mid_band_db;

  if (annotation.severity >= 0.38 && (upperMidExcessDb >= 4 || annotation.severity >= 0.45)) {
    descriptors.push({
      label: "slightly_harsh",
      confidence: clamp(
        0.54 + annotation.severity * 0.3 + Math.min((upperMidExcessDb - 4) / 8, 0.12),
      ),
      evidence_refs: [
        annotationEvidenceRef(report, index),
        measurementEvidenceRef(report, "spectral_balance"),
      ],
      rationale: annotation.evidence?.length
        ? `A harshness annotation is present with measurable upper-mid emphasis: ${annotation.evidence}.`
        : "A harshness annotation is present with measurable upper-mid emphasis.",
    });
    return;
  }

  if (annotation.severity >= 0.2) {
    unresolvedTerms.add("slightly_harsh");
  }
}

function findStrongestAnnotation(
  annotations: AnalysisAnnotation[],
  kind: string,
): { annotation: AnalysisAnnotation; index: number } | undefined {
  let strongest: { annotation: AnalysisAnnotation; index: number } | undefined;

  for (const [index, annotation] of annotations.entries()) {
    if (annotation.kind !== kind) {
      continue;
    }

    if (!strongest || annotation.severity > strongest.annotation.severity) {
      strongest = { annotation, index };
    }
  }

  return strongest;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(Math.max(value, minimum), maximum);
}
