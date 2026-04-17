export const CONTRACT_SCHEMA_VERSION = "1.0.0" as const;

export type ComparisonRefType = "version" | "render";
export type MetricDirection = "increased" | "decreased" | "unchanged";
export type GoalStatus = "met" | "mostly_met" | "not_met" | "unknown";

export interface AudioVersion {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  version_id: string;
  asset_id: string;
}

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
    balance_db?: number;
  };
  artifacts: {
    clipping_detected: boolean;
    noise_floor_dbfs: number;
    clipped_sample_count?: number;
  };
}

export interface AnalysisReport {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
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
}

export interface EditPlan {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  plan_id: string;
  capability_manifest_id: string;
  asset_id: string;
  version_id: string;
  user_request: string;
  goals: string[];
  verification_targets?: string[];
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

export interface GoalAlignment {
  goal: string;
  status: GoalStatus;
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
