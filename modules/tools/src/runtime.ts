import { analyzeAudioVersion } from "@audio-language-interface/analysis";
import { defaultRuntimeCapabilityManifest } from "@audio-language-interface/capabilities";
import { compareVersions } from "@audio-language-interface/compare";
import { importAudioFromFile } from "@audio-language-interface/io";
import { runRequestCycle } from "@audio-language-interface/orchestration";
import { planEdits } from "@audio-language-interface/planning";
import { renderPreview } from "@audio-language-interface/render";
import { applyEditPlan } from "@audio-language-interface/transforms";

export interface ToolsRuntime {
  getRuntimeCapabilityManifest: typeof getRuntimeCapabilityManifest;
  importAudioFromFile: typeof importAudioFromFile;
  analyzeAudioVersion: typeof analyzeAudioVersion;
  planEdits: typeof planEdits;
  applyEditPlan: typeof applyEditPlan;
  renderPreview: typeof renderPreview;
  compareVersions: typeof compareVersions;
  runRequestCycle: typeof runRequestCycle;
}

function getRuntimeCapabilityManifest() {
  return defaultRuntimeCapabilityManifest;
}

export const defaultToolsRuntime: ToolsRuntime = {
  getRuntimeCapabilityManifest,
  importAudioFromFile,
  analyzeAudioVersion,
  planEdits,
  applyEditPlan,
  renderPreview,
  compareVersions,
  runRequestCycle,
};

export function resolveToolsRuntime(runtime?: Partial<ToolsRuntime>): ToolsRuntime {
  return {
    ...defaultToolsRuntime,
    ...runtime,
  };
}
