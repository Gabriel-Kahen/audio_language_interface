export const TOOL_SCHEMA_VERSION = "1.0.0" as const;

export interface ToolRequest {
  schema_version: typeof TOOL_SCHEMA_VERSION;
  request_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  requested_at: string;
  session_id?: string;
  asset_id?: string;
  version_id?: string;
  caller?: string;
}

export interface ToolResponseError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ToolResponse {
  schema_version: typeof TOOL_SCHEMA_VERSION;
  request_id: string;
  tool_name: string;
  status: "ok" | "error";
  completed_at: string;
  result?: Record<string, unknown>;
  warnings?: string[];
  error?: ToolResponseError;
}

export interface ToolHandlerResult<TResult extends Record<string, unknown>> {
  result: TResult;
  warnings?: string[];
}

export interface ToolDescriptor {
  name: string;
  description: string;
  backing_module: "io" | "analysis" | "transforms" | "render" | "compare";
  required_arguments: readonly string[];
  optional_arguments: readonly string[];
}

export interface ToolContext {
  workspaceRoot: string;
  runtime: import("./runtime.js").ToolsRuntime;
  request: ToolRequest;
}

export interface ToolDefinition<TArgs, TResult extends Record<string, unknown>> {
  descriptor: ToolDescriptor;
  validateArguments: (value: unknown, request: ToolRequest) => TArgs;
  execute: (args: TArgs, context: ToolContext) => Promise<ToolHandlerResult<TResult>>;
}

export type AnyToolDefinition = ToolDefinition<any, Record<string, unknown>>;

export interface ToolRegistry {
  get: (toolName: string) => AnyToolDefinition | undefined;
  list: () => ToolDescriptor[];
}

export interface ExecuteToolRequestOptions {
  workspaceRoot: string;
  registry?: ToolRegistry;
  runtime?: Partial<import("./runtime.js").ToolsRuntime>;
  now?: () => Date;
}
