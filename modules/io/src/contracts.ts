import {
  type AudioAsset,
  type AudioVersion,
  SCHEMA_VERSION,
  type ValidationIssue,
  validateAudioAsset,
  validateAudioVersion,
} from "@audio-language-interface/core";
import { ContractValidationError } from "./errors.js";

export type { AudioAsset, AudioVersion };
export { SCHEMA_VERSION };

function formatValidationIssues(issues: ValidationIssue[]): string[] {
  return issues.map((issue) => `${issue.instancePath || "/"} ${issue.message}`);
}

/** Validates a value against the canonical `modules/core` `AudioAsset` contract. */
export function assertValidAudioAsset(value: unknown): AudioAsset {
  const result = validateAudioAsset(value);

  if (!result.ok) {
    throw new ContractValidationError("AudioAsset", formatValidationIssues(result.error.issues));
  }

  return result.value;
}

/** Validates a value against the canonical `modules/core` `AudioVersion` contract. */
export function assertValidAudioVersion(value: unknown): AudioVersion {
  const result = validateAudioVersion(value);

  if (!result.ok) {
    throw new ContractValidationError("AudioVersion", formatValidationIssues(result.error.issues));
  }

  return result.value;
}
