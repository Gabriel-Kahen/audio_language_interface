import { analyzeAudioVersion } from "@audio-language-interface/analysis";
import { compareVersions } from "@audio-language-interface/compare";
import { importAudioFromFile } from "@audio-language-interface/io";
import { renderPreview } from "@audio-language-interface/render";
import { applyEditPlan } from "@audio-language-interface/transforms";

export interface ToolsRuntime {
  importAudioFromFile: typeof importAudioFromFile;
  analyzeAudioVersion: typeof analyzeAudioVersion;
  applyEditPlan: typeof applyEditPlan;
  renderPreview: typeof renderPreview;
  compareVersions: typeof compareVersions;
}

export const defaultToolsRuntime: ToolsRuntime = {
  importAudioFromFile,
  analyzeAudioVersion,
  applyEditPlan,
  renderPreview,
  compareVersions,
};

export function resolveToolsRuntime(runtime?: Partial<ToolsRuntime>): ToolsRuntime {
  return {
    ...defaultToolsRuntime,
    ...runtime,
  };
}
