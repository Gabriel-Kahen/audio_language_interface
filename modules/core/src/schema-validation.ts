import { createRequire } from "node:module";

import type { ErrorObject } from "ajv";

import audioAssetSchema from "../../../contracts/schemas/json/audio-asset.schema.json" with {
  type: "json",
};
import audioVersionSchema from "../../../contracts/schemas/json/audio-version.schema.json" with {
  type: "json",
};
import commonSchema from "../../../contracts/schemas/json/common.schema.json" with { type: "json" };

import type { ValidationIssue } from "./result.js";

type ValidateFunction = ((value: unknown) => boolean) & {
  errors?: ErrorObject[] | null;
};

interface AjvLike {
  addSchema(schema: object): void;
  compile(schema: object): ValidateFunction;
}

type AjvConstructor = new (options?: Record<string, unknown>) => AjvLike;
type AddFormats = (ajv: AjvLike) => void;

const require = createRequire(import.meta.url);
const ajvModule = require("ajv/dist/2020");
const addFormatsModule = require("ajv-formats");
const Ajv2020 = (ajvModule.default ?? ajvModule) as AjvConstructor;
const addFormats = (addFormatsModule.default ?? addFormatsModule) as AddFormats;

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(commonSchema);

const validateAudioAssetSchema = ajv.compile(audioAssetSchema);
const validateAudioVersionSchema = ajv.compile(audioVersionSchema);

export function getAudioAssetSchemaIssues(value: unknown): ValidationIssue[] {
  return getSchemaIssues(validateAudioAssetSchema, value);
}

export function getAudioVersionSchemaIssues(value: unknown): ValidationIssue[] {
  return getSchemaIssues(validateAudioVersionSchema, value);
}

function getSchemaIssues(validate: ValidateFunction, value: unknown): ValidationIssue[] {
  if (validate(value)) {
    return [];
  }

  return (validate.errors ?? []).map(toValidationIssue);
}

function toValidationIssue(error: ErrorObject): ValidationIssue {
  return {
    instancePath: error.instancePath || "/",
    keyword: error.keyword,
    message: error.message ?? "validation error",
  };
}
