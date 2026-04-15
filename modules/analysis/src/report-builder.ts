import { createHash } from "node:crypto";

import { ANALYZER_NAME, ANALYZER_VERSION, SCHEMA_VERSION } from "./constants.js";
import type {
  AnalysisAnnotation,
  AnalysisMeasurements,
  AnalysisReport,
  AnalysisSegment,
  AudioVersion,
  SourceCharacter,
} from "./types.js";
import { clamp } from "./utils/math.js";

interface BuildAnalysisReportInput {
  audioVersion: AudioVersion;
  generatedAt: string;
  measurements: AnalysisMeasurements;
  annotations: AnalysisAnnotation[];
  segments: AnalysisSegment[];
  sourceCharacter: SourceCharacter;
}

export function buildAnalysisReport(input: BuildAnalysisReportInput): AnalysisReport {
  const summaryConfidence = estimateSummaryConfidence(input.measurements, input.sourceCharacter);

  return {
    schema_version: SCHEMA_VERSION,
    report_id: createAnalysisReportId(input.audioVersion),
    asset_id: input.audioVersion.asset_id,
    version_id: input.audioVersion.version_id,
    generated_at: input.generatedAt,
    analyzer: {
      name: ANALYZER_NAME,
      version: ANALYZER_VERSION,
    },
    summary: {
      plain_text: buildPlainTextSummary(input.measurements, input.sourceCharacter),
      confidence: summaryConfidence,
    },
    measurements: input.measurements,
    annotations: input.annotations,
    segments: input.segments,
    source_character: input.sourceCharacter,
  };
}

function createAnalysisReportId(audioVersion: AudioVersion): string {
  const digest = createHash("sha256")
    .update(audioVersion.version_id)
    .update("|")
    .update(audioVersion.audio.storage_ref)
    .update("|")
    .update(ANALYZER_NAME)
    .update("|")
    .update(ANALYZER_VERSION)
    .digest("hex")
    .slice(0, 24)
    .toUpperCase();

  return `analysis_${digest}`;
}

function buildPlainTextSummary(
  measurements: AnalysisMeasurements,
  sourceCharacter: SourceCharacter,
): string {
  const brightness = describeBrightness(measurements.spectral_balance);
  const stereo = describeStereo(measurements.stereo.width);
  const dynamics =
    measurements.dynamics.transient_density_per_second >= 1.5
      ? "with strong transient activity"
      : "with restrained transient activity";
  const artifacts = measurements.artifacts.clipping_detected
    ? "Clipping is present."
    : "No clipping was detected.";

  return `${capitalize(brightness)} ${stereo} ${sourceCharacter.primary_class.replace(/_/g, " ")} ${dynamics}. ${artifacts}`;
}

function describeBrightness(measurements: AnalysisMeasurements["spectral_balance"]): string {
  const highMinusLow = measurements.high_band_db - measurements.low_band_db;
  if (highMinusLow > 6) {
    return "bright";
  }
  if (highMinusLow < -6) {
    return "dark";
  }
  return "balanced";
}

function describeStereo(width: number): string {
  if (width < 0.05) {
    return "mono";
  }
  if (width < 0.2) {
    return "narrow stereo";
  }
  return "wide stereo";
}

function estimateSummaryConfidence(
  measurements: AnalysisMeasurements,
  sourceCharacter: SourceCharacter,
): number {
  const confidence =
    sourceCharacter.confidence * 0.6 +
    clamp(measurements.stereo.correlation * 0.25 + 0.25, 0, 1) * 0.1 +
    clamp(1 - Math.abs(measurements.stereo.balance_db) / 12, 0, 1) * 0.1 +
    clamp(1 + measurements.artifacts.noise_floor_dbfs / 120, 0, 1) * 0.2;

  return clamp(confidence, 0, 1);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
