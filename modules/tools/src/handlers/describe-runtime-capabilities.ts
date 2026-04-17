import { ToolInputError } from "../errors.js";
import type { ToolDefinition } from "../types.js";
import { assertToolResultRuntimeCapabilityManifest, expectRecord } from "../validation.js";

function validateArguments(value: unknown): Record<string, never> {
  const record = expectRecord(value, "arguments");

  if (Object.keys(record).length > 0) {
    throw new ToolInputError(
      "invalid_arguments",
      "arguments for describe_runtime_capabilities must be empty.",
      {
        field: "arguments",
      },
    );
  }

  return {};
}

export const describeRuntimeCapabilitiesTool: ToolDefinition<
  Record<string, never>,
  Record<string, unknown>
> = {
  descriptor: {
    name: "describe_runtime_capabilities",
    description: "Return the published runtime capability manifest for the audio runtime layer.",
    backing_module: "capabilities",
    required_arguments: [],
    optional_arguments: [],
    error_codes: ["invalid_arguments", "invalid_result_contract", "handler_failed"],
  },
  validateArguments,
  async execute(_args, context) {
    const manifest = assertToolResultRuntimeCapabilityManifest(
      context.runtime.getRuntimeCapabilityManifest(),
      "result.runtime_capability_manifest",
    );

    return {
      result: {
        runtime_capability_manifest: manifest as unknown as Record<string, unknown>,
      },
    };
  },
};
