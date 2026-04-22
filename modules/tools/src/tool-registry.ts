import { analyzeAudioTool } from "./handlers/analyze-audio.js";
import { applyEditPlanTool } from "./handlers/apply-edit-plan.js";
import { compareVersionsTool } from "./handlers/compare-versions.js";
import { describeRuntimeCapabilitiesTool } from "./handlers/describe-runtime-capabilities.js";
import { interpretRequestTool } from "./handlers/interpret-request.js";
import { loadAudioTool } from "./handlers/load-audio.js";
import { planEditsTool } from "./handlers/plan-edits.js";
import { renderPreviewTool } from "./handlers/render-preview.js";
import { runRequestCycleTool } from "./handlers/run-request-cycle.js";
import type { AnyToolDefinition, ToolDescriptor, ToolRegistry } from "./types.js";

const DEFAULT_DEFINITIONS = [
  describeRuntimeCapabilitiesTool,
  loadAudioTool,
  analyzeAudioTool,
  interpretRequestTool,
  planEditsTool,
  applyEditPlanTool,
  renderPreviewTool,
  compareVersionsTool,
  runRequestCycleTool,
] as const satisfies readonly AnyToolDefinition[];

export function createToolRegistry(
  definitions: readonly AnyToolDefinition[] = DEFAULT_DEFINITIONS,
): ToolRegistry {
  const registry = new Map<string, AnyToolDefinition>();

  for (const definition of definitions) {
    if (registry.has(definition.descriptor.name)) {
      throw new Error(`Duplicate tool registration for '${definition.descriptor.name}'.`);
    }

    registry.set(definition.descriptor.name, definition);
  }

  return {
    get(toolName) {
      return registry.get(toolName);
    },
    list() {
      return [...registry.values()].map(
        (definition) => ({ ...definition.descriptor }) satisfies ToolDescriptor,
      );
    },
  };
}

export const defaultToolRegistry = createToolRegistry();

export function describeTools(registry: ToolRegistry = defaultToolRegistry): ToolDescriptor[] {
  return registry.list();
}
