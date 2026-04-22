import { createHash } from "node:crypto";

import { createInterpretationProvider } from "./provider.js";
import type { IntentInterpretation, InterpretRequestOptions } from "./types.js";
import { DEFAULT_INTERPRETATION_POLICY, DEFAULT_PROMPT_VERSION } from "./types.js";
import {
  applyInterpretationPolicy,
  assertValidInterpretationInputs,
  buildInterpretationArtifact,
} from "./validation.js";

/**
 * Interprets a raw user request with an external LLM and returns a validated
 * `IntentInterpretation` artifact that deterministic planning can inspect.
 */
export async function interpretRequest(
  options: InterpretRequestOptions,
): Promise<IntentInterpretation> {
  const promptVersion = options.promptVersion ?? DEFAULT_PROMPT_VERSION;
  const policy = options.policy ?? DEFAULT_INTERPRETATION_POLICY;
  const capabilityManifest = assertValidInterpretationInputs({
    audioVersion: options.audioVersion,
    analysisReport: options.analysisReport,
    semanticProfile: options.semanticProfile,
    ...(options.capabilityManifest === undefined
      ? {}
      : { capabilityManifest: options.capabilityManifest }),
  });
  const cacheKey = buildInterpretationCacheKey(options, capabilityManifest, promptVersion);

  if (options.cacheStore) {
    const cached = await options.cacheStore.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        provider: {
          ...cached.provider,
          cached: true,
          response_ms: 0,
        },
      };
    }
  }

  const provider = createInterpretationProvider(options.provider);
  const startedAt = Date.now();
  const candidate = await provider.interpret({
    userRequest: options.userRequest,
    audioVersion: options.audioVersion,
    analysisReport: options.analysisReport,
    semanticProfile: options.semanticProfile,
    capabilityManifest,
    provider: options.provider,
    ...(options.sessionContext === undefined ? {} : { sessionContext: options.sessionContext }),
    promptVersion,
    policy,
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  });
  const responseMs = Date.now() - startedAt;
  const policyAppliedCandidate = applyInterpretationPolicy(candidate, policy);

  const interpretation = buildInterpretationArtifact(
    {
      userRequest: options.userRequest,
      audioVersion: options.audioVersion,
      analysisReport: options.analysisReport,
      semanticProfile: options.semanticProfile,
      capabilityManifest,
      provider: options.provider,
      promptVersion,
      policy,
      ...(options.generatedAt === undefined ? {} : { generatedAt: options.generatedAt }),
    },
    policyAppliedCandidate,
  );

  const hydratedInterpretation: IntentInterpretation = {
    ...interpretation,
    provider: {
      ...interpretation.provider,
      cached: false,
      response_ms: responseMs,
    },
  };

  if (options.cacheStore) {
    await options.cacheStore.set(cacheKey, hydratedInterpretation);
  }

  return hydratedInterpretation;
}

function buildInterpretationCacheKey(
  options: InterpretRequestOptions,
  capabilityManifest: NonNullable<InterpretRequestOptions["capabilityManifest"]>,
  promptVersion: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        request: options.userRequest,
        asset_id: options.audioVersion.asset_id,
        version_id: options.audioVersion.version_id,
        analysis_report_id: options.analysisReport.report_id,
        semantic_profile_id: options.semanticProfile.profile_id,
        provider_kind: options.provider.kind,
        provider_model: options.provider.model,
        prompt_version: promptVersion,
        interpretation_policy: options.policy ?? DEFAULT_INTERPRETATION_POLICY,
        capability_manifest_id: capabilityManifest.manifest_id,
        session_context: options.sessionContext,
      }),
    )
    .digest("hex");
}
