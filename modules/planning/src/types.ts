import type {
  AnalysisAnnotation as UpstreamAnalysisAnnotation,
  AnalysisReport as UpstreamAnalysisReport,
  AnalysisSegment as UpstreamAnalysisSegment,
} from "@audio-language-interface/analysis";
import type {
  RuntimeOperationName,
  RuntimeTargetScope,
} from "@audio-language-interface/capabilities";
import type { AudioVersion as CoreAudioVersion } from "@audio-language-interface/core";
import type {
  SemanticDescriptor as UpstreamSemanticDescriptor,
  SemanticProfile as UpstreamSemanticProfile,
} from "@audio-language-interface/semantics";

export const CONTRACT_SCHEMA_VERSION = "1.0.0" as const;

export type OperationName = RuntimeOperationName;
export type TargetScope = RuntimeTargetScope;

export type AudioVersion = CoreAudioVersion;
export type AnalysisAnnotation = UpstreamAnalysisAnnotation;
export type AnalysisSegment = UpstreamAnalysisSegment;
export type AnalysisReport = UpstreamAnalysisReport;
export type SemanticDescriptor = UpstreamSemanticDescriptor;
export type SemanticProfile = UpstreamSemanticProfile;

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
  capability_manifest_id: string;
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

export interface ParsedEditObjectives {
  raw_request: string;
  normalized_request: string;
  wants_darker: boolean;
  wants_brighter: boolean;
  wants_cleaner: boolean;
  wants_less_harsh: boolean;
  wants_less_muddy: boolean;
  wants_more_warmth: boolean;
  wants_remove_rumble: boolean;
  wants_louder: boolean;
  wants_quieter: boolean;
  wants_more_controlled_dynamics: boolean;
  wants_peak_control: boolean;
  wants_denoise: boolean;
  wants_wider: boolean;
  wants_narrower: boolean;
  preserve_punch: boolean;
  ambiguous_requests: string[];
  unsupported_requests: string[];
  trim_range?: {
    start_seconds: number;
    end_seconds: number;
  };
  fade_in_seconds?: number;
  fade_out_seconds?: number;
  intensity: "subtle" | "default" | "strong";
}

export interface PlanEditsOptions {
  userRequest: string;
  audioVersion: AudioVersion;
  analysisReport: AnalysisReport;
  semanticProfile: SemanticProfile;
  generatedAt?: string;
  constraints?: string[];
}
