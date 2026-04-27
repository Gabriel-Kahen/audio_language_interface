import { buildCandidateSchema, buildSystemInstruction, buildUserPrompt } from "../prompts.js";
import type {
  InterpretationProvider,
  InterpretationProviderRequest,
  RemoteInterpretationProviderConfig,
} from "../types.js";
import {
  isRetryableInterpretationStatus,
  parseInterpretationCandidate,
  resolveFetchImpl,
  sleepMs,
  toApiError,
} from "../validation.js";

export class OpenAIInterpretationProvider implements InterpretationProvider {
  async interpret(input: InterpretationProviderRequest) {
    if (input.provider.kind !== "openai") {
      throw new Error("OpenAIInterpretationProvider requires an openai provider config.");
    }

    const provider: RemoteInterpretationProviderConfig = input.provider;
    const fetchImpl = resolveFetchImpl(input.fetchImpl);
    const maxAttempts = (provider.maxRetries ?? 1) + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetchImpl(
          `${provider.baseUrl ?? "https://api.openai.com"}/v1/chat/completions`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${provider.apiKey}`,
            },
            body: JSON.stringify({
              model: provider.model,
              temperature: provider.temperature ?? 0,
              messages: [
                {
                  role: "system",
                  content: buildSystemInstruction(input.policy),
                },
                {
                  role: "user",
                  content: buildUserPrompt(input),
                },
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "intent_interpretation_candidate",
                  schema: buildCandidateSchema(),
                  strict: true,
                },
              },
            }),
            ...(provider.timeoutMs === undefined
              ? {}
              : { signal: AbortSignal.timeout(provider.timeoutMs) }),
          },
        );

        if (!response.ok) {
          if (attempt < maxAttempts && isRetryableInterpretationStatus(response.status)) {
            await sleepMs(attempt * 200);
            continue;
          }

          throw new Error(await toApiError("OpenAI", response));
        }

        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string | null } }>;
        };
        const content = payload.choices?.[0]?.message?.content;
        if (typeof content !== "string" || content.length === 0) {
          throw new Error("OpenAI interpretation response did not contain structured content.");
        }

        return parseInterpretationCandidate(content);
      } catch (error) {
        if (attempt < maxAttempts) {
          await sleepMs(attempt * 200);
          continue;
        }

        throw error;
      }
    }

    throw new Error("OpenAI interpretation request exhausted all retries.");
  }
}
