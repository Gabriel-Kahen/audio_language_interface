import type { ValidationIssue } from "./result.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function pushUnexpectedKeys(
  issues: ValidationIssue[],
  path: string,
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push({
        instancePath: joinPath(path, key),
        keyword: "additionalProperties",
        message: "must not include unknown properties",
      });
    }
  }
}

export function pushMissingKeys(
  issues: ValidationIssue[],
  path: string,
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
): void {
  for (const key of requiredKeys) {
    if (!(key in value)) {
      issues.push({
        instancePath: path || "/",
        keyword: "required",
        message: `must include ${key}`,
      });
    }
  }
}

export function pushNonEmptyString(issues: ValidationIssue[], path: string, value: unknown): void {
  if (typeof value !== "string" || value.length === 0) {
    issues.push({
      instancePath: path,
      keyword: "minLength",
      message: "must be a non-empty string",
    });
  }
}

export function pushOptionalString(issues: ValidationIssue[], path: string, value: unknown): void {
  if (value !== undefined && typeof value !== "string") {
    issues.push({
      instancePath: path,
      keyword: "type",
      message: "must be a string",
    });
  }
}

export function pushOptionalBoolean(issues: ValidationIssue[], path: string, value: unknown): void {
  if (value !== undefined && typeof value !== "boolean") {
    issues.push({
      instancePath: path,
      keyword: "type",
      message: "must be a boolean",
    });
  }
}

export function pushNumber(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
  options: {
    integer?: boolean;
    minimum?: number;
    exclusiveMinimum?: number;
  } = {},
): void {
  if (typeof value !== "number" || Number.isNaN(value)) {
    issues.push({
      instancePath: path,
      keyword: "type",
      message: "must be a number",
    });
    return;
  }

  if (options.integer && !Number.isInteger(value)) {
    issues.push({
      instancePath: path,
      keyword: "type",
      message: "must be an integer",
    });
  }

  if (options.minimum !== undefined && value < options.minimum) {
    issues.push({
      instancePath: path,
      keyword: "minimum",
      message: `must be greater than or equal to ${options.minimum}`,
    });
  }

  if (options.exclusiveMinimum !== undefined && value <= options.exclusiveMinimum) {
    issues.push({
      instancePath: path,
      keyword: "exclusiveMinimum",
      message: `must be greater than ${options.exclusiveMinimum}`,
    });
  }
}

export function pushOptionalStringArray(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    issues.push({
      instancePath: path,
      keyword: "type",
      message: "must be an array of strings",
    });
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string") {
      issues.push({
        instancePath: joinPath(path, String(index)),
        keyword: "type",
        message: "must be a string",
      });
    }
  });
}

function joinPath(path: string, key: string): string {
  return `${path}/${key}`.replace(/\/+/g, "/");
}
