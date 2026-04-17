import { readFileSync } from "node:fs";

import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";

import type { RuntimeCapabilityManifest } from "./types.js";

function loadJson(relativePath: string): object {
  const fileUrl = new URL(relativePath, import.meta.url);
  return JSON.parse(readFileSync(fileUrl, "utf8")) as object;
}

const commonSchema = loadJson("../../../contracts/schemas/json/common.schema.json");
const runtimeCapabilityManifestSchema = loadJson(
  "../../../contracts/schemas/json/runtime-capability-manifest.schema.json",
);

function buildAjv() {
  const Ajv2020 = Ajv2020Import as unknown as new (options: {
    allErrors: boolean;
    strict: boolean;
  }) => {
    addSchema: (schema: object, key?: string) => void;
    compile: <T>(schema: object) => {
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

const runtimeCapabilityManifestValidator = buildAjv().compile<RuntimeCapabilityManifest>(
  runtimeCapabilityManifestSchema,
);

export function assertValidRuntimeCapabilityManifest(manifest: RuntimeCapabilityManifest): void {
  if (runtimeCapabilityManifestValidator(manifest)) {
    return;
  }

  throw new Error(
    `RuntimeCapabilityManifest schema validation failed: ${JSON.stringify(
      runtimeCapabilityManifestValidator.errors,
    )}`,
  );
}

export function isValidRuntimeCapabilityManifest(manifest: RuntimeCapabilityManifest): boolean {
  return runtimeCapabilityManifestValidator(manifest) === true;
}
