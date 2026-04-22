import type { AnalysisReport } from "@audio-language-interface/analysis";
import type { RuntimeCapabilityManifest } from "@audio-language-interface/capabilities";
import type { AudioVersion } from "@audio-language-interface/core";
import type { SemanticProfile } from "@audio-language-interface/semantics";

export const CONTRACT_SCHEMA_VERSION = "1.0.0" as const;
export const DEFAULT_PROMPT_VERSION = "intent_v1" as const;

export type InterpretationProviderKind = "openai" | "google";

export interface IntentInterpretationProviderMetadata {
  kind: InterpretationProviderKind;
  model: string;
  prompt_version: string;
}

export interface IntentInterpretation {
  schema_version: typeof CONTRACT_SCHEMA_VERSION;
  interpretation_id: string;
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
  normalized_objectives: string[];
  candidate_descriptors: string[];
  ambiguities?: string[];
  unsupported_phrases?: string[];
  clarification_question?: string;
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
}

export interface InterpretRequestOptions {
  userRequest: string;
  audioVersion: AudioVersion;
  analysisReport: AnalysisReport;
  semanticProfile: SemanticProfile;
  capabilityManifest?: RuntimeCapabilityManifest;
  provider: InterpretationProviderConfig;
  promptVersion?: string;
  generatedAt?: string;
  fetchImpl?: typeof fetch;
}

export interface IntentInterpretationCandidate {
  normalized_request: string;
  request_classification:
    | "supported"
    | "supported_but_underspecified"
    | "unsupported"
    | "supported_runtime_only_but_not_planner_enabled";
  normalized_objectives: string[];
  candidate_descriptors: string[];
  ambiguities?: string[];
  unsupported_phrases?: string[];
  clarification_question?: string;
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
  promptVersion: string;
  fetchImpl?: typeof fetch;
}

export interface InterpretationProvider {
  interpret(input: InterpretationProviderRequest): Promise<IntentInterpretationCandidate>;
}
