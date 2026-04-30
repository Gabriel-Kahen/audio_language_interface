import path from "node:path";

import {
  type AudioAsset,
  type AudioVersion,
  createSessionId,
} from "@audio-language-interface/core";
import type { SessionGraph } from "@audio-language-interface/history";
import {
  type AnalysisReport,
  type ComparisonReport,
  defaultOrchestrationDependencies,
  type EditPlan,
  type FailurePolicy,
  type ImportAudioOptions,
  importAndAnalyze,
  isAppliedOrRevertedRequestCycleResult,
  type LlmAssistedInterpretationOptions,
  type OrchestrationDependencies,
  type RenderArtifact,
  type RequestCycleResult,
  type RequestCycleRevisionOptions,
  type RunRequestCycleOptions,
  runRequestCycle,
  type SemanticProfile,
  type WorkflowTraceEntry,
} from "@audio-language-interface/orchestration";
import type { PlanningPolicy } from "@audio-language-interface/planning";
import type { TransformRecord } from "@audio-language-interface/transforms";

export type {
  AnalysisReport,
  AudioAsset,
  AudioVersion,
  ComparisonReport,
  EditPlan,
  RenderArtifact,
  SemanticProfile,
  SessionGraph,
  TransformRecord,
};

type RenderKind = NonNullable<RunRequestCycleOptions["renderKind"]>;
export interface SdkRenderOptions {
  outputDir?: string;
  outputFileName?: string;
  renderId?: string;
  createdAt?: Date;
  ffmpegPath?: string;
  ffprobePath?: string;
  sampleRateHz?: number;
  channels?: number;
  loudnessSummary?: Record<string, number>;
  bitrate?: string;
  format?: "wav" | "flac";
}

export interface CreateAudioLanguageSessionOptions {
  /** Directory where imported audio, generated versions, and renders are stored. */
  workspaceDir: string;
  /** Base directory for resolving relative input and workspace paths. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Default render kind for edit and follow-up cycles. Defaults to `final`. */
  renderKind?: RenderKind;
  /** Optional LLM-assisted interpretation settings forwarded to orchestration. */
  interpretation?: LlmAssistedInterpretationOptions;
  /** Optional deterministic planning policy forwarded to orchestration. */
  planningPolicy?: PlanningPolicy;
  /** Optional revision settings forwarded to orchestration. */
  revision?: RequestCycleRevisionOptions;
  /** Optional session id. A new id is created when omitted. */
  sessionId?: string;
  /** Optional initial branch id forwarded to orchestration. */
  branchId?: string;
  /** Optional orchestration dependency overrides for tests or alternate runtimes. */
  dependencies?: Partial<OrchestrationDependencies>;
  /** Optional stage retry policy forwarded to orchestration. */
  failurePolicy?: FailurePolicy;
}

export interface SdkImportInput {
  input: string;
  importOptions?: ImportAudioOptions;
}

export interface SdkImportResult {
  asset: AudioAsset;
  version: AudioVersion;
  analysisReport: AnalysisReport;
  sessionGraph: SessionGraph;
  trace: WorkflowTraceEntry[];
}

export interface SdkEditInput {
  input: string;
  request: string;
  importOptions?: ImportAudioOptions;
  renderKind?: RenderKind;
  interpretation?: LlmAssistedInterpretationOptions;
  planningPolicy?: PlanningPolicy;
  revision?: RequestCycleRevisionOptions;
}

export interface SdkFollowUpInput {
  request: string;
  renderKind?: RenderKind;
  interpretation?: LlmAssistedInterpretationOptions;
  planningPolicy?: PlanningPolicy;
  revision?: RequestCycleRevisionOptions;
}

export interface SdkRenderInput {
  version?: AudioVersion;
  kind?: RenderKind;
  options?: SdkRenderOptions;
}

export interface SdkCompareInput {
  baselineVersion?: AudioVersion;
  candidateVersion?: AudioVersion;
  baselineAnalysis?: AnalysisReport;
  candidateAnalysis?: AnalysisReport;
  editPlan?: EditPlan;
  generatedAt?: string | Date;
}

export interface AudioLanguageSessionState {
  sessionId: string;
  workspaceDir: string;
  asset?: AudioAsset;
  currentVersion?: AudioVersion;
  sessionGraph?: SessionGraph;
  availableVersions: AudioVersion[];
  lastResult?: AudioLanguageEditResult;
}

interface BaseSdkEditResult {
  resultKind: RequestCycleResult["result_kind"];
  asset: AudioAsset;
  inputVersion: AudioVersion;
  inputAnalysis: AnalysisReport;
  followUpResolution: RequestCycleResult["followUpResolution"];
  semanticProfile?: SemanticProfile;
  sessionGraph: SessionGraph;
  trace: WorkflowTraceEntry[];
  rawResult: RequestCycleResult;
}

export interface AudioLanguageAppliedResult extends BaseSdkEditResult {
  resultKind: "applied";
  editPlan?: EditPlan;
  transformRecord?: TransformRecord;
  outputVersion: AudioVersion;
  outputAnalysis: AnalysisReport;
  versionComparisonReport: ComparisonReport;
  baselineRender: RenderArtifact;
  candidateRender: RenderArtifact;
  renderArtifact: RenderArtifact;
  renderComparisonReport: ComparisonReport;
  comparisonReport: ComparisonReport;
}

export interface AudioLanguageRevertedResult extends BaseSdkEditResult {
  resultKind: "reverted";
  outputVersion: AudioVersion;
  outputAnalysis: AnalysisReport;
  versionComparisonReport: ComparisonReport;
  baselineRender: RenderArtifact;
  candidateRender: RenderArtifact;
  renderArtifact: RenderArtifact;
  renderComparisonReport: ComparisonReport;
  comparisonReport: ComparisonReport;
}

export interface AudioLanguageClarificationResult extends BaseSdkEditResult {
  resultKind: "clarification_required";
  clarification: Extract<
    RequestCycleResult,
    { result_kind: "clarification_required" }
  >["clarification"];
}

export type AudioLanguageEditResult =
  | AudioLanguageAppliedResult
  | AudioLanguageRevertedResult
  | AudioLanguageClarificationResult;

export interface AudioLanguageSession {
  readonly workspaceDir: string;
  importAudio(input: SdkImportInput): Promise<SdkImportResult>;
  edit(input: SdkEditInput): Promise<AudioLanguageEditResult>;
  followUp(input: SdkFollowUpInput): Promise<AudioLanguageEditResult>;
  render(input?: SdkRenderInput): Promise<RenderArtifact>;
  compare(input?: SdkCompareInput): Promise<ComparisonReport>;
  getState(): AudioLanguageSessionState;
}

/** Creates a stateful SDK session over the canonical orchestration workflow. */
export async function createAudioLanguageSession(
  options: CreateAudioLanguageSessionOptions,
): Promise<AudioLanguageSession> {
  return new DefaultAudioLanguageSession(options);
}

class DefaultAudioLanguageSession implements AudioLanguageSession {
  readonly workspaceDir: string;

  private readonly cwd: string;
  private readonly renderKind: RenderKind;
  private readonly sessionId: string;
  private readonly branchId?: string;
  private readonly dependencyOverrides: Partial<OrchestrationDependencies>;
  private readonly failurePolicy: FailurePolicy | undefined;
  private readonly defaultInterpretation: LlmAssistedInterpretationOptions | undefined;
  private readonly defaultPlanningPolicy: PlanningPolicy | undefined;
  private readonly defaultRevision: RequestCycleRevisionOptions | undefined;
  private readonly availableVersions = new Map<string, AudioVersion>();
  private asset: AudioAsset | undefined;
  private currentVersion: AudioVersion | undefined;
  private sessionGraph: SessionGraph | undefined;
  private lastResult: AudioLanguageEditResult | undefined;
  private lastInputVersion: AudioVersion | undefined;
  private lastInputAnalysis: AnalysisReport | undefined;
  private lastOutputAnalysis: AnalysisReport | undefined;
  private lastEditPlan: EditPlan | undefined;

  constructor(options: CreateAudioLanguageSessionOptions) {
    this.cwd = path.resolve(options.cwd ?? process.cwd());
    this.workspaceDir = path.resolve(this.cwd, options.workspaceDir);
    this.renderKind = options.renderKind ?? "final";
    this.sessionId = options.sessionId ?? createSessionId();
    if (options.branchId !== undefined) {
      this.branchId = options.branchId;
    }
    this.dependencyOverrides = options.dependencies ?? {};
    if (options.failurePolicy !== undefined) {
      this.failurePolicy = options.failurePolicy;
    }
    if (options.interpretation !== undefined) {
      this.defaultInterpretation = options.interpretation;
    }
    if (options.planningPolicy !== undefined) {
      this.defaultPlanningPolicy = options.planningPolicy;
    }
    if (options.revision !== undefined) {
      this.defaultRevision = options.revision;
    }
  }

  async importAudio(input: SdkImportInput): Promise<SdkImportResult> {
    const dependencies = this.createDependencies();
    const imported = await importAndAnalyze({
      inputPath: this.resolveInputPath(input.input),
      importOptions: {
        ...input.importOptions,
        workspaceRoot: this.workspaceDir,
      },
      analysisOptions: {
        workspaceRoot: this.workspaceDir,
      },
      dependencies,
      ...(this.failurePolicy === undefined ? {} : { failurePolicy: this.failurePolicy }),
    });

    let graph = dependencies.createSessionGraph({
      session_id: this.sessionId,
      created_at: new Date().toISOString(),
      active_refs: {
        asset_id: imported.asset.asset_id,
        version_id: imported.version.version_id,
        ...(this.branchId === undefined ? {} : { branch_id: this.branchId }),
      },
    });
    graph = dependencies.recordAudioAsset(graph, imported.asset);
    graph = dependencies.recordAudioVersion(graph, imported.version, {
      ...(this.branchId === undefined ? {} : { branch_id: this.branchId }),
    });
    graph = dependencies.recordAnalysisReport(graph, imported.analysisReport);

    this.availableVersions.clear();
    this.asset = imported.asset;
    this.currentVersion = imported.version;
    this.sessionGraph = graph;
    this.rememberVersion(imported.version);
    this.lastInputVersion = imported.version;
    this.lastInputAnalysis = imported.analysisReport;
    this.lastOutputAnalysis = imported.analysisReport;
    this.lastEditPlan = undefined;
    this.lastResult = undefined;

    return {
      asset: imported.asset,
      version: imported.version,
      analysisReport: imported.analysisReport,
      sessionGraph: graph,
      trace: imported.trace,
    };
  }

  async edit(input: SdkEditInput): Promise<AudioLanguageEditResult> {
    const result = await runRequestCycle({
      workspaceRoot: this.workspaceDir,
      userRequest: input.request,
      input: {
        kind: "import",
        inputPath: this.resolveInputPath(input.input),
        importOptions: {
          ...input.importOptions,
          workspaceRoot: this.workspaceDir,
        },
      },
      renderKind: input.renderKind ?? this.renderKind,
      ...optionalInterpretation(input.interpretation ?? this.defaultInterpretation),
      ...optionalPlanningPolicy(input.planningPolicy ?? this.defaultPlanningPolicy),
      ...optionalRevision(input.revision ?? this.defaultRevision),
      sessionId: this.sessionId,
      ...(this.branchId === undefined ? {} : { branchId: this.branchId }),
      dependencies: this.createDependencies(),
      ...(this.failurePolicy === undefined ? {} : { failurePolicy: this.failurePolicy }),
    });

    return this.commitRequestCycleResult(result);
  }

  async followUp(input: SdkFollowUpInput): Promise<AudioLanguageEditResult> {
    const asset = this.asset;
    const version = this.currentVersion;
    const sessionGraph = this.sessionGraph;
    if (!asset || !version || !sessionGraph) {
      throw new Error("Cannot run a follow-up before importing or editing audio in this session.");
    }

    const result = await runRequestCycle({
      workspaceRoot: this.workspaceDir,
      userRequest: input.request,
      input: {
        kind: "existing",
        asset,
        version,
        sessionGraph,
      },
      renderKind: input.renderKind ?? this.renderKind,
      ...optionalInterpretation(input.interpretation ?? this.defaultInterpretation),
      ...optionalPlanningPolicy(input.planningPolicy ?? this.defaultPlanningPolicy),
      ...optionalRevision(input.revision ?? this.defaultRevision),
      sessionId: this.sessionId,
      dependencies: this.createDependencies(),
      ...(this.failurePolicy === undefined ? {} : { failurePolicy: this.failurePolicy }),
    });

    return this.commitRequestCycleResult(result);
  }

  async render(input: SdkRenderInput = {}): Promise<RenderArtifact> {
    const version = input.version ?? this.currentVersion;
    if (!version) {
      throw new Error("Cannot render before a session has a current AudioVersion.");
    }

    const dependencies = this.createDependencies();
    const renderResult =
      (input.kind ?? this.renderKind) === "final"
        ? await dependencies.renderExport({
            workspaceRoot: this.workspaceDir,
            version,
            ...input.options,
          })
        : await dependencies.renderPreview({
            workspaceRoot: this.workspaceDir,
            version,
            ...input.options,
          });

    if (this.sessionGraph !== undefined) {
      this.sessionGraph = dependencies.recordRenderArtifact(
        this.sessionGraph,
        renderResult.artifact,
      );
    }

    return renderResult.artifact;
  }

  async compare(input: SdkCompareInput = {}): Promise<ComparisonReport> {
    const baselineVersion = input.baselineVersion ?? this.lastInputVersion;
    const candidateVersion = input.candidateVersion ?? this.currentVersion;
    if (!baselineVersion || !candidateVersion) {
      throw new Error("Cannot compare before the session has baseline and candidate versions.");
    }

    const dependencies = this.createDependencies();
    const baselineAnalysis =
      input.baselineAnalysis ??
      (baselineVersion.version_id === this.lastInputVersion?.version_id
        ? this.lastInputAnalysis
        : undefined) ??
      (await dependencies.analyzeAudioVersion(baselineVersion, {
        workspaceRoot: this.workspaceDir,
      }));
    const candidateAnalysis =
      input.candidateAnalysis ??
      (candidateVersion.version_id === this.currentVersion?.version_id
        ? this.lastOutputAnalysis
        : undefined) ??
      (await dependencies.analyzeAudioVersion(candidateVersion, {
        workspaceRoot: this.workspaceDir,
      }));
    const editPlan =
      input.editPlan ??
      (this.lastEditPlan?.version_id === baselineVersion.version_id
        ? this.lastEditPlan
        : undefined);

    const report = dependencies.compareVersions({
      baselineVersion,
      candidateVersion,
      baselineAnalysis,
      candidateAnalysis,
      workspaceRoot: this.workspaceDir,
      ...(editPlan === undefined ? {} : { editPlan }),
      ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
    });

    if (this.sessionGraph !== undefined) {
      this.sessionGraph = dependencies.recordComparisonReport(this.sessionGraph, report);
    }

    return report;
  }

  getState(): AudioLanguageSessionState {
    return {
      sessionId: this.sessionId,
      workspaceDir: this.workspaceDir,
      ...(this.asset === undefined ? {} : { asset: this.asset }),
      ...(this.currentVersion === undefined ? {} : { currentVersion: this.currentVersion }),
      ...(this.sessionGraph === undefined ? {} : { sessionGraph: this.sessionGraph }),
      availableVersions: [...this.availableVersions.values()],
      ...(this.lastResult === undefined ? {} : { lastResult: this.lastResult }),
    };
  }

  private commitRequestCycleResult(result: RequestCycleResult): AudioLanguageEditResult {
    if (this.asset?.asset_id !== result.asset.asset_id) {
      this.availableVersions.clear();
    }

    this.asset = result.asset;
    this.sessionGraph = result.sessionGraph;
    this.rememberVersion(result.inputVersion);
    this.lastInputVersion = result.inputVersion;
    this.lastInputAnalysis = result.inputAnalysis;

    if (isAppliedOrRevertedRequestCycleResult(result)) {
      this.currentVersion = result.outputVersion;
      this.rememberVersion(result.outputVersion);
      for (const iteration of result.iterations ?? []) {
        this.rememberVersion(iteration.inputVersion);
        this.rememberVersion(iteration.outputVersion);
      }
      this.lastOutputAnalysis = result.outputAnalysis;
      this.lastEditPlan = result.editPlan ?? result.iterations?.[0]?.editPlan;
    } else {
      this.currentVersion = result.inputVersion;
      this.lastOutputAnalysis = result.inputAnalysis;
      this.lastEditPlan = undefined;
    }

    const normalized = toSdkEditResult(result);
    this.lastResult = normalized;
    return normalized;
  }

  private createDependencies(): OrchestrationDependencies {
    const overrides = this.dependencyOverrides;
    return {
      ...defaultOrchestrationDependencies,
      ...overrides,
      getAudioVersionById:
        overrides.getAudioVersionById ??
        (async ({ asset, versionId }) => {
          const version = this.availableVersions.get(versionId);
          return version?.asset_id === asset.asset_id ? version : undefined;
        }),
    };
  }

  private rememberVersion(version: AudioVersion): void {
    this.availableVersions.set(version.version_id, version);
  }

  private resolveInputPath(inputPath: string): string {
    return path.isAbsolute(inputPath) ? inputPath : path.resolve(this.cwd, inputPath);
  }
}

function toSdkEditResult(result: RequestCycleResult): AudioLanguageEditResult {
  const base = {
    resultKind: result.result_kind,
    asset: result.asset,
    inputVersion: result.inputVersion,
    inputAnalysis: result.inputAnalysis,
    followUpResolution: result.followUpResolution,
    ...(result.semanticProfile === undefined ? {} : { semanticProfile: result.semanticProfile }),
    sessionGraph: result.sessionGraph,
    trace: result.trace,
    rawResult: result,
  };

  if (!isAppliedOrRevertedRequestCycleResult(result)) {
    return {
      ...base,
      resultKind: "clarification_required",
      clarification: result.clarification,
    };
  }

  const shared = {
    ...base,
    outputVersion: result.outputVersion,
    outputAnalysis: result.outputAnalysis,
    versionComparisonReport: result.versionComparisonReport,
    baselineRender: result.baselineRender,
    candidateRender: result.candidateRender,
    renderArtifact: result.candidateRender,
    renderComparisonReport: result.renderComparisonReport,
    comparisonReport: result.versionComparisonReport,
  };

  if (result.result_kind === "reverted") {
    return {
      ...shared,
      resultKind: "reverted",
    };
  }

  return {
    ...shared,
    resultKind: "applied",
    ...(result.editPlan === undefined ? {} : { editPlan: result.editPlan }),
    ...(result.transformResult === undefined
      ? {}
      : { transformRecord: result.transformResult.transformRecord }),
  };
}

function optionalInterpretation(
  interpretation: LlmAssistedInterpretationOptions | undefined,
): { interpretation: LlmAssistedInterpretationOptions } | Record<string, never> {
  return interpretation === undefined ? {} : { interpretation };
}

function optionalPlanningPolicy(
  planningPolicy: PlanningPolicy | undefined,
): { planningPolicy: PlanningPolicy } | Record<string, never> {
  return planningPolicy === undefined ? {} : { planningPolicy };
}

function optionalRevision(
  revision: RequestCycleRevisionOptions | undefined,
): { revision: RequestCycleRevisionOptions } | Record<string, never> {
  return revision === undefined ? {} : { revision };
}
