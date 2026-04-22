import type {
  LlmAssistedInterpretationOptions,
  OrchestrationDependencies,
  SemanticProfile,
} from "./types.js";

interface ResolveRequestInterpretationOptions {
  userRequest: string;
  originalUserRequest?: string;
  audioVersion: import("./types.js").AudioVersion;
  analysisReport: import("./types.js").AnalysisReport;
  semanticProfile: SemanticProfile;
  interpretation: LlmAssistedInterpretationOptions;
  sessionContext?: import("@audio-language-interface/interpretation").InterpretationSessionContext;
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
    ...(options.sessionContext === undefined ? {} : { sessionContext: options.sessionContext }),
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
      ...(options.interpretation.provider.maxRetries === undefined
        ? {}
        : { maxRetries: options.interpretation.provider.maxRetries }),
    },
    ...(options.interpretation.policy === undefined
      ? {}
      : { policy: options.interpretation.policy }),
    ...(options.interpretation.promptVersion === undefined
      ? {}
      : { promptVersion: options.interpretation.promptVersion }),
  });
}
