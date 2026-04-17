import type { TransientMap as AnalysisTransientMap } from "@audio-language-interface/analysis";

export const CONTRACT_SCHEMA_VERSION = "1.0.0" as const;

export type OperationName =
  | "gain"
  | "normalize"
  | "trim"
  | "trim_silence"
  | "fade"
  | "pitch_shift"
  | "parametric_eq"
  | "high_pass_filter"
  | "low_pass_filter"
  | "compressor"
  | "limiter"
  | "time_stretch"
  | "reverse"
  | "mono_sum"
  | "channel_swap"
  | "stereo_balance_correction"
  | "stereo_width"
  | "denoise";

export type OperationStatus = "applied" | "skipped" | "failed";
export type TargetScope = "full_file" | "time_range" | "segment" | "channel" | "frequency_region";

export interface AudioVersion {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  version_id: string;
  asset_id: string;
  parent_version_id?: string;
  lineage: {
    created_at: string;
    created_by: string;
    reason?: string;
    plan_id?: string;
    transform_record_id?: string;
  };
  audio: {
    storage_ref: string;
    sample_rate_hz: number;
    channels: number;
    duration_seconds: number;
    frame_count: number;
    channel_layout?: string;
  };
  state?: {
    is_original?: boolean;
    is_preview?: boolean;
  };
}

export interface EditTarget {
  scope: TargetScope;
  start_seconds?: number;
  end_seconds?: number;
  channel?: string;
  segment_id?: string;
  bands_hz?: [number, number];
}

export interface SliceBoundary {
  start_seconds: number;
  end_seconds: number;
}

export interface SliceDefinition extends SliceBoundary {
  slice_id: string;
  peak_time_seconds?: number;
  label?: string;
  confidence?: number;
}

export type TransientMap = AnalysisTransientMap;

export interface SliceMap {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  slice_map_id: string;
  asset_id: string;
  version_id: string;
  generated_at: string;
  source_transient_map_id?: string;
  slicer: {
    name: string;
    version: string;
  };
  slices: SliceDefinition[];
}

export interface EditPlanStep {
  step_id: string;
  operation: OperationName;
  target: EditTarget;
  parameters: Record<string, unknown>;
  expected_effects: string[];
  safety_limits: string[];
}

export interface EditPlan {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  plan_id: string;
  asset_id: string;
  version_id: string;
  user_request: string;
  goals: string[];
  steps: EditPlanStep[];
  created_at: string;
  constraints?: string[];
  verification_targets?: string[];
  rationale?: string;
}

export interface TransformRecordOperation {
  operation: OperationName;
  parameters: Record<string, unknown>;
  status: OperationStatus;
}

export interface TransformRecord {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  record_id: string;
  plan_id?: string;
  asset_id: string;
  input_version_id: string;
  output_version_id: string;
  started_at: string;
  finished_at: string;
  runtime_ms?: number;
  warnings?: string[];
  operations: TransformRecordOperation[];
}

export interface FfmpegCommand {
  executable: string;
  args: string[];
  outputPath: string;
}

export interface FfmpegExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type FfmpegExecutor = (command: FfmpegCommand) => Promise<FfmpegExecutionResult>;

export interface ApplyOperationOptions {
  workspaceRoot: string;
  version: AudioVersion;
  operation: OperationName;
  parameters: Record<string, unknown>;
  target?: EditTarget;
  outputDir?: string;
  outputVersionId?: string;
  recordId?: string;
  createdAt?: Date;
  ffmpegPath?: string;
  executor?: FfmpegExecutor;
}

export interface ApplyEditPlanOptions {
  workspaceRoot: string;
  version: AudioVersion;
  plan: EditPlan;
  outputDir?: string;
  outputVersionId?: string;
  recordId?: string;
  createdAt?: Date;
  ffmpegPath?: string;
  executor?: FfmpegExecutor;
}

export interface ApplyTransformsResult {
  outputVersion: AudioVersion;
  transformRecord: TransformRecord;
  commands: FfmpegCommand[];
  warnings: string[];
}

export interface OperationBuildResult {
  filterChain: string;
  effectiveParameters: Record<string, unknown>;
  nextAudio: AudioVersion["audio"];
  requiresOutputProbe?: boolean;
}

export interface ExtractSliceOptions {
  workspaceRoot: string;
  version: AudioVersion;
  slice: SliceDefinition;
  outputDir?: string;
  outputVersionId?: string;
  recordId?: string;
  createdAt?: Date;
  ffmpegPath?: string;
  executor?: FfmpegExecutor;
}

export interface ExtractSlicesOptions {
  workspaceRoot: string;
  version: AudioVersion;
  slices?: SliceDefinition[];
  sliceMap?: SliceMap;
  outputDir?: string;
  outputVersionIds?: string[];
  recordIds?: string[];
  createdAt?: Date;
  ffmpegPath?: string;
  executor?: FfmpegExecutor;
}

export interface DeriveSliceMapFromTransientsOptions {
  version: AudioVersion;
  transientMap: TransientMap;
  generatedAt?: string;
  preRollSeconds?: number;
  postRollSeconds?: number;
  minimumSliceDurationSeconds?: number;
}

export interface SliceTransformRecordOperation {
  operation: "slice_extract";
  parameters: {
    slice_id: string;
    slice_index: number;
    start_seconds: number;
    end_seconds: number;
    duration_seconds: number;
  };
  status: OperationStatus;
}

export interface SliceTransformRecord {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  record_id: string;
  asset_id: string;
  input_version_id: string;
  output_version_id: string;
  slice_id: string;
  slice_index: number;
  started_at: string;
  finished_at: string;
  runtime_ms?: number;
  warnings?: string[];
  operations: SliceTransformRecordOperation[];
}

export interface SliceExtractionResultItem {
  slice_id: string;
  slice_index: number;
  source_range: SliceBoundary & { duration_seconds: number };
  outputVersion: AudioVersion;
  transformRecord: SliceTransformRecord;
  commands: FfmpegCommand[];
  warnings: string[];
}

export interface SliceExtractionResult {
  outputs: SliceExtractionResultItem[];
}
