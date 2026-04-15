import type { AnalysisAnnotation, AnalysisReport } from "@audio-language-interface/analysis";

import { annotationEvidenceRef, measurementEvidenceRef } from "./evidence.js";
import type { SemanticAssessment, SemanticDescriptor } from "./types.js";

export function assessDescriptors(report: AnalysisReport): SemanticAssessment {
  const descriptors: SemanticDescriptor[] = [];
  const unresolvedTerms = new Set<string>();

  addBrightnessDescriptors(report, descriptors, unresolvedTerms);
  addSpatialDescriptors(report, descriptors, unresolvedTerms);
  addDynamicsDescriptors(report, descriptors);
  addArtifactDescriptors(report, descriptors);
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
  const centroidHz = spectralBalance.spectral_centroid_hz;
  const evidenceRef = measurementEvidenceRef(report, "spectral_balance");

  if (highMinusLow >= 6 && centroidHz >= 2200) {
    descriptors.push({
      label: "bright",
      confidence: clamp(
        0.62 + Math.min((highMinusLow - 6) / 16, 0.18) + Math.min((centroidHz - 2200) / 6000, 0.12),
      ),
      evidence_refs: [evidenceRef],
      rationale:
        "High-band energy exceeds low-band energy by a clear margin and the spectral centroid is elevated.",
    });
    return;
  }

  if (highMinusLow <= -6 && centroidHz <= 1800) {
    descriptors.push({
      label: "dark",
      confidence: clamp(
        0.62 +
          Math.min((-6 - highMinusLow) / 16, 0.18) +
          Math.min((1800 - centroidHz) / 3000, 0.12),
      ),
      evidence_refs: [evidenceRef],
      rationale:
        "Low-band energy dominates the high band and the spectral centroid stays comparatively low.",
    });
    return;
  }

  if (Math.abs(highMinusLow) <= 3) {
    descriptors.push({
      label: "balanced",
      confidence: clamp(0.63 + (3 - Math.abs(highMinusLow)) / 12),
      evidence_refs: [evidenceRef],
      rationale:
        "Low- and high-band energy remain within a narrow range, with no strong tonal tilt.",
    });
    return;
  }

  if (highMinusLow >= 4) {
    unresolvedTerms.add("bright");
  }

  if (highMinusLow <= -4) {
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

  if (stereo.width >= 0.35 && stereo.correlation >= 0.2 && stereo.correlation < 0.95) {
    descriptors.push({
      label: "wide",
      confidence: clamp(
        0.64 +
          Math.min((stereo.width - 0.35) / 0.45, 0.18) +
          Math.min((0.95 - stereo.correlation) / 2, 0.1),
      ),
      evidence_refs: [evidenceRef],
      rationale:
        "Side energy is meaningfully present and channel correlation remains materially positive rather than ambiguous.",
    });
    return;
  }

  if (stereo.width >= 0.28 && stereo.correlation > -0.2) {
    unresolvedTerms.add("wide");
  }

  if (stereo.width <= 0.18) {
    unresolvedTerms.add("narrow");
  }
}

function addDynamicsDescriptors(report: AnalysisReport, descriptors: SemanticDescriptor[]): void {
  const dynamics = report.measurements.dynamics;

  if (dynamics.transient_density_per_second < 1.5 || dynamics.crest_factor_db < 10) {
    return;
  }

  descriptors.push({
    label: "punchy",
    confidence: clamp(
      0.6 +
        Math.min((dynamics.transient_density_per_second - 1.5) / 4, 0.16) +
        Math.min((dynamics.crest_factor_db - 10) / 10, 0.12),
    ),
    evidence_refs: [measurementEvidenceRef(report, "dynamics")],
    rationale:
      "Transient activity and crest factor are both elevated, indicating clearly articulated attacks.",
  });
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
  if (annotation.severity >= 0.35) {
    descriptors.push({
      label: "slightly_harsh",
      confidence: clamp(0.55 + annotation.severity * 0.35),
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
