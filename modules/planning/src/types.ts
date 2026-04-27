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
export type PlannerRequestClass =
  | "supported"
  | "supported_but_underspecified"
  | "unsupported"
  | "supported_runtime_only_but_not_planner_enabled";
export type PlannerFailureClass = Exclude<PlannerRequestClass, "supported">;
export type InterpretationNextAction = "plan" | "clarify" | "refuse";
export type DescriptorHypothesisStatus = "supported" | "weak" | "contradicted" | "unresolved";

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

export interface RegionTarget {
  scope: "time_range";
  start_seconds: number;
  end_seconds: number;
}

export type RegionTargetHint =
  | {
      kind: "absolute_range";
      start_seconds: number;
      end_seconds: number;
      source_phrase: string;
    }
  | {
      kind: "leading_window";
      duration_seconds: number;
      source_phrase: string;
    }
  | {
      kind: "trailing_window";
      duration_seconds: number;
      source_phrase: string;
    };

export interface EditPlanStep {
  step_id: string;
  operation: OperationName;
  target: EditTarget;
  parameters: Record<string, unknown>;
  expected_effects: string[];
  safety_limits: string[];
}

export type VerificationTargetKind = "analysis_metric" | "semantic_delta" | "regression_guard";
export type VerificationComparison =
  | "increase_by"
  | "decrease_by"
  | "at_most"
  | "at_least"
  | "within"
  | "present"
  | "absent";

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
  target?: EditTarget;
  rationale?: string;
}

export interface EditPlan {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  plan_id: string;
  capability_manifest_id: string;
  asset_id: string;
  version_id: string;
  user_request: string;
  interpreted_user_request?: string;
  intent_interpretation_id?: string;
  goals: string[];
  steps: EditPlanStep[];
  created_at: string;
  constraints?: string[];
  verification_targets?: Array<string | VerificationTarget>;
  rationale?: string;
}

export interface PlannerIntentInterpretationInput {
  interpretationId?: string;
  normalizedRequest: string;
  normalizedObjectives?: string[];
  requestClassification?: PlannerRequestClass;
  nextAction?: InterpretationNextAction;
  ambiguities?: string[];
  unsupportedPhrases?: string[];
  clarificationQuestion?: string;
  constraints?: Array<{
    kind: "intensity" | "preserve" | "avoid" | "safety" | "scope";
    label: string;
    value?: string;
    rationale?: string;
  }>;
  regionIntents?: Array<{
    scope: "full_file" | "time_range" | "segment_reference";
    start_seconds?: number;
    end_seconds?: number;
    reference?: string;
    rationale?: string;
  }>;
  descriptorHypotheses?: Array<{
    label: string;
    status: DescriptorHypothesisStatus;
    supportedBy?: string[];
    contradictedBy?: string[];
    needsMoreEvidence?: string[];
    rationale?: string;
  }>;
  candidateInterpretations?: Array<{
    normalizedRequest: string;
    requestClassification: PlannerRequestClass;
    nextAction: InterpretationNextAction;
    confidence: number;
  }>;
  followUpIntent?: {
    kind:
      | "direct_request"
      | "repeat_last_request"
      | "reduce_previous_intensity"
      | "undo"
      | "revert"
      | "try_another_version"
      | "unclear_follow_up";
    rationale?: string;
  };
  groundingNotes?: string[];
}

export interface ParsedEditObjectives {
  raw_request: string;
  normalized_request: string;
  request_classification: PlannerRequestClass;
  wants_trim_silence: boolean;
  trim_leading_silence: boolean;
  trim_trailing_silence: boolean;
  wants_darker: boolean;
  wants_brighter: boolean;
  wants_more_air: boolean;
  wants_cleaner: boolean;
  wants_less_harsh: boolean;
  wants_less_muddy: boolean;
  wants_more_warmth: boolean;
  wants_remove_rumble: boolean;
  wants_louder: boolean;
  wants_quieter: boolean;
  wants_more_even_level: boolean;
  wants_more_controlled_dynamics: boolean;
  wants_peak_control: boolean;
  wants_denoise: boolean;
  wants_tame_sibilance: boolean;
  wants_remove_clicks: boolean;
  wants_remove_hum: boolean;
  wants_wider: boolean;
  wants_narrower: boolean;
  wants_more_centered: boolean;
  wants_speed_up: boolean;
  wants_slow_down: boolean;
  wants_pitch_shift: boolean;
  preserve_punch: boolean;
  supported_but_underspecified_requests: string[];
  unsupported_requests: string[];
  supported_runtime_only_but_not_planner_enabled_requests: string[];
  runtime_only_operations_requested: OperationName[];
  trim_range?: {
    start_seconds: number;
    end_seconds: number;
  };
  region_target?: RegionTarget;
  region_target_hint?: RegionTargetHint;
  fade_in_seconds?: number;
  fade_out_seconds?: number;
  hum_frequency_hz?: number;
  stretch_ratio?: number;
  pitch_shift_semitones?: number;
  intensity: "subtle" | "default" | "strong";
}

export interface PlanEditsOptions {
  userRequest: string;
  audioVersion: AudioVersion;
  analysisReport: AnalysisReport;
  semanticProfile: SemanticProfile;
  intentInterpretation?: PlannerIntentInterpretationInput;
  workspaceRoot?: string;
  generatedAt?: string;
  constraints?: string[];
}
