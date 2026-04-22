import { buildCandidateSchema, buildSystemInstruction, buildUserPrompt } from "../prompts.js";
import type { InterpretationProvider, InterpretationProviderRequest } from "../types.js";
import { parseInterpretationCandidate, resolveFetchImpl, toApiError } from "../validation.js";

export class GoogleInterpretationProvider implements InterpretationProvider {
  async interpret(input: InterpretationProviderRequest) {
    const fetchImpl = resolveFetchImpl(input.fetchImpl);
    const baseUrl = input.provider.baseUrl ?? "https://generativelanguage.googleapis.com";
    const url = new URL(
      `/v1beta/models/${input.provider.model}:generateContent`,
      baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
    );
    url.searchParams.set("key", input.provider.apiKey);

    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: buildSystemInstruction() }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: buildUserPrompt(input) }],
          },
        ],
        generationConfig: {
          temperature: input.provider.temperature ?? 0,
          responseMimeType: "application/json",
          responseSchema: buildCandidateSchema(),
        },
      }),
      ...(input.provider.timeoutMs === undefined
        ? {}
        : { signal: AbortSignal.timeout(input.provider.timeoutMs) }),
    });

    if (!response.ok) {
      throw new Error(await toApiError("Google", response));
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string | null }>;
        };
      }>;
    };
    const content = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("Google interpretation response did not contain structured content.");
    }

    return parseInterpretationCandidate(content);
  }
}
