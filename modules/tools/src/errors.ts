import type { ToolErrorCode } from "./types.js";

export class ToolInputError extends Error {
  readonly code: ToolErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ToolErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ToolInputError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export class ToolExecutionError extends Error {
  readonly code: ToolErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ToolErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ToolExecutionError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export class ToolEnvelopeValidationError extends Error {
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown>) {
    super(message);
    this.name = "ToolEnvelopeValidationError";
    this.details = details;
  }
}

export function createProvenanceMismatchError(
  field: string,
  message: string,
  details?: Record<string, unknown>,
): ToolInputError {
  return new ToolInputError("provenance_mismatch", message, {
    field,
    ...(details === undefined ? {} : details),
  });
}

export function createUnsupportedOperationError(
  field: string,
  operation: string,
  supportedOperations: readonly string[],
  toolName: string,
): ToolInputError {
  return new ToolInputError(
    "unsupported_operation",
    `${field} '${operation}' is not supported by ${toolName}.`,
    {
      field,
      operation,
      supported_operations: [...supportedOperations],
      tool_name: toolName,
    },
  );
}
