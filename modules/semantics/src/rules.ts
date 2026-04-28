import type { AnalysisAnnotation, AnalysisReport } from "@audio-language-interface/analysis";

import { annotationEvidenceRef, measurementEvidenceRef } from "./evidence.js";
import type { SemanticAssessment, SemanticDescriptor } from "./types.js";

export function assessDescriptors(report: AnalysisReport): SemanticAssessment {
  const descriptors: SemanticDescriptor[] = [];
  const unresolvedTerms = new Set<string>();

  addBrightnessDescriptors(report, descriptors, unresolvedTerms);
  addTonalBodyDescriptors(report, descriptors, unresolvedTerms);
  addSpatialDescriptors(report, descriptors, unresolvedTerms);
  addDynamicsDescriptors(report, descriptors, unresolvedTerms);
  addTextureDescriptors(report, descriptors, unresolvedTerms);
  addLevelDescriptors(report, descriptors, unresolvedTerms);
  addArtifactDescriptors(report, descriptors);
  addNoiseDescriptors(report, descriptors, unresolvedTerms);
  addRestorationDescriptors(report, descriptors, unresolvedTerms);
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

function addTonalBodyDescriptors(
  report: AnalysisReport,
  descriptors: SemanticDescriptor[],
  unresolvedTerms: Set<string>,
): void {
  const spectral = report.measurements.spectral_balance;
  const annotations = report.annotations ?? [];
  const brightnessTiltDb =
    spectral.brightness_tilt_db ?? spectral.high_band_db - spectral.low_band_db;
  const presenceRatioDb =
    spectral.harshness_ratio_db ?? spectral.high_band_db - spectral.mid_band_db;
  const lowMidExcessDb = spectral.mid_band_db - spectral.high_band_db;
  const bassWarmthDeltaDb = spectral.low_band_db - spectral.high_band_db;
  const centroidHz = spectral.spectral_centroid_hz;
  const harshnessAnnotation = findStrongestAnnotation(annotations, "harshness");
  const harshnessSeverity = harshnessAnnotation?.annotation.severity ?? 0;
  const sibilanceAnnotation = findStrongestAnnotationByKinds(annotations, [
    "sibilance",
    "sibilant",
  ]);
  const sibilanceSeverity = sibilanceAnnotation?.annotation.severity ?? 0;
  const evidenceRef = measurementEvidenceRef(report, "spectral_balance");

  if (lowMidExcessDb >= 3.5 && presenceRatioDb <= -3.5 && centroidHz >= 700 && centroidHz <= 2200) {
    descriptors.push({
      label: "muddy",
      confidence: clamp(
        0.58 +
          Math.min((lowMidExcessDb - 3.5) / 8, 0.14) +
          Math.min((-3.5 - presenceRatioDb) / 8, 0.12) +
          Math.min((2200 - centroidHz) / 2500, 0.08),
      ),
      evidence_refs: [evidenceRef],
      rationale:
        "Low-mid energy outweighs upper-band presence by a clear margin and the spectral centroid stays in a low-mid-heavy range.",
    });
  } else if (lowMidExcessDb >= 2.5 || presenceRatioDb <= -2.5) {
    unresolvedTerms.add("muddy");
  }

  if (
    !hasDescriptor(descriptors, "muddy") &&
    bassWarmthDeltaDb >= 2.5 &&
    bassWarmthDeltaDb <= 6.5 &&
    centroidHz >= 1400 &&
    centroidHz <= 2600 &&
    presenceRatioDb >= -3.5 &&
    presenceRatioDb <= 2.5 &&
    lowMidExcessDb < 4.5
  ) {
    descriptors.push({
      label: "warm",
      confidence: clamp(
        0.57 +
          Math.min((bassWarmthDeltaDb - 2.5) / 8, 0.14) +
          Math.min((centroidHz - 1400) / 2400, 0.08) +
          Math.min((2.5 - Math.abs(presenceRatioDb)) / 8, 0.08),
      ),
      evidence_refs: [evidenceRef],
      rationale:
        "Low-band weight is clearly present without the stronger low-mid masking or upper-band rolloff that would read as muddy or dull.",
    });
  } else if (
    !hasDescriptor(descriptors, "muddy") &&
    bassWarmthDeltaDb >= 1.5 &&
    centroidHz >= 1200 &&
    centroidHz <= 2800 &&
    presenceRatioDb >= -4.5 &&
    presenceRatioDb <= 3.5
  ) {
    unresolvedTerms.add("warm");
  }

  if (
    sibilanceSeverity < 0.25 &&
    harshnessSeverity < 0.28 &&
    brightnessTiltDb >= 5.5 &&
    centroidHz >= 3000 &&
    presenceRatioDb <= 4.5
  ) {
    descriptors.push({
      label: "airy",
      confidence: clamp(
        0.58 +
          Math.min((brightnessTiltDb - 5.5) / 10, 0.14) +
          Math.min((centroidHz - 3000) / 4000, 0.1) +
          Math.min((4.5 - presenceRatioDb) / 10, 0.06),
      ),
      evidence_refs: [evidenceRef],
      rationale:
        "Upper-band extension is clearly elevated while upper-presence harshness remains limited, which supports an open rather than abrasive top end.",
    });
  } else if (
    sibilanceSeverity < 0.4 &&
    harshnessSeverity < 0.4 &&
    brightnessTiltDb >= 5 &&
    centroidHz >= 2500
  ) {
    unresolvedTerms.add("airy");
  }

  if (sibilanceAnnotation && sibilanceSeverity >= 0.45) {
    descriptors.push({
      label: "sibilant",
      confidence: clamp(0.61 + sibilanceSeverity * 0.24),
      evidence_refs: [annotationEvidenceRef(report, sibilanceAnnotation.index), evidenceRef],
      rationale: sibilanceAnnotation.annotation.evidence?.length
        ? `An explicit sibilance annotation is present with elevated upper-presence energy: ${sibilanceAnnotation.annotation.evidence}.`
        : "An explicit sibilance annotation is present with elevated upper-presence energy.",
    });
    return;
  }

  if (
    harshnessAnnotation &&
    (harshnessAnnotation.annotation.bands_hz?.[0] ?? 0) >= 2500 &&
    (harshnessAnnotation.annotation.bands_hz?.[1] ?? 0) >= 5000 &&
    harshnessSeverity >= 0.55 &&
    presenceRatioDb >= 5.5 &&
    centroidHz >= 2000
  ) {
    descriptors.push({
      label: "sibilant",
      confidence: clamp(
        0.58 + harshnessSeverity * 0.2 + Math.min((presenceRatioDb - 5.5) / 8, 0.12),
      ),
      evidence_refs: [annotationEvidenceRef(report, harshnessAnnotation.index), evidenceRef],
      rationale: harshnessAnnotation.annotation.evidence?.length
        ? `Upper-presence energy is strongly elevated in the annotated 2.5 kHz to 6 kHz region, which is consistent with sibilant emphasis: ${harshnessAnnotation.annotation.evidence}.`
        : "Upper-presence energy is strongly elevated in the annotated 2.5 kHz to 6 kHz region, which is consistent with sibilant emphasis.",
    });
    return;
  }

  if (sibilanceSeverity >= 0.25 || (harshnessSeverity >= 0.4 && presenceRatioDb >= 4.5)) {
    unresolvedTerms.add("sibilant");
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
  const wideAnnotations = findAnnotations(annotations, "stereo_width");
  const ambiguityAnnotations = findAnnotations(annotations, "stereo_ambiguity");
  const wideAnnotation = wideAnnotations[0];
  const ambiguityAnnotation = ambiguityAnnotations[0];
  const estimatedDurationSeconds = estimateReportDurationSeconds(report);
  const stableWidthCoverageSeconds = sumAnnotationCoverageSeconds(wideAnnotations);
  const ambiguityCoverageSeconds = sumAnnotationCoverageSeconds(ambiguityAnnotations);
  const stableWidthCoverageRatio = stableWidthCoverageSeconds / estimatedDurationSeconds;
  const ambiguityCoverageRatio = ambiguityCoverageSeconds / estimatedDurationSeconds;
  const hasWidthConflict =
    Math.abs(stereo.balance_db) >= 4.5 ||
    (ambiguityAnnotation?.annotation.severity ?? 0) >= 0.3 ||
    ambiguityCoverageRatio >= 0.12 ||
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
    stableWidthCoverageSeconds >= 0.15 &&
    stableWidthCoverageRatio >= 0.1 &&
    !hasWidthConflict
  ) {
    descriptors.push({
      label: "wide",
      confidence: clamp(
        0.64 +
          Math.min((stereo.width - 0.35) / 0.45, 0.18) +
          Math.min((0.95 - stereo.correlation) / 2, 0.1) +
          Math.min(stableWidthCoverageRatio / 0.8, 0.08),
      ),
      evidence_refs: [evidenceRef, annotationEvidenceRef(report, wideAnnotation?.index ?? 0)],
      rationale:
        "Side energy is meaningfully present, localized stereo-width evidence covers a sustained portion of the file, and correlation remains materially positive rather than ambiguous.",
    });
    return;
  }

  if (
    (stereo.width >= 0.28 && stereo.correlation > -0.2) ||
    wideAnnotation !== undefined ||
    ambiguityAnnotation !== undefined ||
    (wideAnnotation && Math.abs(stereo.balance_db) >= 4.5)
  ) {
    unresolvedTerms.add("wide");
  }

  if (stereo.width <= 0.18) {
    unresolvedTerms.add("narrow");
  }

  const absoluteBalanceDb = Math.abs(stereo.balance_db ?? 0);

  if (absoluteBalanceDb >= 2) {
    descriptors.push({
      label: "off_center",
      confidence: clamp(0.64 + Math.min((absoluteBalanceDb - 2) / 4, 0.2)),
      evidence_refs: [evidenceRef],
      rationale:
        "Measured left-right RMS balance is materially offset, so the stereo image reads off-center.",
    });
    return;
  }

  if (absoluteBalanceDb >= 1.25) {
    unresolvedTerms.add("off_center");
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
  } else if (
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

  const controlledEvidenceRefs = [
    measurementEvidenceRef(report, "dynamics"),
    measurementEvidenceRef(report, "levels"),
  ];
  const shortTermRmsOffsetDb = dynamics.rms_short_term_dbfs - report.measurements.levels.rms_dbfs;

  if (
    !report.measurements.artifacts.clipping_detected &&
    dynamics.dynamic_range_db >= 4.5 &&
    dynamics.dynamic_range_db <= 7 &&
    dynamics.crest_factor_db >= 6 &&
    dynamics.crest_factor_db <= 8 &&
    transientCrestDb <= 8.5 &&
    dynamics.transient_density_per_second <= 1 &&
    punchWindowRatio <= 0.2 &&
    shortTermRmsOffsetDb >= -1.5 &&
    shortTermRmsOffsetDb <= 2 &&
    transientImpactSeverity < 0.2
  ) {
    descriptors.push({
      label: "controlled",
      confidence: clamp(
        0.57 +
          Math.min((7 - dynamics.dynamic_range_db) / 4, 0.1) +
          Math.min((8 - dynamics.crest_factor_db) / 3, 0.08) +
          Math.min((0.2 - punchWindowRatio) / 0.2, 0.08),
      ),
      evidence_refs: controlledEvidenceRefs,
      rationale:
        "Dynamic range, crest factor, and sample-domain short-term RMS spread stay in a moderate range without clipping or large level swings.",
    });
  } else if (
    !report.measurements.artifacts.clipping_detected &&
    ((dynamics.dynamic_range_db >= 4.5 &&
      dynamics.dynamic_range_db <= 8.5 &&
      dynamics.crest_factor_db >= 6 &&
      dynamics.crest_factor_db <= 9 &&
      dynamics.transient_density_per_second <= 1.15 &&
      punchWindowRatio <= 0.24 &&
      shortTermRmsOffsetDb >= -2 &&
      shortTermRmsOffsetDb <= 2.5 &&
      transientImpactSeverity < 0.25) ||
      (transientImpactSeverity < 0.2 &&
        dynamics.dynamic_range_db >= 4.5 &&
        dynamics.dynamic_range_db <= 7.5 &&
        dynamics.crest_factor_db >= 6 &&
        dynamics.crest_factor_db <= 8.8 &&
        dynamics.transient_density_per_second <= 1.05 &&
        shortTermRmsOffsetDb >= -1.75 &&
        shortTermRmsOffsetDb <= 2.25))
  ) {
    unresolvedTerms.add("controlled");
  }
}

function addTextureDescriptors(
  report: AnalysisReport,
  descriptors: SemanticDescriptor[],
  unresolvedTerms: Set<string>,
): void {
  const spectral = report.measurements.spectral_balance;
  const dynamics = report.measurements.dynamics;
  const levels = report.measurements.levels;
  const artifacts = report.measurements.artifacts;
  const annotations = report.annotations ?? [];
  const brightnessTiltDb =
    spectral.brightness_tilt_db ?? spectral.high_band_db - spectral.low_band_db;
  const harshnessRatioDb =
    spectral.harshness_ratio_db ?? spectral.high_band_db - spectral.mid_band_db;
  const harshnessAnnotation = findStrongestAnnotation(annotations, "harshness");
  const harshnessSeverity = harshnessAnnotation?.annotation.severity ?? 0;
  const transientImpactAnnotation = findStrongestAnnotation(annotations, "transient_impact");
  const transientImpactSeverity = transientImpactAnnotation?.annotation.severity ?? 0;
  const punchWindowRatio =
    dynamics.punch_window_ratio ??
    (dynamics.transient_density_per_second >= 1.5 && dynamics.crest_factor_db >= 10 ? 0.5 : 0.12);
  const clippedSampleCount = artifacts.clipped_sample_count ?? 0;
  const headroomDb = levels.headroom_db;
  const centroidHz = spectral.spectral_centroid_hz;
  const evidenceRefs = [
    measurementEvidenceRef(report, "spectral_balance"),
    measurementEvidenceRef(report, "dynamics"),
    measurementEvidenceRef(report, "levels"),
    measurementEvidenceRef(report, "artifacts"),
  ];
  const soundsPunchy =
    dynamics.transient_density_per_second >= 1.35 &&
    dynamics.crest_factor_db >= 9.2 &&
    punchWindowRatio >= 0.2 &&
    transientImpactSeverity >= 0.22;
  const soundsBrightOrHarsh =
    brightnessTiltDb >= 4.25 || harshnessRatioDb >= 3.5 || harshnessSeverity >= 0.35;
  const isClippedTexture =
    artifacts.clipping_detected ||
    clippedSampleCount >= 24 ||
    (headroomDb !== undefined && headroomDb <= 0.8);

  if (
    !artifacts.clipping_detected &&
    dynamics.transient_density_per_second <= 1.05 &&
    dynamics.crest_factor_db <= 8.4 &&
    (dynamics.dynamic_range_db ?? 99) <= 7.5 &&
    punchWindowRatio <= 0.16 &&
    brightnessTiltDb <= 2.8 &&
    harshnessRatioDb <= 2.8 &&
    centroidHz <= 2350 &&
    harshnessSeverity < 0.28
  ) {
    descriptors.push({
      label: "relaxed",
      confidence: clamp(
        0.56 +
          Math.min((1.05 - dynamics.transient_density_per_second) / 1.4, 0.12) +
          Math.min((8.4 - dynamics.crest_factor_db) / 4, 0.08) +
          Math.min((2.8 - Math.max(brightnessTiltDb, 0)) / 6, 0.08),
      ),
      evidence_refs: evidenceRefs,
      rationale:
        "Transient density, crest factor, and upper-band emphasis all stay restrained enough to support a calmer, less forceful texture.",
    });
  } else if (
    !artifacts.clipping_detected &&
    dynamics.transient_density_per_second <= 1.2 &&
    dynamics.crest_factor_db <= 9 &&
    punchWindowRatio <= 0.22 &&
    brightnessTiltDb <= 3.5 &&
    harshnessRatioDb <= 3.4 &&
    centroidHz <= 2550
  ) {
    unresolvedTerms.add("relaxed");
  }

  if (
    soundsPunchy &&
    soundsBrightOrHarsh &&
    ((levels.integrated_lufs >= -15 && headroomDb !== undefined && headroomDb <= 2.5) ||
      transientImpactSeverity >= 0.4 ||
      harshnessSeverity >= 0.42)
  ) {
    descriptors.push({
      label: "aggressive",
      confidence: clamp(
        0.57 +
          Math.min((dynamics.transient_density_per_second - 1.35) / 2.5, 0.12) +
          Math.min((Math.max(brightnessTiltDb, harshnessRatioDb) - 3.5) / 8, 0.12) +
          Math.min((transientImpactSeverity - 0.22) / 0.6, 0.08),
      ),
      evidence_refs: evidenceRefs,
      rationale:
        "Punchy transient behavior and elevated upper-band bite combine into a more forceful, forward texture.",
    });
  } else if (
    (soundsPunchy && (brightnessTiltDb >= 3.25 || harshnessRatioDb >= 2.8)) ||
    transientImpactSeverity >= 0.22 ||
    harshnessSeverity >= 0.3
  ) {
    unresolvedTerms.add("aggressive");
  }

  if (isClippedTexture) {
    descriptors.push({
      label: "distorted",
      confidence: clamp(
        0.63 +
          (artifacts.clipping_detected ? 0.18 : 0) +
          Math.min(clippedSampleCount / 256, 0.12) +
          Math.min(Math.max(0.8 - (headroomDb ?? 0.8), 0) / 0.8, 0.06),
      ),
      evidence_refs: evidenceRefs,
      rationale:
        "Direct clipped-sample or near-zero-headroom evidence suggests audible distortion rather than only a tonal imbalance.",
    });
  } else if (clippedSampleCount > 0 || (headroomDb !== undefined && headroomDb <= 1.2)) {
    unresolvedTerms.add("distorted");
  }

  if (isClippedTexture && soundsPunchy && soundsBrightOrHarsh) {
    descriptors.push({
      label: "crunchy",
      confidence: clamp(
        0.55 +
          Math.min(clippedSampleCount / 256, 0.1) +
          Math.min((dynamics.transient_density_per_second - 1.35) / 2.5, 0.08) +
          Math.min((Math.max(brightnessTiltDb, harshnessRatioDb) - 3.5) / 8, 0.1),
      ),
      evidence_refs: evidenceRefs,
      rationale:
        "Clipped or hard-driven peaks combine with bright transient bite, which supports a crunchy texture rather than simple loudness alone.",
    });
  } else if (
    (isClippedTexture && (soundsPunchy || soundsBrightOrHarsh)) ||
    (clippedSampleCount > 0 && (brightnessTiltDb >= 3.25 || harshnessRatioDb >= 2.8))
  ) {
    unresolvedTerms.add("crunchy");
  }
}

function addLevelDescriptors(
  report: AnalysisReport,
  descriptors: SemanticDescriptor[],
  unresolvedTerms: Set<string>,
): void {
  const levels = report.measurements.levels;
  const dynamics = report.measurements.dynamics;
  const evidenceRefs = [
    measurementEvidenceRef(report, "levels"),
    measurementEvidenceRef(report, "dynamics"),
  ];
  const shortTermRmsOffsetDb = dynamics.rms_short_term_dbfs - levels.rms_dbfs;

  if (levels.integrated_lufs >= -11.5 && levels.rms_dbfs >= -14 && levels.true_peak_dbtp >= -1.5) {
    descriptors.push({
      label: "loud",
      confidence: clamp(
        0.61 +
          Math.min((levels.integrated_lufs + 11.5) / 6, 0.14) +
          Math.min((levels.true_peak_dbtp + 1.5) / 2, 0.08),
      ),
      evidence_refs: evidenceRefs,
      rationale: "Integrated loudness, RMS level, and true peak all sit in a high-output range.",
    });
  } else if (
    levels.integrated_lufs >= -13.8 &&
    levels.rms_dbfs >= -15.5 &&
    levels.true_peak_dbtp >= -2
  ) {
    unresolvedTerms.add("loud");
  }

  if (levels.integrated_lufs <= -20 && levels.rms_dbfs <= -22) {
    descriptors.push({
      label: "quiet",
      confidence: clamp(
        0.61 +
          Math.min((-20 - levels.integrated_lufs) / 12, 0.14) +
          Math.min((-22 - levels.rms_dbfs) / 10, 0.08),
      ),
      evidence_refs: evidenceRefs,
      rationale:
        "Integrated loudness and RMS level both remain well below the current conservative output range.",
    });
  } else if (levels.integrated_lufs <= -18.5 || levels.rms_dbfs <= -20.5) {
    unresolvedTerms.add("quiet");
  }

  if (dynamics.dynamic_range_db >= 12 && shortTermRmsOffsetDb >= 3.5) {
    descriptors.push({
      label: "level_unstable",
      confidence: clamp(
        0.58 +
          Math.min((dynamics.dynamic_range_db - 12) / 8, 0.14) +
          Math.min((shortTermRmsOffsetDb - 3.5) / 6, 0.1),
      ),
      evidence_refs: evidenceRefs,
      rationale:
        "Short-term sample-domain RMS sits materially above the overall RMS level and the measured dynamic range is wide, which points to unstable overall level.",
    });
  } else if (dynamics.dynamic_range_db >= 10 || shortTermRmsOffsetDb >= 2.5) {
    unresolvedTerms.add("level_unstable");
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
  const noiseAnnotations = findAnnotations(annotations, "noise");
  const noiseAnnotation = noiseAnnotations[0];
  const noiseSeverity = noiseAnnotation?.annotation.severity ?? 0;
  const estimatedDurationSeconds = estimateReportDurationSeconds(report);
  const noiseCoverageSeconds = sumAnnotationCoverageSeconds(noiseAnnotations);
  const noiseCoverageRatio = noiseCoverageSeconds / estimatedDurationSeconds;

  if (
    noiseAnnotation &&
    noiseCoverageSeconds >= 0.12 &&
    noiseCoverageRatio >= 0.1 &&
    ((noiseSeverity >= 0.45 && artifacts.noise_floor_dbfs >= -50) ||
      (noiseSeverity >= 0.6 && artifacts.noise_floor_dbfs >= -56))
  ) {
    descriptors.push({
      label: "noisy",
      confidence: clamp(
        0.56 +
          noiseSeverity * 0.24 +
          Math.min((artifacts.noise_floor_dbfs + 56) / 18, 0.12) +
          Math.min(noiseCoverageRatio / 0.8, 0.06),
      ),
      evidence_refs: [
        measurementEvidenceRef(report, "artifacts"),
        annotationEvidenceRef(report, noiseAnnotation.index),
      ],
      rationale: noiseAnnotation.annotation.evidence?.length
        ? `A sustained noise annotation covers a meaningful portion of the file and the estimated floor is elevated: ${noiseAnnotation.annotation.evidence}.`
        : "A sustained noise annotation is present and the estimated floor is elevated.",
    });
    return;
  }

  if (noiseSeverity >= 0.25 || artifacts.noise_floor_dbfs >= -56 || noiseCoverageSeconds >= 0.12) {
    unresolvedTerms.add("noisy");
  }
}

function addRestorationDescriptors(
  report: AnalysisReport,
  descriptors: SemanticDescriptor[],
  unresolvedTerms: Set<string>,
): void {
  const annotations = report.annotations ?? [];
  const reportDurationSeconds = estimateReportDurationSeconds(report);
  const humAnnotation = findStrongestAnnotationByKinds(annotations, [
    "hum",
    "hum_tone",
    "mains_hum",
  ]);
  const humSeverity = humAnnotation?.annotation.severity ?? 0;
  const humDurationSeconds = humAnnotation
    ? annotationDurationSeconds(humAnnotation.annotation)
    : 0;
  const humCoverageRatio =
    reportDurationSeconds > 0 ? humDurationSeconds / reportDurationSeconds : 0;
  const humBands = humAnnotation?.annotation.bands_hz;
  const humLooksLowFrequency = humBands === undefined || (humBands[0] <= 180 && humBands[1] <= 400);
  const humLooksSustained =
    humDurationSeconds >= Math.min(0.2, Math.max(0.05, reportDurationSeconds * 0.2));
  const clickAnnotation = findStrongestAnnotationByKinds(annotations, [
    "click",
    "clicks",
    "click_pop",
    "impulse_click",
    "pop",
    "pops",
  ]);
  const clickSeverity = clickAnnotation?.annotation.severity ?? 0;
  const clickDurationSeconds = clickAnnotation
    ? annotationDurationSeconds(clickAnnotation.annotation)
    : 0;
  const clickLooksImpulsive = clickDurationSeconds <= 0.15;

  if (humAnnotation && humSeverity >= 0.4 && humLooksLowFrequency && humLooksSustained) {
    descriptors.push({
      label: "hum_present",
      confidence: clamp(0.58 + humSeverity * 0.22 + Math.min(humCoverageRatio / 0.4, 0.08)),
      evidence_refs: [annotationEvidenceRef(report, humAnnotation.index)],
      rationale: humAnnotation.annotation.evidence?.length
        ? `A steady low-frequency hum annotation is present: ${humAnnotation.annotation.evidence}.`
        : "A steady low-frequency hum annotation is present.",
    });
  } else if (humSeverity >= 0.2 || (humAnnotation && humDurationSeconds > 0)) {
    unresolvedTerms.add("hum_present");
  }

  if (clickAnnotation && clickSeverity >= 0.38 && clickLooksImpulsive) {
    descriptors.push({
      label: "clicks_present",
      confidence: clamp(0.58 + clickSeverity * 0.26),
      evidence_refs: [annotationEvidenceRef(report, clickAnnotation.index)],
      rationale: clickAnnotation.annotation.evidence?.length
        ? `A short impulsive click annotation is present: ${clickAnnotation.annotation.evidence}.`
        : "A short impulsive click annotation is present.",
    });
  } else if (clickSeverity >= 0.2 || (clickAnnotation && clickDurationSeconds > 0.15)) {
    unresolvedTerms.add("clicks_present");
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

function hasDescriptor(descriptors: SemanticDescriptor[], label: string): boolean {
  return descriptors.some((descriptor) => descriptor.label === label);
}

function findStrongestAnnotation(
  annotations: AnalysisAnnotation[],
  kind: string,
): { annotation: AnalysisAnnotation; index: number } | undefined {
  return findAnnotations(annotations, kind)[0];
}

function findStrongestAnnotationByKinds(
  annotations: AnalysisAnnotation[],
  kinds: string[],
): { annotation: AnalysisAnnotation; index: number } | undefined {
  const normalizedKinds = new Set(kinds);

  return annotations
    .map((annotation, index) => ({ annotation, index }))
    .filter((item) => normalizedKinds.has(item.annotation.kind))
    .sort((left, right) => right.annotation.severity - left.annotation.severity)[0];
}

function findAnnotations(
  annotations: AnalysisAnnotation[],
  kind: string,
): Array<{ annotation: AnalysisAnnotation; index: number }> {
  const matches: Array<{ annotation: AnalysisAnnotation; index: number }> = [];

  for (const [index, annotation] of annotations.entries()) {
    if (annotation.kind !== kind) {
      continue;
    }

    matches.push({ annotation, index });
  }

  return matches.sort((left, right) => right.annotation.severity - left.annotation.severity);
}

function sumAnnotationCoverageSeconds(
  annotations: Array<{ annotation: AnalysisAnnotation; index: number }>,
): number {
  return annotations.reduce((total, item) => total + annotationDurationSeconds(item.annotation), 0);
}

function annotationDurationSeconds(annotation: AnalysisAnnotation): number {
  return Math.max(0, annotation.end_seconds - annotation.start_seconds);
}

function estimateReportDurationSeconds(report: AnalysisReport): number {
  let maximumEndSeconds = 0;

  for (const segment of report.segments ?? []) {
    maximumEndSeconds = Math.max(maximumEndSeconds, segment.end_seconds);
  }

  for (const annotation of report.annotations ?? []) {
    maximumEndSeconds = Math.max(maximumEndSeconds, annotation.end_seconds);
  }

  return Math.max(maximumEndSeconds, 1e-6);
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(Math.max(value, minimum), maximum);
}
