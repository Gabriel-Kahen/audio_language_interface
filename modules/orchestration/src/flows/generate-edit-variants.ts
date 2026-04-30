import { createSessionId } from "@audio-language-interface/core";

import { executeWithFailurePolicy } from "../failure-policy.js";
import { resolveRequestInterpretation } from "../request-interpretation.js";
import type {
  ComparisonReport,
  EditVariantGenerationResult,
  EditVariantLabel,
  EditVariantResult,
  GenerateEditVariantsOptions,
  RenderArtifact,
  SemanticProfile,
  WorkflowTraceEntry,
} from "../types.js";
import { importAndAnalyze } from "./import-and-analyze.js";
import { planAndApply } from "./plan-and-apply.js";

const VARIANT_LABELS_BY_COUNT = {
  1: ["balanced"],
  2: ["subtle", "balanced"],
  3: ["subtle", "balanced", "stronger"],
} as const satisfies Record<1 | 2 | 3, readonly EditVariantLabel[]>;

/** Generates deterministic edit candidates from one imported source and request. */
export async function generateEditVariants(
  options: GenerateEditVariantsOptions,
): Promise<EditVariantGenerationResult> {
  const trace: WorkflowTraceEntry[] = [];
  const variantLabels = getVariantLabels(options.variants);
  const importResult = await importAndAnalyze({
    inputPath: options.input.inputPath,
    importOptions: {
      ...options.input.importOptions,
      workspaceRoot: options.workspaceRoot,
    },
    analysisOptions: {
      workspaceRoot: options.workspaceRoot,
      ...options.analysisOptions,
    },
    dependencies: options.dependencies,
    failurePolicy: options.failurePolicy,
  });
  trace.push(...importResult.trace);

  let sessionGraph = options.dependencies.createSessionGraph({
    session_id: options.sessionId ?? createSessionId(),
    created_at: importResult.version.lineage.created_at,
    active_refs: {
      asset_id: importResult.asset.asset_id,
      version_id: importResult.version.version_id,
      ...(options.branchId === undefined ? {} : { branch_id: options.branchId }),
    },
  });
  sessionGraph = options.dependencies.recordAudioAsset(sessionGraph, importResult.asset);
  sessionGraph = options.dependencies.recordAudioVersion(sessionGraph, importResult.version, {
    ...(options.branchId === undefined ? {} : { branch_id: options.branchId }),
  });
  sessionGraph = options.dependencies.recordAnalysisReport(
    sessionGraph,
    importResult.analysisReport,
  );

  const buildSemanticProfile = options.dependencies.buildSemanticProfile;
  if (!buildSemanticProfile) {
    throw new Error("Variant generation requires a buildSemanticProfile dependency.");
  }

  const semanticProfile = await executeWithFailurePolicy<SemanticProfile, Record<string, never>>({
    stage: "semantic_profile",
    operation: () => Promise.resolve(buildSemanticProfile(importResult.analysisReport)),
    failurePolicy: options.failurePolicy,
    trace,
  });
  sessionGraph = options.dependencies.recordSemanticProfile(sessionGraph, semanticProfile);

  const interpretation = options.interpretation;
  const intentInterpretation =
    interpretation === undefined
      ? undefined
      : await executeWithFailurePolicy({
          stage: "interpret_request",
          operation: () =>
            resolveRequestInterpretation({
              userRequest: options.userRequest,
              originalUserRequest: options.userRequest,
              audioVersion: importResult.version,
              analysisReport: importResult.analysisReport,
              semanticProfile,
              interpretation,
              sessionContext: {
                current_version_id: importResult.version.version_id,
                original_user_request: options.userRequest,
              },
              interpretRequest: options.dependencies.interpretRequest,
            }),
          failurePolicy: options.failurePolicy,
          trace,
        });

  const baselinePreview = await executeWithFailurePolicy<RenderArtifact, Record<string, never>>({
    stage: "render_baseline",
    operation: async () =>
      (
        await options.dependencies.renderPreview({
          workspaceRoot: options.workspaceRoot,
          version: importResult.version,
          outputDir: "variants/previews",
        })
      ).artifact,
    failurePolicy: options.failurePolicy,
    trace,
  });
  sessionGraph = options.dependencies.recordRenderArtifact(sessionGraph, baselinePreview);

  const generatedVariants: EditVariantResult[] = [];
  for (const [index, label] of variantLabels.entries()) {
    const variantNumber = index + 1;
    const planResult = await planAndApply({
      workspaceRoot: options.workspaceRoot,
      userRequest: options.userRequest,
      originalUserRequest: options.userRequest,
      version: importResult.version,
      analysisReport: importResult.analysisReport,
      semanticProfile,
      ...(intentInterpretation === undefined ? {} : { intentInterpretation }),
      ...(options.planningPolicy === undefined ? {} : { planningPolicy: options.planningPolicy }),
      variantStrength: label,
      outputDir: `variants/${label}/versions`,
      sessionGraph,
      dependencies: options.dependencies,
      failurePolicy: options.failurePolicy,
      pass: variantNumber,
    });
    trace.push(...planResult.trace);

    const outputAnalysis = await executeWithFailurePolicy({
      stage: "analyze_output",
      operation: () =>
        options.dependencies.analyzeAudioVersion(planResult.outputVersion, {
          workspaceRoot: options.workspaceRoot,
          ...options.analysisOptions,
        }),
      failurePolicy: options.failurePolicy,
      pass: variantNumber,
      trace,
    });

    const comparisonReport = await executeWithFailurePolicy({
      stage: "compare",
      operation: () =>
        Promise.resolve(
          options.dependencies.compareVersions({
            baselineVersion: importResult.version,
            candidateVersion: planResult.outputVersion,
            baselineAnalysis: importResult.analysisReport,
            candidateAnalysis: outputAnalysis,
            workspaceRoot: options.workspaceRoot,
            editPlan: planResult.editPlan,
          }),
        ),
      failurePolicy: options.failurePolicy,
      pass: variantNumber,
      trace,
    });

    const previewRender = await executeWithFailurePolicy<RenderArtifact, Record<string, never>>({
      stage: "render_candidate",
      operation: async () =>
        (
          await options.dependencies.renderPreview({
            workspaceRoot: options.workspaceRoot,
            version: planResult.outputVersion,
            outputDir: `variants/${label}/previews`,
          })
        ).artifact,
      failurePolicy: options.failurePolicy,
      pass: variantNumber,
      trace,
    });

    const renderComparisonReport = await executeWithFailurePolicy({
      stage: "compare",
      operation: () =>
        Promise.resolve(
          options.dependencies.compareRenders({
            baselineRender: baselinePreview,
            candidateRender: previewRender,
            baselineAnalysis: importResult.analysisReport,
            candidateAnalysis: outputAnalysis,
            editPlan: planResult.editPlan,
          }),
        ),
      failurePolicy: options.failurePolicy,
      pass: variantNumber,
      trace,
    });

    sessionGraph = options.dependencies.recordEditPlan(sessionGraph, planResult.editPlan);
    sessionGraph = options.dependencies.recordAudioVersion(sessionGraph, planResult.outputVersion, {
      set_active: false,
      ...(options.branchId === undefined ? {} : { branch_id: options.branchId }),
    });
    sessionGraph = options.dependencies.recordTransformRecord(
      sessionGraph,
      planResult.transformResult.transformRecord,
    );
    sessionGraph = options.dependencies.recordAnalysisReport(sessionGraph, outputAnalysis);
    sessionGraph = options.dependencies.recordComparisonReport(sessionGraph, comparisonReport);
    sessionGraph = options.dependencies.recordRenderArtifact(sessionGraph, previewRender);
    sessionGraph = options.dependencies.recordComparisonReport(
      sessionGraph,
      renderComparisonReport,
    );

    generatedVariants.push({
      variant_id: `variant_${variantNumber}_${label}`,
      label,
      rank: 0,
      is_recommended: false,
      rationale: buildVariantRationale(label, comparisonReport),
      warnings: buildVariantWarnings(planResult.transformResult.warnings, comparisonReport),
      editPlan: planResult.editPlan,
      outputVersion: planResult.outputVersion,
      outputAnalysis,
      transformRecord: planResult.transformResult.transformRecord,
      previewRender,
      comparisonReport,
      renderComparisonReport,
    });
  }

  const variants = rankVariantsConservatively(generatedVariants);
  const recommendedVariant = variants.find((variant) => variant.is_recommended);
  if (!recommendedVariant) {
    throw new Error("Variant generation did not produce a recommended variant.");
  }
  sessionGraph = options.dependencies.recordAudioVersion(
    sessionGraph,
    recommendedVariant.outputVersion,
    {
      ...(options.branchId === undefined ? {} : { branch_id: options.branchId }),
    },
  );

  return {
    result_kind: "variants_generated",
    asset: importResult.asset,
    inputVersion: importResult.version,
    inputAnalysis: importResult.analysisReport,
    semanticProfile,
    variants,
    recommendedVariant,
    sessionGraph,
    trace,
  };
}

function getVariantLabels(variantCount: GenerateEditVariantsOptions["variants"]) {
  const labels = VARIANT_LABELS_BY_COUNT[variantCount];
  if (labels === undefined) {
    throw new Error("Variant generation supports 1, 2, or 3 variants.");
  }

  return labels;
}

function buildVariantRationale(
  label: EditVariantLabel,
  comparisonReport: ComparisonReport,
): string {
  const strength =
    label === "subtle"
      ? "uses the safest lower-intensity interpretation"
      : label === "stronger"
        ? "uses the strongest bounded interpretation"
        : "uses the baseline balanced interpretation";
  return `The ${label} variant ${strength}. ${comparisonReport.summary.plain_text}`;
}

function buildVariantWarnings(
  transformWarnings: string[],
  comparisonReport: ComparisonReport,
): string[] {
  const warnings = [...transformWarnings];

  for (const regression of comparisonReport.regressions ?? []) {
    if (regression.severity >= 0.5) {
      warnings.push(`regression:${regression.kind}:${regression.description}`);
    }
  }

  for (const goal of comparisonReport.goal_alignment ?? []) {
    if (goal.status === "not_met") {
      warnings.push(`goal_not_met:${goal.goal}`);
    }
  }

  return [...new Set(warnings)];
}

function rankVariantsConservatively(variants: EditVariantResult[]): EditVariantResult[] {
  const rankedIds = [...variants]
    .sort((left, right) => {
      const scoreDelta = scoreVariant(right) - scoreVariant(left);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return labelSafetyOrder(left.label) - labelSafetyOrder(right.label);
    })
    .map((variant, index) => [variant.variant_id, index + 1] as const);
  const rankById = new Map(rankedIds);

  return variants.map((variant) => {
    const rank = rankById.get(variant.variant_id);
    if (rank === undefined) {
      throw new Error(`Missing rank for variant '${variant.variant_id}'.`);
    }

    return {
      ...variant,
      rank,
      is_recommended: rank === 1,
    };
  });
}

function scoreVariant(variant: EditVariantResult): number {
  const severeRegressionPenalty = (variant.comparisonReport.regressions ?? []).reduce(
    (sum, regression) =>
      sum + (regression.severity >= 0.7 ? 8 : regression.severity >= 0.5 ? 3 : 0),
    0,
  );
  const goalScore = (variant.comparisonReport.goal_alignment ?? []).reduce((sum, goal) => {
    if (goal.status === "met") {
      return sum + 3;
    }
    if (goal.status === "mostly_met") {
      return sum + 2;
    }
    if (goal.status === "not_met") {
      return sum - 3;
    }
    return sum;
  }, 0);
  const verificationScore = (variant.comparisonReport.verification_results ?? []).reduce(
    (sum, target) => {
      if (target.status === "met") {
        return sum + 2;
      }
      if (target.status === "mostly_met") {
        return sum + 1;
      }
      if (target.status === "not_met") {
        return sum - 4;
      }
      return sum;
    },
    0,
  );

  return goalScore + verificationScore - severeRegressionPenalty;
}

function labelSafetyOrder(label: EditVariantLabel): number {
  if (label === "subtle") {
    return 0;
  }
  if (label === "balanced") {
    return 1;
  }
  return 2;
}
