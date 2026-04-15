import type { AnalysisReport } from "@audio-language-interface/analysis";

export interface SemanticDescriptor {
  label: string;
  confidence: number;
  evidence_refs: string[];
  rationale: string;
}

export interface SemanticProfile {
  schema_version: "1.0.0";
  profile_id: string;
  analysis_report_id: string;
  asset_id: string;
  version_id: string;
  generated_at: string;
  descriptors: SemanticDescriptor[];
  summary: {
    plain_text: string;
    caveats?: string[];
  };
  unresolved_terms?: string[];
}

export interface BuildSemanticProfileOptions {
  generatedAt?: string;
}

export interface DescriptorAssessment {
  descriptor: SemanticDescriptor;
}

export interface SemanticAssessment {
  descriptors: SemanticDescriptor[];
  unresolvedTerms: string[];
}

export type { AnalysisReport };
