import { ToolExecutionError, ToolInputError } from "./errors.js";
import { resolveToolsRuntime } from "./runtime.js";
import { defaultToolRegistry } from "./tool-registry.js";
import type {
  ExecuteToolRequestOptions,
  ToolErrorCode,
  ToolRequest,
  ToolResponse,
} from "./types.js";
import { TOOL_SCHEMA_VERSION } from "./types.js";
import { assertValidToolResponse } from "./validation.js";

function nowIso(now: (() => Date) | undefined): string {
  return (now?.() ?? new Date()).toISOString();
}

function createErrorResponse(
  request: ToolRequest,
  completedAt: string,
  code: ToolErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ToolResponse {
  return assertValidToolResponse({
    schema_version: TOOL_SCHEMA_VERSION,
    request_id: request.request_id,
    tool_name: request.tool_name,
    status: "error",
    completed_at: completedAt,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  });
}

function createOkResponse(
  request: ToolRequest,
  completedAt: string,
  result: Record<string, unknown>,
  warnings?: string[],
): ToolResponse {
  return assertValidToolResponse({
    schema_version: TOOL_SCHEMA_VERSION,
    request_id: request.request_id,
    tool_name: request.tool_name,
    status: "ok",
    completed_at: completedAt,
    result,
    ...(warnings === undefined || warnings.length === 0 ? {} : { warnings }),
  });
}

function normalizeExecutionError(
  request: ToolRequest,
  completedAt: string,
  error: unknown,
): ToolResponse {
  if (error instanceof ToolInputError) {
    return createErrorResponse(request, completedAt, error.code, error.message, error.details);
  }

  if (error instanceof ToolExecutionError) {
    return createErrorResponse(request, completedAt, error.code, error.message, error.details);
  }

  if (error instanceof Error) {
    const stageDetails = extractStageErrorDetails(error);
    return createErrorResponse(request, completedAt, "handler_failed", error.message, {
      cause: error.name,
      ...(stageDetails === undefined ? {} : stageDetails),
    });
  }

  return createErrorResponse(request, completedAt, "handler_failed", "Tool handler failed.");
}

function extractStageErrorDetails(error: Error): Record<string, unknown> | undefined {
  const record = error as Error & {
    stage?: unknown;
    attempts?: unknown;
    partialResult?: unknown;
  };

  if (typeof record.stage !== "string") {
    return undefined;
  }

  return {
    stage: record.stage,
    ...(typeof record.attempts === "number" ? { attempts: record.attempts } : {}),
    ...(record.partialResult === undefined ? {} : { partial_result: record.partialResult }),
  };
}

export async function executeToolRequest(
  request: ToolRequest,
  options: ExecuteToolRequestOptions,
): Promise<ToolResponse> {
  const completedAt = nowIso(options.now);
  const registry = options.registry ?? defaultToolRegistry;
  const definition = registry.get(request.tool_name);

  if (!definition) {
    return createErrorResponse(
      request,
      completedAt,
      "unknown_tool",
      `Unknown tool '${request.tool_name}'.`,
      {
        available_tools: registry.list().map((tool) => tool.name),
      },
    );
  }

  try {
    const args = definition.validateArguments(request.arguments, request);
    const handled = await definition.execute(args, {
      workspaceRoot: options.workspaceRoot,
      runtime: resolveToolsRuntime(options.runtime),
      request,
    });

    return createOkResponse(request, completedAt, handled.result, handled.warnings);
  } catch (error) {
    return normalizeExecutionError(request, completedAt, error);
  }
}
