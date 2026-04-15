import { readFileSync } from "node:fs";

import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";

import type { ComparisonReport } from "../types.js";

function loadJson(relativePath: string): object {
  const fileUrl = new URL(relativePath, import.meta.url);
  return JSON.parse(readFileSync(fileUrl, "utf8")) as object;
}

const commonSchema = loadJson("../../../../contracts/schemas/json/common.schema.json");
const comparisonReportSchema = loadJson(
  "../../../../contracts/schemas/json/comparison-report.schema.json",
);

function buildAjv() {
  const Ajv2020 = Ajv2020Import as unknown as new (options: {
    allErrors: boolean;
    strict: boolean;
  }) => {
    addSchema: (schema: object, key?: string) => void;
    compile: <T>(schema: object) => {
      (value: unknown): value is T;
      errors?: unknown;
    };
  };
  const addFormats = addFormatsImport as unknown as (ajv: object) => void;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(commonSchema, "./common.schema.json");
  return ajv;
}

const comparisonReportValidator = buildAjv().compile<ComparisonReport>(comparisonReportSchema);

export function assertValidComparisonReport(report: ComparisonReport): void {
  if (comparisonReportValidator(report)) {
    return;
  }

  throw new Error(
    `ComparisonReport schema validation failed: ${JSON.stringify(comparisonReportValidator.errors)}`,
  );
}

export function isValidComparisonReport(report: ComparisonReport): boolean {
  return comparisonReportValidator(report) === true;
}
