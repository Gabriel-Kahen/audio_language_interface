import { analyzeAudioVersion } from "@audio-language-interface/analysis";
import { compareRenders, compareVersions } from "@audio-language-interface/compare";
import {
  createBranch,
  createSessionGraph,
  recordAnalysisReport,
  recordAudioAsset,
  recordAudioVersion,
  recordComparisonReport,
  recordEditPlan,
  recordRenderArtifact,
  recordSemanticProfile,
  recordTransformRecord,
  revertToVersion,
} from "@audio-language-interface/history";
import { interpretRequest } from "@audio-language-interface/interpretation";
import { importAudioFromFile } from "@audio-language-interface/io";
import { planEdits } from "@audio-language-interface/planning";
import { renderExport, renderPreview } from "@audio-language-interface/render";
import { buildSemanticProfile } from "@audio-language-interface/semantics";
import { applyEditPlan } from "@audio-language-interface/transforms";

import { OrchestrationStageError } from "./failure-policy.js";
import { importAndAnalyze } from "./flows/import-and-analyze.js";
import { iterativeRefine } from "./flows/iterative-refine.js";
import { planAndApply } from "./flows/plan-and-apply.js";
import { planApplyComparePass } from "./flows/plan-apply-compare.js";
import { renderAndCompare } from "./flows/render-and-compare.js";
import { resolveFollowUpRequest } from "./follow-up-request.js";
import { runRequestCycle } from "./run-request-cycle.js";
import type { OrchestrationDependencies } from "./types.js";

export {
  importAndAnalyze,
  iterativeRefine,
  OrchestrationStageError,
  planAndApply,
  planApplyComparePass,
  renderAndCompare,
  resolveFollowUpRequest,
  runRequestCycle,
};

export const defaultOrchestrationDependencies: OrchestrationDependencies = {
  importAudioFromFile,
  analyzeAudioVersion,
  buildSemanticProfile,
  interpretRequest,
  planEdits,
  applyEditPlan,
  renderPreview,
  renderExport,
  compareVersions,
  compareRenders,
  createSessionGraph,
  createBranch,
  revertToVersion,
  recordAudioAsset,
  recordAudioVersion,
  recordAnalysisReport,
  recordSemanticProfile,
  recordEditPlan,
  recordTransformRecord,
  recordRenderArtifact,
  recordComparisonReport,
};

export type {
  AnalysisReport,
  ApplyTransformsResult,
  AudioAsset,
  AudioVersion,
  ComparisonReport,
  EditPlan,
  FailurePolicy,
  FollowUpResolution,
  ImportAndAnalyzeOptions,
  ImportAndAnalyzeResult,
  ImportAudioOptions,
  ImportAudioResult,
  IterationResult,
  IterativeRefineOptions,
  IterativeRefineResult,
  LlmAssistedInterpretationOptions,
  LlmInterpretationProviderConfig,
  OrchestrationDependencies,
  PlanAndApplyOptions,
  PlanAndApplyResult,
  RenderAndCompareOptions,
  RenderAndCompareResult,
  RenderArtifact,
  RequestCycleInput,
  RequestCycleResult,
  RequestCycleRevisionOptions,
  RevisionDecision,
  RunRequestCycleOptions,
  SemanticDescriptor,
  SemanticProfile,
  SessionGraph,
  WorkflowStage,
  WorkflowTraceEntry,
} from "./types.js";
