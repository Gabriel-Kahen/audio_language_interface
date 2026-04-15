import { readFileSync } from "node:fs";
import path from "node:path";

import * as Ajv2020Module from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";
import { describe, expect, it } from "vitest";

type Ajv2020Constructor = typeof import("ajv/dist/2020.js").default;
type AddFormats = typeof import("ajv-formats").default;

const Ajv2020 = Ajv2020Module.default as unknown as Ajv2020Constructor;
const addFormats = addFormatsModule.default as unknown as AddFormats;

const repoRoot = path.resolve(import.meta.dirname, "../..");

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function readSchema(relativePath: string): object {
  return readJson(relativePath) as object;
}

function buildValidator(schemaRelativePath: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(readSchema("contracts/schemas/json/common.schema.json"), "./common.schema.json");
  return ajv.compile(readSchema(schemaRelativePath));
}

describe("phase 1 happy-path contract setup", () => {
  it("keeps the fixture manifest and workflow setup aligned", () => {
    const fixtureManifest = readJson("fixtures/audio/manifest.json") as {
      fixtures: Array<{ fixture_id: string; relative_path: string }>;
    };
    const integrationSetup = readJson("tests/integration/setup/happy-path-workflow.json") as {
      fixture_id: string;
      fixture_manifest_path: string;
      workflow_contract_path: string;
      expected_prompt: string;
    };
    const workflow = readJson(integrationSetup.workflow_contract_path) as {
      fixture_id: string;
      prompt: string;
      contract_paths: {
        tool_requests: string[];
        tool_responses: string[];
        canonical_artifacts: string[];
      };
    };

    expect(integrationSetup.fixture_manifest_path).toBe("fixtures/audio/manifest.json");
    expect(workflow.fixture_id).toBe(integrationSetup.fixture_id);
    expect(workflow.prompt).toBe(integrationSetup.expected_prompt);
    expect(
      fixtureManifest.fixtures.some(
        (fixture) => fixture.fixture_id === integrationSetup.fixture_id,
      ),
    ).toBe(true);

    for (const relativePath of [
      ...workflow.contract_paths.tool_requests,
      ...workflow.contract_paths.tool_responses,
      ...workflow.contract_paths.canonical_artifacts,
    ]) {
      expect(() => readJson(relativePath)).not.toThrow();
    }
  });

  it("validates the happy-path semantic and session artifacts against published schemas", () => {
    const semanticValidator = buildValidator("contracts/schemas/json/semantic-profile.schema.json");
    const sessionValidator = buildValidator("contracts/schemas/json/session-graph.schema.json");

    const semanticProfile = readJson("contracts/examples/happy-path/semantic-profile.json");
    const sessionGraph = readJson("contracts/examples/happy-path/session-graph.json");

    expect(semanticValidator(semanticProfile)).toBe(true);
    expect(sessionValidator(sessionGraph)).toBe(true);
  });

  it("keeps the top-level tool examples coherent across the happy-path workflow", () => {
    const loadResponse = readJson("contracts/examples/load-audio-tool-response.json") as {
      result: {
        asset: { asset_id: string };
        version: { version_id: string; asset_id: string };
      };
    };
    const analyzeResponse = readJson("contracts/examples/analyze-audio-tool-response.json") as {
      result: { report: { report_id: string; version_id: string; asset_id: string } };
    };
    const applyRequest = readJson("contracts/examples/apply-edit-plan-tool-request.json") as {
      arguments: {
        audio_version: { version_id: string; asset_id: string };
        edit_plan: { plan_id: string; version_id: string; asset_id: string };
      };
    };
    const applyResponse = readJson("contracts/examples/apply-edit-plan-tool-response.json") as {
      result: {
        output_version: { version_id: string; asset_id: string; parent_version_id: string };
        transform_record: {
          record_id: string;
          input_version_id: string;
          output_version_id: string;
        };
      };
    };
    const renderRequest = readJson("contracts/examples/render-preview-tool-request.json") as {
      arguments: { audio_version: { version_id: string; asset_id: string } };
    };
    const compareRequest = readJson("contracts/examples/compare-versions-tool-request.json") as {
      arguments: {
        baseline_version: { version_id: string; asset_id: string };
        candidate_version: { version_id: string; asset_id: string };
        baseline_analysis: { report_id: string; version_id: string };
        candidate_analysis: { report_id: string; version_id: string };
        edit_plan: { plan_id: string };
      };
    };
    const semanticProfile = readJson("contracts/examples/happy-path/semantic-profile.json") as {
      analysis_report_id: string;
      version_id: string;
      asset_id: string;
    };
    const sessionGraph = readJson("contracts/examples/happy-path/session-graph.json") as {
      session_id: string;
      active_refs: { asset_id: string; version_id: string };
    };

    expect(loadResponse.result.version.asset_id).toBe(loadResponse.result.asset.asset_id);
    expect(analyzeResponse.result.report.asset_id).toBe(loadResponse.result.asset.asset_id);
    expect(analyzeResponse.result.report.version_id).toBe(loadResponse.result.version.version_id);

    expect(applyRequest.arguments.audio_version.version_id).toBe(
      loadResponse.result.version.version_id,
    );
    expect(applyRequest.arguments.audio_version.asset_id).toBe(loadResponse.result.asset.asset_id);
    expect(applyRequest.arguments.edit_plan.version_id).toBe(
      loadResponse.result.version.version_id,
    );
    expect(applyRequest.arguments.edit_plan.asset_id).toBe(loadResponse.result.asset.asset_id);

    expect(applyResponse.result.output_version.parent_version_id).toBe(
      loadResponse.result.version.version_id,
    );
    expect(applyResponse.result.transform_record.input_version_id).toBe(
      loadResponse.result.version.version_id,
    );
    expect(applyResponse.result.transform_record.output_version_id).toBe(
      applyResponse.result.output_version.version_id,
    );

    expect(renderRequest.arguments.audio_version.version_id).toBe(
      applyResponse.result.output_version.version_id,
    );
    expect(renderRequest.arguments.audio_version.asset_id).toBe(loadResponse.result.asset.asset_id);

    expect(compareRequest.arguments.baseline_version.version_id).toBe(
      loadResponse.result.version.version_id,
    );
    expect(compareRequest.arguments.candidate_version.version_id).toBe(
      applyResponse.result.output_version.version_id,
    );
    expect(compareRequest.arguments.baseline_analysis.report_id).toBe(
      analyzeResponse.result.report.report_id,
    );
    expect(compareRequest.arguments.baseline_analysis.version_id).toBe(
      loadResponse.result.version.version_id,
    );
    expect(compareRequest.arguments.candidate_analysis.version_id).toBe(
      applyResponse.result.output_version.version_id,
    );
    expect(compareRequest.arguments.edit_plan.plan_id).toBe(
      applyRequest.arguments.edit_plan.plan_id,
    );

    expect(semanticProfile.analysis_report_id).toBe(analyzeResponse.result.report.report_id);
    expect(semanticProfile.version_id).toBe(loadResponse.result.version.version_id);
    expect(semanticProfile.asset_id).toBe(loadResponse.result.asset.asset_id);

    expect(sessionGraph.session_id).toBe("session_01HZZ0FIRSTSLICE0000000001");
    expect(sessionGraph.active_refs.asset_id).toBe(loadResponse.result.asset.asset_id);
    expect(sessionGraph.active_refs.version_id).toBe(
      applyResponse.result.output_version.version_id,
    );
  });
});
