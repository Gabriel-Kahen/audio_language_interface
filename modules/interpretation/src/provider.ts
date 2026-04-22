import { GoogleInterpretationProvider } from "./providers/google.js";
import { OpenAIInterpretationProvider } from "./providers/openai.js";
import type { InterpretationProvider, InterpretationProviderConfig } from "./types.js";

export function createInterpretationProvider(
  config: InterpretationProviderConfig,
): InterpretationProvider {
  if (config.kind === "openai") {
    return new OpenAIInterpretationProvider();
  }

  if (config.kind === "google") {
    return new GoogleInterpretationProvider();
  }

  throw new Error(`Unsupported interpretation provider '${(config as { kind?: string }).kind}'.`);
}
