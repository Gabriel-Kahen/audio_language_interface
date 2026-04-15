export const CONTRACT_SCHEMA_VERSION = "1.0.0" as const;

export type OperationName =
  | "gain"
  | "normalize"
  | "trim"
  | "fade"
  | "parametric_eq"
  | "high_pass_filter"
  | "low_pass_filter"
  | "compressor"
  | "limiter";

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
}
