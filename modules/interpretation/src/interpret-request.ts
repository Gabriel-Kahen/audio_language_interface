import { createInterpretationProvider } from "./provider.js";
import type { IntentInterpretation, InterpretRequestOptions } from "./types.js";
import { DEFAULT_PROMPT_VERSION } from "./types.js";
import { assertValidInterpretationInputs, buildInterpretationArtifact } from "./validation.js";

/**
 * Interprets a raw user request with an external LLM and returns a validated
 * `IntentInterpretation` artifact that deterministic planning can inspect.
 */
export async function interpretRequest(
  options: InterpretRequestOptions,
): Promise<IntentInterpretation> {
  const capabilityManifest = assertValidInterpretationInputs({
    audioVersion: options.audioVersion,
    analysisReport: options.analysisReport,
    semanticProfile: options.semanticProfile,
    ...(options.capabilityManifest === undefined
      ? {}
      : { capabilityManifest: options.capabilityManifest }),
  });

  const provider = createInterpretationProvider(options.provider);
  const candidate = await provider.interpret({
    userRequest: options.userRequest,
    audioVersion: options.audioVersion,
    analysisReport: options.analysisReport,
    semanticProfile: options.semanticProfile,
    capabilityManifest,
    provider: options.provider,
    promptVersion: options.promptVersion ?? DEFAULT_PROMPT_VERSION,
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  });

  return buildInterpretationArtifact(
    {
      userRequest: options.userRequest,
      audioVersion: options.audioVersion,
      analysisReport: options.analysisReport,
      semanticProfile: options.semanticProfile,
      capabilityManifest,
      provider: options.provider,
      promptVersion: options.promptVersion ?? DEFAULT_PROMPT_VERSION,
      ...(options.generatedAt === undefined ? {} : { generatedAt: options.generatedAt }),
    },
    candidate,
  );
}
