import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import type { AnalysisReport, TransientMap } from "../types.js";

const require = createRequire(import.meta.url);
const { default: Ajv2020 } = require("ajv/dist/2020.js") as {
  default: typeof import("ajv/dist/2020.js").default;
};
const { default: addFormats } = require("ajv-formats") as {
  default: typeof import("ajv-formats").default;
};

function loadJson(relativePath: string): object {
  const fileUrl = new URL(relativePath, import.meta.url);
  return JSON.parse(readFileSync(fileUrl, "utf8")) as object;
}

const commonSchema = loadJson("../../../../contracts/schemas/json/common.schema.json");
const analysisReportSchema = loadJson(
  "../../../../contracts/schemas/json/analysis-report.schema.json",
);
const transientMapSchema = loadJson("../../../../contracts/schemas/json/transient-map.schema.json");

function buildAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(commonSchema, "./common.schema.json");
  return ajv;
}

const analysisReportValidator = buildAjv().compile<AnalysisReport>(analysisReportSchema);
const transientMapValidator = buildAjv().compile<TransientMap>(transientMapSchema);

export function assertValidAnalysisReport(report: AnalysisReport): void {
  if (analysisReportValidator(report)) {
    return;
  }

  throw new Error(
    `AnalysisReport schema validation failed: ${JSON.stringify(analysisReportValidator.errors)}`,
  );
}

export function isValidAnalysisReport(report: AnalysisReport): boolean {
  return analysisReportValidator(report) === true;
}

export function assertValidTransientMap(transientMap: TransientMap): void {
  if (transientMapValidator(transientMap)) {
    return;
  }

  throw new Error(
    `TransientMap schema validation failed: ${JSON.stringify(transientMapValidator.errors)}`,
  );
}

export function isValidTransientMap(transientMap: TransientMap): boolean {
  return transientMapValidator(transientMap) === true;
}
