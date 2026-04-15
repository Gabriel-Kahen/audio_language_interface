export class IoModuleError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InvalidSourceReferenceError extends IoModuleError {}

export class UnsupportedAudioFormatError extends IoModuleError {
  constructor(
    public readonly format: string,
    message?: string,
  ) {
    super(message ?? `Unsupported audio format: ${format}`);
  }
}

export class ExternalToolError extends IoModuleError {
  constructor(
    public readonly tool: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export class ContractValidationError extends IoModuleError {
  constructor(
    public readonly contractName: string,
    public readonly issues: string[],
  ) {
    super(`${contractName} failed validation: ${issues.join("; ")}`);
  }
}
