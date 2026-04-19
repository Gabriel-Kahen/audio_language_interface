import { createHash } from "node:crypto";

import { ANALYZER_NAME, ANALYZER_VERSION, SCHEMA_VERSION } from "./constants.js";
import type {
  AnalysisAnnotation,
  AnalysisMeasurements,
  AnalysisReport,
  AnalysisSegment,
  AudioVersion,
  MaterialCharacter,
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
  materialCharacter: MaterialCharacter;
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
      plain_text: buildPlainTextSummary(
        input.measurements,
        input.sourceCharacter,
        input.annotations,
      ),
      confidence: summaryConfidence,
    },
    measurements: input.measurements,
    annotations: input.annotations,
    segments: input.segments,
    source_character: input.sourceCharacter,
    material_character: input.materialCharacter,
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
  annotations: AnalysisAnnotation[],
): string {
  const brightness = describeBrightness(measurements.spectral_balance);
  const stereo = describeStereo(measurements.stereo, annotations);
  const dynamics =
    measurements.dynamics.transient_density_per_second >= 1.5 ||
    (measurements.dynamics.transient_crest_db ?? 0) >= 10
      ? "with strong transient impact"
      : "with restrained transient activity";
  const artifacts = describeArtifacts(measurements.artifacts);

  return `${capitalize(brightness)} ${stereo} ${sourceCharacter.primary_class.replace(/_/g, " ")} ${dynamics}. ${artifacts}`;
}

function describeBrightness(measurements: AnalysisMeasurements["spectral_balance"]): string {
  const brightnessTiltDb =
    measurements.brightness_tilt_db ?? measurements.high_band_db - measurements.low_band_db;

  if (brightnessTiltDb > 6) {
    return "bright";
  }
  if (brightnessTiltDb < -6) {
    return "dark";
  }
  return "balanced";
}

function describeStereo(
  measurements: AnalysisMeasurements["stereo"],
  annotations: AnalysisAnnotation[],
): string {
  if (measurements.width < 0.05) {
    return "mono";
  }

  if (measurements.width < 0.2) {
    return "narrow stereo";
  }

  const hasStableWidthEvidence = annotations.some(
    (annotation) => annotation.kind === "stereo_width",
  );
  const hasAmbiguousWidthEvidence = annotations.some(
    (annotation) => annotation.kind === "stereo_ambiguity",
  );

  if (hasAmbiguousWidthEvidence || measurements.correlation < 0.1) {
    return "stereo spread with ambiguous width cues";
  }

  if (hasStableWidthEvidence && measurements.correlation >= 0.15) {
    return "wide stereo";
  }

  return "stereo spread";
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

function describeArtifacts(measurements: AnalysisMeasurements["artifacts"]): string {
  const present: string[] = [];

  if (measurements.clipping_detected) {
    present.push("clipping");
  }
  if (measurements.hum_detected) {
    present.push("mains hum");
  }
  if (measurements.click_detected) {
    present.push("click artifacts");
  }

  if (present.length === 0) {
    return "No clipping, hum, or click artifacts were detected.";
  }

  if (present.length === 1) {
    switch (present[0]) {
      case "clipping":
        return "Clipping is present.";
      case "mains hum":
        return "Mains hum is present.";
      case "click artifacts":
        return "Click artifacts are present.";
      default:
        break;
    }
  }

  return `${capitalize(joinWithAnd(present))} are present.`;
}

function joinWithAnd(values: string[]): string {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}
