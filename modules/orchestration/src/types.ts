import type { AnalysisReport, AnalyzeAudioOptions } from "@audio-language-interface/analysis";
import type { ComparisonReport } from "@audio-language-interface/compare";
import type { AudioAsset, AudioVersion } from "@audio-language-interface/core";
import type { PendingClarification, SessionGraph } from "@audio-language-interface/history";
import type {
  IntentInterpretation,
  InterpretationPolicy,
  InterpretationSessionContext,
} from "@audio-language-interface/interpretation";
import type { ImportAudioOptions, ImportAudioResult } from "@audio-language-interface/io";
import type { EditPlan, PlanningPolicy } from "@audio-language-interface/planning";
import type {
  FinalRenderOptions,
  PreviewRenderOptions,
  RenderArtifact,
  RenderResult,
} from "@audio-language-interface/render";
import type { SemanticDescriptor, SemanticProfile } from "@audio-language-interface/semantics";
import type { ApplyTransformsResult } from "@audio-language-interface/transforms";

export type {
  AnalysisReport,
  AnalyzeAudioOptions,
  ApplyTransformsResult,
  AudioAsset,
  AudioVersion,
  ComparisonReport,
  EditPlan,
  FinalRenderOptions,
  ImportAudioOptions,
  ImportAudioResult,
  IntentInterpretation,
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
  | "resolve_clarification"
  | "prepare_follow_up_branch"
  | "load_follow_up_input"
  | "load_revert_target"
  | "semantic_profile"
  | "interpret_request"
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
  interpretRequest?: typeof import("@audio-language-interface/interpretation").interpretRequest;
  planEdits: typeof import("@audio-language-interface/planning").planEdits;
  applyEditPlan: typeof import("@audio-language-interface/transforms").applyEditPlan;
  renderPreview: typeof import("@audio-language-interface/render").renderPreview;
  renderExport: typeof import("@audio-language-interface/render").renderExport;
  compareVersions: typeof import("@audio-language-interface/compare").compareVersions;
  compareRenders: typeof import("@audio-language-interface/compare").compareRenders;
  createSessionGraph: typeof import("@audio-language-interface/history").createSessionGraph;
  createBranch: typeof import("@audio-language-interface/history").createBranch;
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

export interface RemoteLlmInterpretationProviderConfig {
  kind: "openai" | "google";
  model: string;
  apiBaseUrl?: string;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface CodexCliLlmInterpretationProviderConfig {
  kind: "codex_cli";
  model?: string;
  codexPath?: string;
  profile?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export type LlmInterpretationProviderConfig =
  | RemoteLlmInterpretationProviderConfig
  | CodexCliLlmInterpretationProviderConfig;

export interface LlmAssistedInterpretationOptions {
  mode: "llm_assisted";
  provider: LlmInterpretationProviderConfig;
  apiKey?: string;
  policy?: InterpretationPolicy;
  promptVersion?: string;
}

export interface PlanAndApplyOptions {
  workspaceRoot: string;
  userRequest: string;
  originalUserRequest?: string;
  version: AudioVersion;
  analysisReport: AnalysisReport;
  pass?: number;
  semanticProfile?: SemanticProfile;
  requestInterpretation?: LlmAssistedInterpretationOptions;
  planningPolicy?: PlanningPolicy;
  interpretationSessionContext?: InterpretationSessionContext;
  sessionGraph?: SessionGraph;
  outputDir?: string;
  outputVersionId?: string;
  recordId?: string;
  createdAt?: Date;
  ffmpegPath?: string;
  dependencies: Pick<
    OrchestrationDependencies,
    "planEdits" | "applyEditPlan" | "buildSemanticProfile" | "interpretRequest"
  >;
  failurePolicy?: FailurePolicy | undefined;
}

export interface PlanAndApplyResult {
  semanticProfile?: SemanticProfile;
  intentInterpretation?: IntentInterpretation;
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
  intentInterpretation?: IntentInterpretation;
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
  originalUserRequest?: string;
  version: AudioVersion;
  analysisReport: AnalysisReport;
  analysisOptions?: AnalyzeAudioOptions;
  requestInterpretation?: LlmAssistedInterpretationOptions;
  planningPolicy?: PlanningPolicy;
  sessionGraph?: SessionGraph;
  maxIterations: number;
  dependencies: Pick<
    OrchestrationDependencies,
    | "analyzeAudioVersion"
    | "planEdits"
    | "applyEditPlan"
    | "buildSemanticProfile"
    | "interpretRequest"
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
  interpretation?: LlmAssistedInterpretationOptions;
  planningPolicy?: PlanningPolicy;
  revision?: RequestCycleRevisionOptions;
  sessionId?: string;
  branchId?: string;
  dependencies: OrchestrationDependencies;
  failurePolicy?: FailurePolicy | undefined;
}

export interface FollowUpApplyResolution {
  kind: "apply";
  resolvedUserRequest: string;
  source: "direct_request" | "clarification_answer" | "repeat_last_request" | "try_another_version";
  inputVersionId?: string;
  branchId?: string;
}

export interface FollowUpRevertResolution {
  kind: "revert";
  targetVersionId: string;
  source: "less" | "undo" | "revert";
}

export type FollowUpResolution = FollowUpApplyResolution | FollowUpRevertResolution;

export interface ClarificationResult {
  question: string;
  pendingClarification: PendingClarification;
}

interface BaseRequestCycleResult {
  result_kind: "applied" | "reverted" | "clarification_required";
  asset: AudioAsset;
  inputVersion: AudioVersion;
  inputAnalysis: AnalysisReport;
  followUpResolution: FollowUpResolution;
  semanticProfile?: SemanticProfile;
  intentInterpretation?: IntentInterpretation;
  sessionGraph: SessionGraph;
  trace: WorkflowTraceEntry[];
}

export interface AppliedOrRevertedRequestCycleResult extends BaseRequestCycleResult {
  result_kind: "applied" | "reverted";
  iterations?: IterationResult[];
  revision?: RevisionDecision;
  editPlan?: EditPlan;
  outputVersion: AudioVersion;
  transformResult?: ApplyTransformsResult;
  outputAnalysis: AnalysisReport;
  versionComparisonReport: ComparisonReport;
  baselineRender: RenderArtifact;
  candidateRender: RenderArtifact;
  renderComparisonReport: ComparisonReport;
  comparisonReport: ComparisonReport;
}

export interface ClarificationRequiredRequestCycleResult extends BaseRequestCycleResult {
  result_kind: "clarification_required";
  clarification: ClarificationResult;
}

export type RequestCycleResult =
  | AppliedOrRevertedRequestCycleResult
  | ClarificationRequiredRequestCycleResult;

export function isClarificationRequiredRequestCycleResult(
  result: RequestCycleResult,
): result is ClarificationRequiredRequestCycleResult {
  return result.result_kind === "clarification_required";
}

export function isAppliedOrRevertedRequestCycleResult(
  result: RequestCycleResult,
): result is AppliedOrRevertedRequestCycleResult {
  return result.result_kind !== "clarification_required";
}
