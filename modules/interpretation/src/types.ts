import type { AnalysisReport } from "@audio-language-interface/analysis";
import type { RuntimeCapabilityManifest } from "@audio-language-interface/capabilities";
import type { AudioVersion } from "@audio-language-interface/core";
import type { SemanticProfile } from "@audio-language-interface/semantics";

export const CONTRACT_SCHEMA_VERSION = "1.0.0" as const;
export const DEFAULT_PROMPT_VERSION = "intent_v1" as const;
export const DEFAULT_INTERPRETATION_POLICY = "conservative" as const;

export type InterpretationProviderKind = "openai" | "google";
export type InterpretationNextAction = "plan" | "clarify" | "refuse";
export type InterpretationPolicy = "conservative" | "best_effort";
export type DescriptorHypothesisStatus = "supported" | "weak" | "contradicted" | "unresolved";
export type InterpretationConstraintKind = "intensity" | "preserve" | "avoid" | "safety" | "scope";
export type RegionIntentScope = "full_file" | "time_range" | "segment_reference";
export type FollowUpIntentKind =
  | "direct_request"
  | "repeat_last_request"
  | "reduce_previous_intensity"
  | "undo"
  | "revert"
  | "try_another_version"
  | "unclear_follow_up";

export interface IntentInterpretationProviderMetadata {
  kind: InterpretationProviderKind;
  model: string;
  prompt_version: string;
  cached?: boolean;
  response_ms?: number;
}

export interface DescriptorHypothesis {
  label: string;
  status: DescriptorHypothesisStatus;
  supported_by?: string[];
  contradicted_by?: string[];
  needs_more_evidence?: string[];
  rationale?: string;
}

export interface InterpretationConstraint {
  kind: InterpretationConstraintKind;
  label: string;
  value?: string;
  rationale?: string;
}

export interface RegionIntent {
  scope: RegionIntentScope;
  start_seconds?: number;
  end_seconds?: number;
  reference?: string;
  rationale?: string;
}

export interface FollowUpIntent {
  kind: FollowUpIntentKind;
  rationale?: string;
}

export interface InterpretationAlternative {
  normalized_request: string;
  request_classification:
    | "supported"
    | "supported_but_underspecified"
    | "unsupported"
    | "supported_runtime_only_but_not_planner_enabled";
  next_action: InterpretationNextAction;
  normalized_objectives: string[];
  candidate_descriptors: string[];
  confidence: number;
  ambiguities?: string[];
  unsupported_phrases?: string[];
  clarification_question?: string;
  rationale: string;
}

export interface IntentInterpretation {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  interpretation_id: string;
  interpretation_policy: InterpretationPolicy;
  asset_id: string;
  version_id: string;
  analysis_report_id: string;
  semantic_profile_id: string;
  user_request: string;
  normalized_request: string;
  request_classification:
    | "supported"
    | "supported_but_underspecified"
    | "unsupported"
    | "supported_runtime_only_but_not_planner_enabled";
  next_action: InterpretationNextAction;
  normalized_objectives: string[];
  candidate_descriptors: string[];
  descriptor_hypotheses?: DescriptorHypothesis[];
  constraints?: InterpretationConstraint[];
  region_intents?: RegionIntent[];
  candidate_interpretations?: InterpretationAlternative[];
  follow_up_intent?: FollowUpIntent;
  ambiguities?: string[];
  unsupported_phrases?: string[];
  clarification_question?: string;
  grounding_notes?: string[];
  rationale: string;
  confidence: number;
  provider: IntentInterpretationProviderMetadata;
  generated_at: string;
}

export interface InterpretationProviderConfig {
  kind: InterpretationProviderKind;
  apiKey: string;
  model: string;
  baseUrl?: string;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface InterpretationSessionContext {
  current_version_id?: string;
  previous_request?: string;
  original_user_request?: string;
  follow_up_source?:
    | "direct_request"
    | "repeat_last_request"
    | "less"
    | "undo"
    | "revert"
    | "try_another_version";
}

export interface InterpretationCacheStore {
  get(key: string): Promise<IntentInterpretation | undefined> | IntentInterpretation | undefined;
  set(key: string, value: IntentInterpretation): Promise<void> | void;
}

export interface InterpretRequestOptions {
  userRequest: string;
  audioVersion: AudioVersion;
  analysisReport: AnalysisReport;
  semanticProfile: SemanticProfile;
  capabilityManifest?: RuntimeCapabilityManifest;
  provider: InterpretationProviderConfig;
  policy?: InterpretationPolicy;
  sessionContext?: InterpretationSessionContext;
  promptVersion?: string;
  generatedAt?: string;
  cacheStore?: InterpretationCacheStore;
  fetchImpl?: typeof fetch;
}

export interface IntentInterpretationCandidate {
  normalized_request: string;
  request_classification:
    | "supported"
    | "supported_but_underspecified"
    | "unsupported"
    | "supported_runtime_only_but_not_planner_enabled";
  next_action: InterpretationNextAction;
  normalized_objectives: string[];
  candidate_descriptors: string[];
  descriptor_hypotheses?: DescriptorHypothesis[];
  constraints?: InterpretationConstraint[];
  region_intents?: RegionIntent[];
  candidate_interpretations?: InterpretationAlternative[];
  follow_up_intent?: FollowUpIntent;
  ambiguities?: string[];
  unsupported_phrases?: string[];
  clarification_question?: string;
  grounding_notes?: string[];
  rationale: string;
  confidence: number;
}

export interface InterpretationProviderRequest {
  userRequest: string;
  audioVersion: AudioVersion;
  analysisReport: AnalysisReport;
  semanticProfile: SemanticProfile;
  capabilityManifest: RuntimeCapabilityManifest;
  provider: InterpretationProviderConfig;
  policy: InterpretationPolicy;
  sessionContext?: InterpretationSessionContext;
  promptVersion: string;
  fetchImpl?: typeof fetch;
}

export interface InterpretationProvider {
  interpret(input: InterpretationProviderRequest): Promise<IntentInterpretationCandidate>;
}
