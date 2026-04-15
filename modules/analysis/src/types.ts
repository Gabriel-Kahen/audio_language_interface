import type { AudioVersion as CoreAudioVersion } from "../../core/src/index.js";

/** Contract-aligned audio version input consumed by the analysis module. */
export type AudioVersion = CoreAudioVersion;

/** Localized machine-readable finding with optional band information. */
export interface AnalysisAnnotation {
  kind: string;
  start_seconds: number;
  end_seconds: number;
  bands_hz?: [number, number];
  severity: number;
  evidence?: string;
}

/** Time-ordered structural region emitted by the segment analyzer. */
export interface AnalysisSegment {
  kind: string;
  start_seconds: number;
  end_seconds: number;
}

/** Coarse heuristic source classification for downstream consumers. */
export interface SourceCharacter {
  primary_class: string;
  pitched: boolean;
  confidence: number;
}

/** Structured measurement groups emitted by the baseline analyzer. */
export interface AnalysisMeasurements {
  levels: {
    integrated_lufs: number;
    true_peak_dbtp: number;
    rms_dbfs: number;
    sample_peak_dbfs: number;
    headroom_db: number;
  };
  dynamics: {
    crest_factor_db: number;
    transient_density_per_second: number;
    rms_short_term_dbfs: number;
    dynamic_range_db: number;
  };
  spectral_balance: {
    low_band_db: number;
    mid_band_db: number;
    high_band_db: number;
    spectral_centroid_hz: number;
  };
  stereo: {
    width: number;
    correlation: number;
    balance_db: number;
  };
  artifacts: {
    clipping_detected: boolean;
    noise_floor_dbfs: number;
    clipped_sample_count: number;
  };
}

/** Top-level structured output produced by `analyzeAudioVersion`. */
export interface AnalysisReport {
  schema_version: "1.0.0";
  report_id: string;
  asset_id: string;
  version_id: string;
  generated_at: string;
  analyzer: {
    name: string;
    version: string;
  };
  summary: {
    plain_text: string;
    confidence?: number;
  };
  measurements: AnalysisMeasurements;
  annotations?: AnalysisAnnotation[];
  segments?: AnalysisSegment[];
  source_character?: SourceCharacter;
}

/** Decoded floating-point audio representation used internally by analyzers. */
export interface NormalizedAudioData {
  sourcePath: string;
  sampleRateHz: number;
  durationSeconds: number;
  frameCount: number;
  channels: Float32Array[];
  mono: Float32Array;
}

/** Internal segment-analysis result reused by other analyzers. */
export interface SegmentAnalysisResult {
  segments: AnalysisSegment[];
  transientDensityPerSecond: number;
  activeFrameRatio: number;
}

/** Optional controls for path resolution and deterministic timestamps. */
export interface AnalyzeAudioOptions {
  workspaceRoot?: string;
  generatedAt?: string;
}
