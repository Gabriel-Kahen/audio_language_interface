import { DEFAULT_NORMALIZATION_TARGET } from "@audio-language-interface/io";

import { executeWithFailurePolicy } from "../failure-policy.js";
import type { ImportAndAnalyzeOptions, ImportAndAnalyzeResult } from "../types.js";

/** Imports a file into workspace storage and analyzes the imported version. */
export async function importAndAnalyze(
  options: ImportAndAnalyzeOptions,
): Promise<ImportAndAnalyzeResult> {
  const trace = [] as ImportAndAnalyzeResult["trace"];
  let importResult: ImportAndAnalyzeResult["importResult"] | undefined;

  importResult = await executeWithFailurePolicy({
    stage: "import",
    operation: () =>
      options.dependencies.importAudioFromFile(options.inputPath, {
        ...options.importOptions,
        normalizationTarget:
          options.importOptions?.normalizationTarget ?? DEFAULT_NORMALIZATION_TARGET,
      }),
    failurePolicy: options.failurePolicy,
    getPartialResult: () => ({ importResult }),
    trace,
  });

  const analysisReport = await executeWithFailurePolicy({
    stage: "analyze_input",
    operation: () =>
      options.dependencies.analyzeAudioVersion(importResult.version, options.analysisOptions),
    failurePolicy: options.failurePolicy,
    getPartialResult: () => ({ importResult }),
    trace,
  });

  return {
    asset: importResult.asset,
    version: importResult.version,
    analysisReport,
    importResult,
    trace,
  };
}
