import { readFileSync } from "node:fs";

import type { AnalysisReport } from "@audio-language-interface/analysis";
import * as Ajv2020Module from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";

import type { SemanticProfile } from "../types.js";

type Ajv2020Constructor = typeof import("ajv/dist/2020.js").default;
type AddFormats = typeof import("ajv-formats").default;

const Ajv2020 = Ajv2020Module.default as unknown as Ajv2020Constructor;
const addFormats = addFormatsModule.default as unknown as AddFormats;

function loadJson(relativePath: string): object {
  const fileUrl = new URL(relativePath, import.meta.url);
  return JSON.parse(readFileSync(fileUrl, "utf8")) as object;
}

const commonSchema = loadJson("../../../../contracts/schemas/json/common.schema.json");
const analysisReportSchema = loadJson(
  "../../../../contracts/schemas/json/analysis-report.schema.json",
);
const semanticProfileSchema = loadJson(
  "../../../../contracts/schemas/json/semantic-profile.schema.json",
);

function buildAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(commonSchema, "./common.schema.json");
  return ajv;
}

const analysisReportValidator = buildAjv().compile<AnalysisReport>(analysisReportSchema);
const semanticProfileValidator = buildAjv().compile<SemanticProfile>(semanticProfileSchema);

export function assertValidAnalysisReport(report: AnalysisReport): void {
  if (analysisReportValidator(report)) {
    return;
  }

  throw new Error(
    `AnalysisReport schema validation failed: ${JSON.stringify(analysisReportValidator.errors)}`,
  );
}

export function assertValidSemanticProfile(profile: SemanticProfile): void {
  if (semanticProfileValidator(profile)) {
    return;
  }

  throw new Error(
    `SemanticProfile schema validation failed: ${JSON.stringify(semanticProfileValidator.errors)}`,
  );
}

export function isValidSemanticProfile(profile: SemanticProfile): boolean {
  return semanticProfileValidator(profile) === true;
}
