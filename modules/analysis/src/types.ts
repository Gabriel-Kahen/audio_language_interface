import type { AudioVersion as CoreAudioVersion } from "@audio-language-interface/core";

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

/** Discrete voicing state emitted by the standalone pitch-center estimator. */
export type PitchCenterVoicing = "voiced" | "mixed" | "unvoiced";

/** Narrow machine-readable output emitted by `estimatePitchCenter`. */
export interface PitchCenterEstimate {
  voicing: PitchCenterVoicing;
  confidence: number;
  frequency_hz?: number;
  midi_note?: number;
  note_name?: string;
  uncertainty_cents?: number;
  analyzed_window_count: number;
  voiced_window_count: number;
  voiced_window_ratio: number;
}

/** Conservative material classification for loop-versus-shot consumers. */
export type MaterialCharacterClassification = "one_shot" | "loop" | "unknown";

/** Conservative material classification with explicit uncertainty. */
export interface MaterialCharacter {
  classification: MaterialCharacterClassification;
  confidence: number;
  evidence?: string;
}

/** Single machine-readable transient event emitted by the transient detector. */
export interface TransientEvent {
  time_seconds: number;
  strength: number;
  kind?: string;
  confidence?: number;
}

/** Structured output emitted by the standalone transient detector. */
export interface TransientMap {
  schema_version: "1.0.0";
  transient_map_id: string;
  asset_id: string;
  version_id: string;
  generated_at: string;
  detector: {
    name: string;
    version: string;
  };
  transients: TransientEvent[];
}

/** Narrow structured output emitted by the standalone tempo estimator. */
export interface TempoEstimate {
  bpm: number | null;
  confidence: number;
  beat_interval_seconds?: number;
  ambiguity_candidates_bpm?: number[];
}

/** One candidate loop span emitted by the standalone loop-boundary suggester. */
export interface LoopBoundarySuggestion {
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  confidence: number;
  rationale: string;
}

/** Structured output emitted by the standalone loop-boundary suggester. */
export interface LoopBoundarySuggestionSet {
  schema_version: "1.0.0";
  loop_boundary_suggestion_id: string;
  asset_id: string;
  version_id: string;
  generated_at: string;
  detector: {
    name: string;
    version: string;
  };
  suggestions: LoopBoundarySuggestion[];
}

export interface LoopBoundarySuggestionOptions {
  workspaceRoot?: string;
  generatedAt?: string;
  maxSuggestions?: number;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
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
    transient_crest_db?: number;
    punch_window_ratio?: number;
  };
  spectral_balance: {
    low_band_db: number;
    mid_band_db: number;
    high_band_db: number;
    spectral_centroid_hz: number;
    brightness_tilt_db?: number;
    presence_band_db?: number;
    harshness_ratio_db?: number;
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
    clipped_frame_count?: number;
    clipped_frame_ratio?: number;
    clipping_severity?: number;
    hum_detected: boolean;
    hum_fundamental_hz?: number;
    hum_harmonic_count: number;
    hum_level_dbfs?: number;
    click_detected: boolean;
    click_count: number;
    click_rate_per_second: number;
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
  material_character?: MaterialCharacter;
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

/** Optional controls for standalone pitch-center estimation. */
export interface EstimatePitchCenterOptions {
  workspaceRoot?: string;
}

/** Optional controls for transient-map generation. */
export interface TransientDetectionOptions {
  workspaceRoot?: string;
  generatedAt?: string;
}

/** Optional controls for standalone tempo estimation. */
export interface TempoEstimationOptions {
  workspaceRoot?: string;
  minBpm?: number;
  maxBpm?: number;
  maxCandidates?: number;
}
