export interface ValidationIssue {
  instancePath: string;
  keyword: string;
  message: string;
}

export interface ValidationError {
  code: "validation_error";
  message: string;
  issues: ValidationIssue[];
}

export type Result<TValue, TError> =
  | {
      ok: true;
      value: TValue;
    }
  | {
      ok: false;
      error: TError;
    };

export type ValidationResult<TValue> = Result<TValue, ValidationError>;

/** Creates a successful discriminated result. */
export function ok<TValue>(value: TValue): Result<TValue, never> {
  return { ok: true, value };
}

/** Creates a failed discriminated result. */
export function err<TError>(error: TError): Result<never, TError> {
  return { ok: false, error };
}

/** Narrows a result to its success branch. */
export function isOk<TValue, TError>(
  result: Result<TValue, TError>,
): result is { ok: true; value: TValue } {
  return result.ok;
}

/** Narrows a result to its error branch. */
export function isErr<TValue, TError>(
  result: Result<TValue, TError>,
): result is { ok: false; error: TError } {
  return !result.ok;
}
