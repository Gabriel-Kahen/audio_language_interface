export const CONTRACT_SCHEMA_VERSION = "1.0.0" as const;

export type RuntimeOperationName =
  | "gain"
  | "normalize"
  | "trim"
  | "trim_silence"
  | "fade"
  | "pitch_shift"
  | "parametric_eq"
  | "high_pass_filter"
  | "low_pass_filter"
  | "high_shelf"
  | "low_shelf"
  | "notch_filter"
  | "tilt_eq"
  | "compressor"
  | "limiter"
  | "transient_shaper"
  | "clipper"
  | "gate"
  | "time_stretch"
  | "reverse"
  | "mono_sum"
  | "pan"
  | "channel_swap"
  | "channel_remap"
  | "stereo_balance_correction"
  | "mid_side_eq"
  | "stereo_width"
  | "denoise"
  | "de_esser"
  | "declick"
  | "dehum"
  | "reverb"
  | "delay"
  | "echo"
  | "bitcrush"
  | "distortion"
  | "saturation"
  | "flanger"
  | "phaser";

export type RuntimeTargetScope =
  | "full_file"
  | "time_range"
  | "segment"
  | "channel"
  | "frequency_region";

export type RuntimeIntentSupport = "planner_supported" | "runtime_only";
export type RuntimeOperationCategory =
  | "level"
  | "timing"
  | "tonal"
  | "dynamics"
  | "stereo"
  | "restoration"
  | "effects";
export type RuntimeParameterValueType = "number" | "integer" | "string" | "boolean" | "enum";

export interface RuntimeParameterSpec {
  name: string;
  value_type: RuntimeParameterValueType;
  required: boolean;
  description: string;
  minimum?: number;
  maximum?: number;
  unit?: string;
  enum_values?: string[];
  default_value?: string | number | boolean;
  example_value?: string | number | boolean;
}

export interface RuntimeChannelRequirements {
  min_channels?: number;
  max_channels?: number;
  exact_channels?: number;
}

export interface RuntimeOperationCapability {
  name: RuntimeOperationName;
  category: RuntimeOperationCategory;
  summary: string;
  intent_support: RuntimeIntentSupport;
  supported_target_scopes: RuntimeTargetScope[];
  parameters: RuntimeParameterSpec[];
  channel_requirements?: RuntimeChannelRequirements;
  constraints?: string[];
  planner_notes?: string[];
}

export interface RuntimeCapabilityManifest {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  manifest_id: string;
  generated_at: string;
  runtime_layer: "audio_runtime";
  summary: string;
  operations: RuntimeOperationCapability[];
  limitations?: string[];
}
