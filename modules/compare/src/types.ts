import type { AnalysisReport as UpstreamAnalysisReport } from "@audio-language-interface/analysis";
import type { AudioVersion as UpstreamAudioVersion } from "@audio-language-interface/core";

export const CONTRACT_SCHEMA_VERSION = "1.0.0" as const;

export type ComparisonRefType = "version" | "render";
export type MetricDirection = "increased" | "decreased" | "unchanged";
export type GoalStatus = "met" | "mostly_met" | "not_met" | "unknown";
export type ComparisonMetricSource = "analysis_reports" | "render_artifacts";
export type GoalEvaluationSource = "structured_verification" | "heuristic_goal_alignment" | "none";
export type ComparisonAuthoritativeSignal =
  | "verification_results"
  | "goal_alignment"
  | "metric_deltas";
export type VerificationTargetKind = "analysis_metric" | "semantic_delta" | "regression_guard";
export type VerificationComparison =
  | "increase_by"
  | "decrease_by"
  | "at_most"
  | "at_least"
  | "within"
  | "present"
  | "absent";

export type AudioVersion = UpstreamAudioVersion;

export interface RenderArtifact {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  render_id: string;
  asset_id: string;
  version_id: string;
  kind: "preview" | "final";
  created_at: string;
  output: {
    path: string;
    format: string;
    codec: string;
    sample_rate_hz: number;
    channels: number;
    duration_seconds: number;
    file_size_bytes?: number;
  };
  loudness_summary?: Record<string, number>;
  warnings?: string[];
}

export interface AnalysisMeasurements {
  levels: {
    integrated_lufs: number;
    true_peak_dbtp: number;
    rms_dbfs?: number;
    sample_peak_dbfs?: number;
    headroom_db?: number;
  };
  dynamics: {
    crest_factor_db: number;
    transient_density_per_second: number;
    rms_short_term_dbfs?: number;
    dynamic_range_db?: number;
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
    balance_db?: number;
  };
  artifacts: {
    clipping_detected: boolean;
    noise_floor_dbfs: number;
    clipped_sample_count?: number;
    clipped_frame_count?: number;
    clipped_frame_ratio?: number;
    clipping_severity?: number;
    hum_detected?: boolean;
    hum_fundamental_hz?: number;
    hum_harmonic_count?: number;
    hum_level_dbfs?: number;
    click_detected?: boolean;
    click_count?: number;
    click_rate_per_second?: number;
  };
}

export interface DerivedMeasurements {
  duration_seconds?: number;
  leading_silence_seconds?: number;
  trailing_silence_seconds?: number;
  pitch_center_hz?: number;
  absolute_stereo_balance_db?: number;
}

export interface AnalysisAnnotation {
  kind: string;
  start_seconds: number;
  end_seconds: number;
  severity: number;
  bands_hz?: [number, number];
  evidence?: string;
}

export type AnalysisReport = UpstreamAnalysisReport;

export interface EditPlan {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  plan_id: string;
  capability_manifest_id: string;
  asset_id: string;
  version_id: string;
  user_request: string;
  goals: string[];
  verification_targets?: Array<string | VerificationTarget>;
}

export interface MetricDelta {
  metric: string;
  direction: MetricDirection;
  delta: number;
}

export interface SemanticDelta {
  label: string;
  confidence: number;
  evidence: string;
}

export interface RegressionWarning {
  kind: string;
  severity: number;
  description: string;
}

export interface GoalAlignmentVerificationRollup {
  total_targets: number;
  met_targets: number;
  mostly_met_targets: number;
  not_met_targets: number;
  unknown_targets: number;
  requested_target_count: number;
  requested_target_status?: GoalStatus;
  regression_guard_count: number;
  regression_guard_status?: GoalStatus;
}

export interface GoalAlignment {
  goal: string;
  status: GoalStatus;
  verification_rollup?: GoalAlignmentVerificationRollup;
}

export interface VerificationTarget {
  target_id: string;
  goal: string;
  label: string;
  kind: VerificationTargetKind;
  comparison: VerificationComparison;
  metric?: string;
  semantic_label?: string;
  regression_kind?: string;
  threshold?: number;
  tolerance?: number;
  target?: {
    scope: "full_file" | "time_range" | "segment" | "channel" | "frequency_region";
    start_seconds?: number;
    end_seconds?: number;
    channel?: string;
    segment_id?: string;
    bands_hz?: [number, number];
  };
  rationale?: string;
}

export interface VerificationTargetResult extends VerificationTarget {
  status: GoalStatus;
  observed_delta?: number;
  observed_value?: number;
  observed_confidence?: number;
  observed_severity?: number;
  evidence?: string;
}

export interface ComparisonEvaluationBasis {
  metric_source: ComparisonMetricSource;
  goal_evaluation_source: GoalEvaluationSource;
  authoritative_signal: ComparisonAuthoritativeSignal;
}

export interface ComparisonReport {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  comparison_id: string;
  baseline: {
    ref_type: ComparisonRefType;
    ref_id: string;
  };
  candidate: {
    ref_type: ComparisonRefType;
    ref_id: string;
  };
  generated_at: string;
  metric_deltas: MetricDelta[];
  semantic_deltas?: SemanticDelta[];
  regressions?: RegressionWarning[];
  goal_alignment?: GoalAlignment[];
  verification_results?: VerificationTargetResult[];
  evaluation_basis?: ComparisonEvaluationBasis;
  summary: {
    plain_text: string;
  };
}

export interface ComparisonRefs {
  baseline: ComparisonReport["baseline"];
  candidate: ComparisonReport["candidate"];
}

export interface CompareVersionsOptions {
  baselineVersion: AudioVersion;
  candidateVersion: AudioVersion;
  baselineAnalysis: AnalysisReport;
  candidateAnalysis: AnalysisReport;
  workspaceRoot?: string;
  editPlan?: EditPlan;
  comparisonId?: string;
  generatedAt?: string | Date;
}

export interface CompareRendersOptions {
  baselineRender: RenderArtifact;
  candidateRender: RenderArtifact;
  baselineAnalysis?: AnalysisReport;
  candidateAnalysis?: AnalysisReport;
  editPlan?: EditPlan;
  comparisonId?: string;
  generatedAt?: string | Date;
}
