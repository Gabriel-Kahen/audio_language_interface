import type {
  LlmAssistedInterpretationOptions,
  OrchestrationDependencies,
  SemanticProfile,
} from "./types.js";

interface ResolveRequestInterpretationOptions {
  userRequest: string;
  audioVersion: import("./types.js").AudioVersion;
  analysisReport: import("./types.js").AnalysisReport;
  semanticProfile: SemanticProfile;
  interpretation: LlmAssistedInterpretationOptions;
  interpretRequest?: OrchestrationDependencies["interpretRequest"];
}

export async function resolveRequestInterpretation(options: ResolveRequestInterpretationOptions) {
  if (!options.interpretRequest) {
    throw new Error(
      "LLM-assisted interpretation was requested, but no interpretRequest dependency was provided.",
    );
  }

  return options.interpretRequest({
    userRequest: options.userRequest,
    audioVersion: options.audioVersion,
    analysisReport: options.analysisReport,
    semanticProfile: options.semanticProfile,
    provider: {
      kind: options.interpretation.provider.kind,
      apiKey: options.interpretation.apiKey,
      model: options.interpretation.provider.model,
      ...(options.interpretation.provider.apiBaseUrl === undefined
        ? {}
        : { baseUrl: options.interpretation.provider.apiBaseUrl }),
      ...(options.interpretation.provider.temperature === undefined
        ? {}
        : { temperature: options.interpretation.provider.temperature }),
      ...(options.interpretation.provider.timeoutMs === undefined
        ? {}
        : { timeoutMs: options.interpretation.provider.timeoutMs }),
    },
    ...(options.interpretation.promptVersion === undefined
      ? {}
      : { promptVersion: options.interpretation.promptVersion }),
  });
}
