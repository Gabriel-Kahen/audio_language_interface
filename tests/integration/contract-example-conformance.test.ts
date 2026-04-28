import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const schemaDir = path.join(repoRoot, "contracts", "schemas", "json");
const examplesDir = path.join(repoRoot, "contracts", "examples");

type SchemaEntry = {
  fileName: string;
  schemaName: string;
  schema: object;
};

type ExampleEntry = {
  relativePath: string;
  schemaName: string;
  payload: unknown;
};

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function listJsonFiles(rootDir: string, currentDir = rootDir): string[] {
  return readdirSync(currentDir, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      return listJsonFiles(rootDir, absolutePath);
    }

    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      return [];
    }

    return [path.relative(rootDir, absolutePath)];
  });
}

function schemaNameForFile(fileName: string): string {
  return fileName.replace(/\.schema\.json$/, "");
}

function exampleSchemaNameForPath(relativePath: string): string {
  if (relativePath === "happy-path/candidate-analysis-report.json") {
    return "analysis-report";
  }

  return path.basename(relativePath, ".json");
}

function buildAjv(schemaEntries: SchemaEntry[]) {
  const Ajv2020 = Ajv2020Import as unknown as new (options: {
    allErrors: boolean;
    strict: boolean;
  }) => {
    addSchema: (schema: unknown, key?: string) => void;
    compile: (schema: unknown) => {
      (value: unknown): boolean;
      errors?: unknown;
    };
  };
  const addFormats = addFormatsImport as unknown as (ajv: object) => void;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(readJson(path.join(schemaDir, "common.schema.json")), "./common.schema.json");

  for (const { fileName, schema } of schemaEntries) {
    ajv.addSchema(schema, fileName);
  }

  return ajv;
}

function formatAjvErrors(errors: unknown): string {
  return JSON.stringify(errors, null, 2);
}

const schemaEntries = readdirSync(schemaDir)
  .filter((fileName) => fileName.endsWith(".schema.json") && fileName !== "common.schema.json")
  .sort()
  .map((fileName): SchemaEntry => {
    const schemaName = schemaNameForFile(fileName);

    return {
      fileName,
      schemaName,
      schema: readJson(path.join(schemaDir, fileName)) as object,
    };
  });

const schemasByName = new Map(schemaEntries.map((entry) => [entry.schemaName, entry]));

const allExamples = listJsonFiles(examplesDir)
  .sort()
  .map((relativePath): ExampleEntry => {
    const schemaName = exampleSchemaNameForPath(relativePath);

    return {
      relativePath,
      schemaName,
      payload: readJson(path.join(examplesDir, relativePath)),
    };
  });

const examplesWithMatchingSchema = allExamples.filter((example) =>
  schemasByName.has(example.schemaName),
);
const examplesWithoutMatchingSchema = allExamples
  .filter((example) => !schemasByName.has(example.schemaName))
  .map((example) => example.relativePath);

describe("contract example conformance", () => {
  it.each(
    examplesWithMatchingSchema,
  )("validates contracts/examples/$relativePath against its matching JSON schema", ({
    relativePath,
    schemaName,
    payload,
  }) => {
    const schemaEntry = schemasByName.get(schemaName);
    expect(schemaEntry, `missing schema for ${relativePath}`).toBeDefined();

    const ajv = buildAjv(schemaEntries);
    const validate = ajv.compile(schemaEntry?.schema ?? {});

    expect(validate(payload), formatAjvErrors(validate.errors)).toBe(true);
  });

  it("documents example payloads that do not have a clear same-name schema", () => {
    expect(examplesWithoutMatchingSchema).toEqual(["happy-path/workflow.json"]);
  });
});

describe("representative malformed core contract payloads", () => {
  const ajv = buildAjv(schemaEntries);

  it.each([
    {
      schemaName: "audio-asset",
      examplePath: "audio-asset.json",
      mutate: (payload: Record<string, unknown>) => {
        delete payload.media;
      },
      reason: "AudioAsset requires explicit media metadata",
    },
    {
      schemaName: "audio-version",
      examplePath: "audio-version.json",
      mutate: (payload: Record<string, unknown>) => {
        const audio = payload.audio as Record<string, unknown>;
        audio.channels = 0;
      },
      reason: "AudioVersion channel counts must be positive",
    },
    {
      schemaName: "edit-plan",
      examplePath: "edit-plan.json",
      mutate: (payload: Record<string, unknown>) => {
        const [firstStep] = payload.steps as Array<Record<string, unknown>>;
        if (firstStep === undefined) {
          throw new Error("Expected edit-plan example to contain at least one step.");
        }
        firstStep.operation = "unsupported_magic_filter";
      },
      reason: "EditPlan steps must use the published operation vocabulary",
    },
  ])("rejects malformed $schemaName payloads: $reason", ({ schemaName, examplePath, mutate }) => {
    const schemaEntry = schemasByName.get(schemaName);
    expect(schemaEntry, `missing schema for ${schemaName}`).toBeDefined();

    const payload = structuredClone(readJson(path.join(examplesDir, examplePath))) as Record<
      string,
      unknown
    >;
    mutate(payload);

    const validate = ajv.compile(schemaEntry?.schema ?? {});
    expect(validate(payload)).toBe(false);
    const errors = validate.errors as unknown[] | undefined;
    expect(errors?.length).toBeGreaterThan(0);
  });
});
