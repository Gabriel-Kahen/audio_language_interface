import type { AnalysisReport, AudioVersion, EditPlan, RenderArtifact } from "./types.js";

export function assertComparableAsset(
  baselineAssetId: string,
  candidateAssetId: string,
  artifactLabel: string,
): void {
  if (baselineAssetId !== candidateAssetId) {
    throw new Error(
      `Baseline and candidate ${artifactLabel} references must belong to the same asset_id.`,
    );
  }
}

export function assertAnalysisMatchesVersion(
  analysis: AnalysisReport,
  version: AudioVersion,
  role: "baseline" | "candidate",
): void {
  if (analysis.asset_id !== version.asset_id) {
    throw new Error(
      `${capitalize(role)} AnalysisReport asset_id must match the paired AudioVersion asset_id.`,
    );
  }

  if (analysis.version_id !== version.version_id) {
    throw new Error(
      `${capitalize(role)} AnalysisReport version_id must match the paired AudioVersion version_id.`,
    );
  }
}

export function assertAnalysisMatchesRender(
  analysis: AnalysisReport,
  render: RenderArtifact,
  role: "baseline" | "candidate",
): void {
  if (analysis.asset_id !== render.asset_id) {
    throw new Error(
      `${capitalize(role)} AnalysisReport asset_id must match the paired RenderArtifact asset_id.`,
    );
  }

  if (analysis.version_id !== render.version_id) {
    throw new Error(
      `${capitalize(role)} AnalysisReport version_id must match the paired RenderArtifact version_id.`,
    );
  }
}

export function assertEditPlanMatchesBaseline(
  editPlan: EditPlan,
  baseline: Pick<AudioVersion, "asset_id" | "version_id">,
  artifactLabel: "AudioVersion" | "RenderArtifact",
): void {
  if (editPlan.asset_id !== baseline.asset_id) {
    throw new Error(`EditPlan asset_id must match the baseline ${artifactLabel} asset_id.`);
  }

  if (editPlan.version_id !== baseline.version_id) {
    throw new Error(`EditPlan version_id must match the baseline ${artifactLabel} version_id.`);
  }
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
