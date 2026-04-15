export class ToolInputError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ToolInputError";
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
