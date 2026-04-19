import type { AnalysisReport, AnalyzeAudioOptions } from "@audio-language-interface/analysis";
import type { ComparisonReport } from "@audio-language-interface/compare";
import type { AudioAsset, AudioVersion } from "@audio-language-interface/core";
import type { SessionGraph } from "@audio-language-interface/history";
import type { ImportAudioOptions, ImportAudioResult } from "@audio-language-interface/io";
import type { EditPlan } from "@audio-language-interface/planning";
import type {
  FinalRenderOptions,
  PreviewRenderOptions,
  RenderArtifact,
  RenderResult,
} from "@audio-language-interface/render";
import type { SemanticDescriptor, SemanticProfile } from "@audio-language-interface/semantics";
import type { ApplyTransformsResult } from "@audio-language-interface/transforms";

import type { FollowUpResolution } from "./follow-up-request.js";

export type {
  AnalysisReport,
  AnalyzeAudioOptions,
  ApplyTransformsResult,
  AudioAsset,
  AudioVersion,
  ComparisonReport,
  EditPlan,
  FinalRenderOptions,
  FollowUpResolution,
  ImportAudioOptions,
  ImportAudioResult,
  PreviewRenderOptions,
  RenderArtifact,
  RenderResult,
  SemanticDescriptor,
  SemanticProfile,
  SessionGraph,
};
export type WorkflowStage =
  | "import"
  | "analyze_input"
  | "resolve_follow_up"
  | "load_revert_target"
  | "semantic_profile"
  | "plan"
  | "apply"
  | "analyze_output"
  | "render_baseline"
  | "render_candidate"
  | "compare";

export interface WorkflowTraceEntry {
  stage: WorkflowStage;
  status: "ok" | "error";
  started_at: string;
  completed_at: string;
  attempts: number;
  pass?: number;
  message?: string;
}

export interface FailurePolicy {
  maxAttemptsByStage?: Partial<Record<WorkflowStage, number>>;
  shouldRetry?: (input: {
    stage: WorkflowStage;
    attempt: number;
    error: Error;
  }) => boolean | Promise<boolean>;
}

export interface OrchestrationDependencies {
  importAudioFromFile: typeof import("@audio-language-interface/io").importAudioFromFile;
  analyzeAudioVersion: typeof import("@audio-language-interface/analysis").analyzeAudioVersion;
  buildSemanticProfile?: typeof import("@audio-language-interface/semantics").buildSemanticProfile;
  planEdits: typeof import("@audio-language-interface/planning").planEdits;
  applyEditPlan: typeof import("@audio-language-interface/transforms").applyEditPlan;
  renderPreview: typeof import("@audio-language-interface/render").renderPreview;
  renderExport: typeof import("@audio-language-interface/render").renderExport;
  compareVersions: typeof import("@audio-language-interface/compare").compareVersions;
  compareRenders: typeof import("@audio-language-interface/compare").compareRenders;
  createSessionGraph: typeof import("@audio-language-interface/history").createSessionGraph;
  revertToVersion: typeof import("@audio-language-interface/history").revertToVersion;
  recordAudioAsset: typeof import("@audio-language-interface/history").recordAudioAsset;
  recordAudioVersion: typeof import("@audio-language-interface/history").recordAudioVersion;
  recordAnalysisReport: typeof import("@audio-language-interface/history").recordAnalysisReport;
  recordSemanticProfile: typeof import("@audio-language-interface/history").recordSemanticProfile;
  recordEditPlan: typeof import("@audio-language-interface/history").recordEditPlan;
  recordTransformRecord: typeof import("@audio-language-interface/history").recordTransformRecord;
  recordRenderArtifact: typeof import("@audio-language-interface/history").recordRenderArtifact;
  recordComparisonReport: typeof import("@audio-language-interface/history").recordComparisonReport;
  getAudioVersionById?:
    | ((input: {
        asset: AudioAsset;
        sessionGraph: SessionGraph;
        versionId: string;
      }) => Promise<AudioVersion | undefined>)
    | undefined;
}

export type SharedRenderPassThroughOptions = Omit<
  PreviewRenderOptions & FinalRenderOptions,
  "workspaceRoot" | "version"
>;

export interface ImportAndAnalyzeOptions {
  inputPath: string;
  importOptions?: ImportAudioOptions;
  analysisOptions?: AnalyzeAudioOptions;
  dependencies: Pick<OrchestrationDependencies, "importAudioFromFile" | "analyzeAudioVersion">;
  failurePolicy?: FailurePolicy | undefined;
}

export interface ImportAndAnalyzeResult {
  asset: AudioAsset;
  version: AudioVersion;
  analysisReport: AnalysisReport;
  importResult: ImportAudioResult;
  trace: WorkflowTraceEntry[];
}

export interface PlanAndApplyOptions {
  workspaceRoot: string;
  userRequest: string;
  version: AudioVersion;
  analysisReport: AnalysisReport;
  pass?: number;
  semanticProfile?: SemanticProfile;
  outputDir?: string;
  outputVersionId?: string;
  recordId?: string;
  createdAt?: Date;
  ffmpegPath?: string;
  dependencies: Pick<
    OrchestrationDependencies,
    "planEdits" | "applyEditPlan" | "buildSemanticProfile"
  >;
  failurePolicy?: FailurePolicy | undefined;
}

export interface PlanAndApplyResult {
  semanticProfile?: SemanticProfile;
  editPlan: EditPlan;
  outputVersion: AudioVersion;
  transformResult: ApplyTransformsResult;
  trace: WorkflowTraceEntry[];
}

export interface RenderAndCompareOptions {
  workspaceRoot: string;
  baselineVersion: AudioVersion;
  candidateVersion: AudioVersion;
  baselineAnalysis: AnalysisReport;
  candidateAnalysis: AnalysisReport;
  editPlan?: EditPlan;
  renderKind?: "preview" | "final" | undefined;
  baselineRenderOptions?: SharedRenderPassThroughOptions;
  candidateRenderOptions?: SharedRenderPassThroughOptions;
  compareGeneratedAt?: string | Date;
  dependencies: Pick<
    OrchestrationDependencies,
    "renderPreview" | "renderExport" | "compareRenders"
  >;
  failurePolicy?: FailurePolicy | undefined;
}

export interface RenderAndCompareResult {
  baselineRender: RenderArtifact;
  candidateRender: RenderArtifact;
  comparisonReport: ComparisonReport;
  trace: WorkflowTraceEntry[];
}

export interface IterationResult {
  iteration: number;
  inputVersion: AudioVersion;
  outputVersion: AudioVersion;
  inputAnalysis: AnalysisReport;
  outputAnalysis: AnalysisReport;
  semanticProfile?: SemanticProfile;
  editPlan: EditPlan;
  comparisonReport: ComparisonReport;
  transformResult: ApplyTransformsResult;
}

export interface RevisionDecision {
  shouldRevise: boolean;
  rationale: string;
  source: "disabled" | "default_policy" | "caller";
}

export interface RequestCycleRevisionOptions {
  enabled?: boolean;
  shouldRevise?:
    | ((input: {
        iteration: IterationResult;
        history: IterationResult[];
      }) =>
        | boolean
        | { shouldRevise: boolean; rationale?: string }
        | Promise<boolean | { shouldRevise: boolean; rationale?: string }>)
    | undefined;
}

export interface IterativeRefineOptions {
  workspaceRoot: string;
  userRequest: string;
  version: AudioVersion;
  analysisReport: AnalysisReport;
  analysisOptions?: AnalyzeAudioOptions;
  maxIterations: number;
  dependencies: Pick<
    OrchestrationDependencies,
    | "analyzeAudioVersion"
    | "planEdits"
    | "applyEditPlan"
    | "buildSemanticProfile"
    | "compareVersions"
  >;
  shouldContinue?: (input: {
    iteration: IterationResult;
    history: IterationResult[];
  }) => boolean | Promise<boolean>;
  failurePolicy?: FailurePolicy | undefined;
}

export interface IterativeRefineResult {
  iterations: IterationResult[];
  finalVersion: AudioVersion;
  finalAnalysis: AnalysisReport;
  trace: WorkflowTraceEntry[];
}

export type RequestCycleInput =
  | {
      kind: "import";
      inputPath: string;
      importOptions?: ImportAudioOptions;
    }
  | {
      kind: "existing";
      asset: AudioAsset;
      version: AudioVersion;
      sessionGraph?: SessionGraph;
    };

export interface RunRequestCycleOptions {
  workspaceRoot: string;
  userRequest: string;
  input: RequestCycleInput;
  analysisOptions?: AnalyzeAudioOptions;
  renderKind?: "preview" | "final" | undefined;
  revision?: RequestCycleRevisionOptions;
  sessionId?: string;
  branchId?: string;
  dependencies: OrchestrationDependencies;
  failurePolicy?: FailurePolicy | undefined;
}

export interface RequestCycleResult {
  result_kind: "applied" | "reverted";
  asset: AudioAsset;
  inputVersion: AudioVersion;
  inputAnalysis: AnalysisReport;
  followUpResolution: FollowUpResolution;
  iterations?: IterationResult[];
  revision?: RevisionDecision;
  semanticProfile?: SemanticProfile;
  editPlan?: EditPlan;
  outputVersion: AudioVersion;
  transformResult?: ApplyTransformsResult;
  outputAnalysis: AnalysisReport;
  versionComparisonReport: ComparisonReport;
  baselineRender: RenderArtifact;
  candidateRender: RenderArtifact;
  renderComparisonReport: ComparisonReport;
  comparisonReport: ComparisonReport;
  sessionGraph: SessionGraph;
  trace: WorkflowTraceEntry[];
}
