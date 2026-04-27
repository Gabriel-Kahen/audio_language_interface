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
    provider:
      options.interpretation.provider.kind === "codex_cli"
        ? {
            kind: "codex_cli",
            ...(options.interpretation.provider.model === undefined
              ? {}
              : { model: options.interpretation.provider.model }),
            ...(options.interpretation.provider.codexPath === undefined
              ? {}
              : { codexPath: options.interpretation.provider.codexPath }),
            ...(options.interpretation.provider.profile === undefined
              ? {}
              : { profile: options.interpretation.provider.profile }),
            ...(options.interpretation.provider.timeoutMs === undefined
              ? {}
              : { timeoutMs: options.interpretation.provider.timeoutMs }),
            ...(options.interpretation.provider.maxRetries === undefined
              ? {}
              : { maxRetries: options.interpretation.provider.maxRetries }),
          }
        : {
            kind: options.interpretation.provider.kind,
            apiKey: requireInterpretationApiKey(options.interpretation),
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

function requireInterpretationApiKey(options: LlmAssistedInterpretationOptions): string {
  if (options.apiKey && options.apiKey.length > 0) {
    return options.apiKey;
  }

  throw new Error(
    `LLM-assisted interpretation provider '${options.provider.kind}' requires an apiKey.`,
  );
}
