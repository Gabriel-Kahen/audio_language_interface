import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const schemaDir = path.join(repoRoot, "contracts", "schemas", "json");
const examplesDir = path.join(repoRoot, "contracts", "examples");

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const schemaFiles = (await readdir(schemaDir))
  .filter((fileName) => fileName.endsWith(".schema.json") && fileName !== "common.schema.json")
  .sort();

const commonSchema = await readJson(path.join(schemaDir, "common.schema.json"));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(commonSchema);

const failures = [];

for (const schemaFile of schemaFiles) {
  const schemaPath = path.join(schemaDir, schemaFile);
  const exampleFile = schemaFile.replace(/\.schema\.json$/, ".json");
  const examplePath = path.join(examplesDir, exampleFile);

  const schema = await readJson(schemaPath);
  const example = await readJson(examplePath);
  const validate = ajv.compile(schema);

  if (!validate(example)) {
    const details = (validate.errors ?? [])
      .map((error) => `${error.instancePath || "/"} ${error.message ?? "validation error"}`)
      .join("; ");
    failures.push(`${exampleFile} against ${schemaFile}: ${details}`);
  }
}

if (failures.length > 0) {
  console.error("Schema validation failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Validated ${schemaFiles.length} schema/example pairs successfully.`);
