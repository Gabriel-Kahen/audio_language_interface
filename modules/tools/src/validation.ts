import { type AnalysisReport, assertValidAnalysisReport } from "@audio-language-interface/analysis";
import {
  assertValidComparisonReport,
  type ComparisonReport,
} from "@audio-language-interface/compare";
import {
  type AudioAsset,
  type AudioVersion,
  assertValidAudioAsset,
  assertValidAudioVersion,
} from "@audio-language-interface/io";
import { assertValidEditPlan } from "@audio-language-interface/planning";
import type { RenderArtifact } from "@audio-language-interface/render";
import {
  assertValidSemanticProfile,
  type SemanticProfile,
} from "@audio-language-interface/semantics";
import type { EditPlan, TransformRecord } from "@audio-language-interface/transforms";
import type { ErrorObject } from "ajv";
import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";

import audioAssetSchema from "../../../contracts/schemas/json/audio-asset.schema.json" with {
  type: "json",
};
import commonSchema from "../../../contracts/schemas/json/common.schema.json" with { type: "json" };
import editPlanSchema from "../../../contracts/schemas/json/edit-plan.schema.json" with {
  type: "json",
};
import renderArtifactSchema from "../../../contracts/schemas/json/render-artifact.schema.json" with {
  type: "json",
};
import toolRequestSchema from "../../../contracts/schemas/json/tool-request.schema.json" with {
  type: "json",
};
import toolResponseSchema from "../../../contracts/schemas/json/tool-response.schema.json" with {
  type: "json",
};
import transformRecordSchema from "../../../contracts/schemas/json/transform-record.schema.json" with {
  type: "json",
};

import { ToolEnvelopeValidationError, ToolExecutionError, ToolInputError } from "./errors.js";
import type { ToolRequest, ToolResponse } from "./types.js";

type ValidateFunction<T> = {
  (value: unknown): value is T;
  errors?: ErrorObject[] | null;
};

function buildAjv() {
  const Ajv2020 = Ajv2020Import as unknown as new (options: {
    allErrors: boolean;
    strict: boolean;
  }) => {
    addSchema: (schema: object, key?: string) => void;
    compile: <T>(schema: object) => ValidateFunction<T>;
  };
  const addFormats = addFormatsImport as unknown as (ajv: object) => void;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(commonSchema, "./common.schema.json");
  return ajv;
}

const ajv = buildAjv();
const toolRequestValidator = ajv.compile<ToolRequest>(toolRequestSchema);
const toolResponseValidator = ajv.compile<ToolResponse>(toolResponseSchema);
const editPlanValidator = ajv.compile<EditPlan>(editPlanSchema);
const audioAssetValidator = ajv.compile<AudioAsset>(audioAssetSchema);
const renderArtifactValidator = ajv.compile<RenderArtifact>(renderArtifactSchema);
const transformRecordValidator = ajv.compile<TransformRecord>(transformRecordSchema);

function formatAjvErrors(errors: ErrorObject[] | null | undefined): Record<string, unknown>[] {
  return (errors ?? []).map((error) => ({
    instance_path: error.instancePath,
    message: error.message ?? "schema validation failed",
    keyword: error.keyword,
  }));
}

function toErrorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

function invalidContractValue(
  fieldName: string,
  contractName: string,
  details?: Record<string, unknown>,
): never {
  throw new ToolInputError("invalid_arguments", `${fieldName} must be a valid ${contractName}.`, {
    field: fieldName,
    ...(details === undefined ? {} : details),
  });
}

function invalidToolResultValue(
  fieldName: string,
  contractName: string,
  details?: Record<string, unknown>,
): never {
  throw new ToolExecutionError(
    "invalid_result_contract",
    `${fieldName} must be a valid ${contractName}.`,
    {
      field: fieldName,
      contract: contractName,
      ...(details === undefined ? {} : details),
    },
  );
}

function assertSchemaValidatedOutput<T>(
  value: unknown,
  fieldName: string,
  contractName: string,
  validator: ValidateFunction<T>,
): T {
  if (validator(value)) {
    return value;
  }

  invalidToolResultValue(fieldName, contractName, {
    issues: formatAjvErrors(validator.errors),
  });
}

export function validateToolRequestEnvelope(value: unknown): ToolRequest {
  if (toolRequestValidator(value)) {
    return value as ToolRequest;
  }

  throw new ToolEnvelopeValidationError("ToolRequest schema validation failed.", {
    issues: formatAjvErrors(toolRequestValidator.errors),
  });
}

export function assertValidToolResponse(value: ToolResponse): ToolResponse {
  if (toolResponseValidator(value)) {
    return value;
  }

  throw new Error(
    `ToolResponse schema validation failed: ${JSON.stringify(toolResponseValidator.errors)}`,
  );
}

export function isValidToolResponse(value: ToolResponse): boolean {
  return toolResponseValidator(value) === true;
}

export function expectRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new ToolInputError("invalid_arguments", `${fieldName} must be an object.`, {
    field: fieldName,
  });
}

export function expectString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new ToolInputError("invalid_arguments", `${fieldName} must be a non-empty string.`, {
    field: fieldName,
  });
}

export function expectOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectString(value, fieldName);
}

export function expectBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  throw new ToolInputError("invalid_arguments", `${fieldName} must be a boolean.`, {
    field: fieldName,
  });
}

export function expectOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectBoolean(value, fieldName);
}

export function expectNumber(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  throw new ToolInputError("invalid_arguments", `${fieldName} must be a finite number.`, {
    field: fieldName,
  });
}

export function expectOptionalNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectNumber(value, fieldName);
}

export function expectPositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  throw new ToolInputError("invalid_arguments", `${fieldName} must be a positive integer.`, {
    field: fieldName,
  });
}

export function expectOptionalPositiveInteger(
  value: unknown,
  fieldName: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectPositiveInteger(value, fieldName);
}

export function expectStringArray(value: unknown, fieldName: string): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0)) {
    return [...value];
  }

  throw new ToolInputError(
    "invalid_arguments",
    `${fieldName} must be an array of non-empty strings.`,
    {
      field: fieldName,
    },
  );
}

export function expectOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectStringArray(value, fieldName);
}

export function expectAudioVersion(value: unknown, fieldName: string): AudioVersion {
  const record = expectRecord(value, fieldName);

  try {
    assertValidAudioVersion(record as unknown as AudioVersion);
    return record as unknown as AudioVersion;
  } catch (error) {
    invalidContractValue(fieldName, "AudioVersion", {
      reason: toErrorMessage(error),
    });
  }
}

export function expectAnalysisReport(value: unknown, fieldName: string): AnalysisReport {
  const record = expectRecord(value, fieldName);

  try {
    assertValidAnalysisReport(record as unknown as AnalysisReport);
    return record as unknown as AnalysisReport;
  } catch (error) {
    invalidContractValue(fieldName, "AnalysisReport", {
      reason: toErrorMessage(error),
    });
  }
}

export function expectSemanticProfile(value: unknown, fieldName: string): SemanticProfile {
  const record = expectRecord(value, fieldName);

  try {
    assertValidSemanticProfile(record as unknown as SemanticProfile);
    return record as unknown as SemanticProfile;
  } catch (error) {
    invalidContractValue(fieldName, "SemanticProfile", {
      reason: toErrorMessage(error),
    });
  }
}

export function expectEditPlan(value: unknown, fieldName: string): EditPlan {
  const record = expectRecord(value, fieldName);

  if (editPlanValidator(record)) {
    return record as EditPlan;
  }

  invalidContractValue(fieldName, "EditPlan", {
    issues: formatAjvErrors(editPlanValidator.errors),
  });
}

export function assertToolResultEditPlan(value: unknown, fieldName: string): EditPlan {
  try {
    assertValidEditPlan(value as EditPlan);
    return assertSchemaValidatedOutput(value, fieldName, "EditPlan", editPlanValidator);
  } catch (error) {
    invalidToolResultValue(fieldName, "EditPlan", {
      reason: toErrorMessage(error),
    });
  }
}

export function assertToolResultAudioAsset(value: unknown, fieldName: string): AudioAsset {
  try {
    assertValidAudioAsset(value);
    return assertSchemaValidatedOutput(value, fieldName, "AudioAsset", audioAssetValidator);
  } catch (error) {
    invalidToolResultValue(fieldName, "AudioAsset", {
      reason: toErrorMessage(error),
    });
  }
}

export function assertToolResultAudioVersion(value: unknown, fieldName: string): AudioVersion {
  try {
    return assertValidAudioVersion(value);
  } catch (error) {
    invalidToolResultValue(fieldName, "AudioVersion", {
      reason: toErrorMessage(error),
    });
  }
}

export function assertToolResultAnalysisReport(value: unknown, fieldName: string): AnalysisReport {
  try {
    assertValidAnalysisReport(value as AnalysisReport);
    return value as AnalysisReport;
  } catch (error) {
    invalidToolResultValue(fieldName, "AnalysisReport", {
      reason: toErrorMessage(error),
    });
  }
}

export function assertToolResultComparisonReport(
  value: unknown,
  fieldName: string,
): ComparisonReport {
  try {
    assertValidComparisonReport(value as ComparisonReport);
    return value as ComparisonReport;
  } catch (error) {
    invalidToolResultValue(fieldName, "ComparisonReport", {
      reason: toErrorMessage(error),
    });
  }
}

export function assertToolResultRenderArtifact(value: unknown, fieldName: string): RenderArtifact {
  return assertSchemaValidatedOutput(value, fieldName, "RenderArtifact", renderArtifactValidator);
}

export function assertToolResultTransformRecord(
  value: unknown,
  fieldName: string,
): TransformRecord {
  return assertSchemaValidatedOutput(value, fieldName, "TransformRecord", transformRecordValidator);
}
