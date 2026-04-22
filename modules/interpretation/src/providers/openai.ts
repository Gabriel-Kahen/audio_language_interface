import { buildCandidateSchema, buildSystemInstruction, buildUserPrompt } from "../prompts.js";
import type { InterpretationProvider, InterpretationProviderRequest } from "../types.js";
import { parseInterpretationCandidate, resolveFetchImpl, toApiError } from "../validation.js";

export class OpenAIInterpretationProvider implements InterpretationProvider {
  async interpret(input: InterpretationProviderRequest) {
    const fetchImpl = resolveFetchImpl(input.fetchImpl);
    const response = await fetchImpl(
      `${input.provider.baseUrl ?? "https://api.openai.com"}/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${input.provider.apiKey}`,
        },
        body: JSON.stringify({
          model: input.provider.model,
          temperature: input.provider.temperature ?? 0,
          messages: [
            {
              role: "system",
              content: buildSystemInstruction(),
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
        ...(input.provider.timeoutMs === undefined
          ? {}
          : { signal: AbortSignal.timeout(input.provider.timeoutMs) }),
      },
    );

    if (!response.ok) {
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
  }
}
