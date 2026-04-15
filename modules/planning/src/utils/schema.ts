import { readFileSync } from "node:fs";

import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";

import type { EditPlan } from "../types.js";

function loadJson(relativePath: string): object {
  const fileUrl = new URL(relativePath, import.meta.url);
  return JSON.parse(readFileSync(fileUrl, "utf8")) as object;
}

const commonSchema = loadJson("../../../../contracts/schemas/json/common.schema.json");
const editPlanSchema = loadJson("../../../../contracts/schemas/json/edit-plan.schema.json");

function buildAjv() {
  const Ajv2020 = Ajv2020Import as unknown as new (options: {
    allErrors: boolean;
    strict: boolean;
  }) => {
    addSchema: (value: unknown, key?: string) => void;
    compile: <T>(value: unknown) => {
      (candidate: unknown): candidate is T;
      errors?: unknown;
    };
  };
  const addFormats = addFormatsImport as unknown as (ajv: object) => void;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(commonSchema, "./common.schema.json");
  return ajv;
}

const editPlanValidator = buildAjv().compile<EditPlan>(editPlanSchema);

export function assertValidEditPlan(plan: EditPlan): void {
  if (editPlanValidator(plan)) {
    return;
  }

  throw new Error(`EditPlan schema validation failed: ${JSON.stringify(editPlanValidator.errors)}`);
}

export function isValidEditPlan(plan: EditPlan): boolean {
  return editPlanValidator(plan) === true;
}
