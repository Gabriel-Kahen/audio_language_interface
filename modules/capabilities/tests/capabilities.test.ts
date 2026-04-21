import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assertValidRuntimeCapabilityManifest,
  defaultRuntimeCapabilityManifest,
  getRuntimeOperationCapability,
  isValidRuntimeCapabilityManifest,
  listRuntimeOperationCapabilities,
  plannerSupportedRuntimeOperations,
  type RuntimeCapabilityManifest,
} from "../src/index.js";

const runtimeCapabilityManifestExamplePath = new URL(
  "../../../contracts/examples/runtime-capability-manifest.json",
  import.meta.url,
);

function cloneManifest(): RuntimeCapabilityManifest {
  return JSON.parse(JSON.stringify(defaultRuntimeCapabilityManifest)) as RuntimeCapabilityManifest;
}

describe("capabilities module", () => {
  it("keeps the canonical runtime capability manifest example schema-valid", () => {
    const examplePayload = JSON.parse(
      readFileSync(runtimeCapabilityManifestExamplePath, "utf8"),
    ) as RuntimeCapabilityManifest;

    expect(isValidRuntimeCapabilityManifest(examplePayload)).toBe(true);
    expect(() => assertValidRuntimeCapabilityManifest(examplePayload)).not.toThrow();
  });

  it("keeps the published default manifest schema-valid", () => {
    expect(isValidRuntimeCapabilityManifest(defaultRuntimeCapabilityManifest)).toBe(true);
    expect(() =>
      assertValidRuntimeCapabilityManifest(defaultRuntimeCapabilityManifest),
    ).not.toThrow();
  });

  it("returns a defensive array copy when listing runtime capabilities", () => {
    const initial = listRuntimeOperationCapabilities();
    const second = listRuntimeOperationCapabilities();

    expect(second).toEqual(initial);
    expect(second).not.toBe(initial);

    initial.pop();
    expect(listRuntimeOperationCapabilities()).toHaveLength(second.length);
  });

  it("supports intent-support filtering across the full capability inventory", () => {
    const plannerSupported = listRuntimeOperationCapabilities({
      intentSupport: "planner_supported",
    });
    const runtimeOnly = listRuntimeOperationCapabilities({
      intentSupport: "runtime_only",
    });

    expect(plannerSupported).not.toHaveLength(0);
    expect(runtimeOnly).not.toHaveLength(0);
    expect(
      plannerSupported.every((operation) => operation.intent_support === "planner_supported"),
    ).toBe(true);
    expect(runtimeOnly.every((operation) => operation.intent_support === "runtime_only")).toBe(
      true,
    );
    expect(plannerSupported.length + runtimeOnly.length).toBe(
      defaultRuntimeCapabilityManifest.operations.length,
    );
  });

  it("exposes stable capability lookup by operation name", () => {
    const gain = getRuntimeOperationCapability("gain");
    const expectedGain = defaultRuntimeCapabilityManifest.operations.find(
      (operation) => operation.name === "gain",
    );

    expect(expectedGain).toBeDefined();
    expect(gain).toBe(expectedGain);
    expect(gain).toBeDefined();
    expect(gain.parameters).toBeDefined();
    expect(gain.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "gain_db",
          value_type: "number",
          required: true,
        }),
      ]),
    );
  });

  it("throws for unknown operation names at runtime", () => {
    expect(() => getRuntimeOperationCapability("unknown_operation" as never)).toThrow(
      "No runtime capability metadata is published for 'unknown_operation'.",
    );
  });

  it("publishes planner-supported operation names in sync with filtered capabilities", () => {
    const filteredPlannerNames = listRuntimeOperationCapabilities({
      intentSupport: "planner_supported",
    }).map((operation) => operation.name);

    expect(plannerSupportedRuntimeOperations).toEqual(filteredPlannerNames);
  });

  it("returns a defined capability for every published operation name", () => {
    for (const operation of listRuntimeOperationCapabilities()) {
      const resolved = getRuntimeOperationCapability(operation.name);
      expect(resolved).toBeDefined();
      expect(resolved.name).toBe(operation.name);
    }
  });

  it("publishes the first region-targeting cohort explicitly in the manifest", () => {
    expect(getRuntimeOperationCapability("gain").supported_target_scopes).toEqual([
      "full_file",
      "time_range",
    ]);
    expect(getRuntimeOperationCapability("normalize").supported_target_scopes).toEqual([
      "full_file",
      "time_range",
    ]);
    expect(getRuntimeOperationCapability("low_shelf").supported_target_scopes).toEqual([
      "full_file",
      "time_range",
    ]);
    expect(getRuntimeOperationCapability("compressor").supported_target_scopes).toEqual([
      "full_file",
      "time_range",
    ]);
    expect(getRuntimeOperationCapability("stereo_width").supported_target_scopes).toEqual([
      "full_file",
      "time_range",
    ]);
    expect(getRuntimeOperationCapability("reverb").supported_target_scopes).toEqual(["full_file"]);
    expect(getRuntimeOperationCapability("channel_remap").supported_target_scopes).toEqual([
      "full_file",
    ]);
    expect(getRuntimeOperationCapability("de_esser").supported_target_scopes).toEqual([
      "full_file",
      "time_range",
    ]);
    expect(getRuntimeOperationCapability("declick").supported_target_scopes).toEqual([
      "full_file",
      "time_range",
    ]);
    expect(getRuntimeOperationCapability("dehum").supported_target_scopes).toEqual([
      "full_file",
      "time_range",
    ]);
  });

  it("marks the Layer 2 planner wave operations as planner-supported", () => {
    expect(getRuntimeOperationCapability("normalize").intent_support).toBe("planner_supported");
    expect(getRuntimeOperationCapability("trim_silence").intent_support).toBe("planner_supported");
    expect(getRuntimeOperationCapability("pitch_shift").intent_support).toBe("planner_supported");
    expect(getRuntimeOperationCapability("time_stretch").intent_support).toBe("planner_supported");
    expect(getRuntimeOperationCapability("high_shelf").intent_support).toBe("planner_supported");
    expect(getRuntimeOperationCapability("low_shelf").intent_support).toBe("planner_supported");
    expect(getRuntimeOperationCapability("notch_filter").intent_support).toBe("planner_supported");
    expect(getRuntimeOperationCapability("tilt_eq").intent_support).toBe("planner_supported");
    expect(getRuntimeOperationCapability("de_esser").intent_support).toBe("planner_supported");
    expect(getRuntimeOperationCapability("declick").intent_support).toBe("planner_supported");
    expect(getRuntimeOperationCapability("dehum").intent_support).toBe("planner_supported");
  });

  it("keeps operation names unique and taxonomy-aligned", () => {
    const operations = defaultRuntimeCapabilityManifest.operations;
    const operationNames = operations.map((operation) => operation.name);

    expect(new Set(operationNames).size).toBe(operationNames.length);
    expect(operations).not.toHaveLength(0);
    expect(operations.every((operation) => operation.summary.length > 0)).toBe(true);
    expect(operations.every((operation) => operation.supported_target_scopes.length > 0)).toBe(
      true,
    );
    expect(operationNames).toEqual(
      expect.arrayContaining([
        "gain",
        "trim",
        "fade",
        "parametric_eq",
        "high_shelf",
        "low_shelf",
        "notch_filter",
        "tilt_eq",
        "compressor",
        "limiter",
        "transient_shaper",
        "clipper",
        "gate",
        "pan",
        "channel_remap",
        "mid_side_eq",
        "stereo_width",
        "denoise",
        "de_esser",
        "declick",
        "dehum",
      ]),
    );
  });

  it("rejects manifests with unsupported operation names", () => {
    const invalidManifest = cloneManifest();
    const firstOperation = invalidManifest.operations[0];
    expect(firstOperation).toBeDefined();
    (firstOperation as { name: string }).name = "unsupported_operation";

    expect(isValidRuntimeCapabilityManifest(invalidManifest)).toBe(false);
    expect(() => assertValidRuntimeCapabilityManifest(invalidManifest)).toThrow(
      /RuntimeCapabilityManifest schema validation failed/,
    );
  });

  it("rejects enum parameters without enum_values", () => {
    const invalidManifest = cloneManifest();
    const normalizeOperationIndex = invalidManifest.operations.findIndex(
      (operation) => operation.name === "normalize",
    );

    expect(normalizeOperationIndex).toBeGreaterThanOrEqual(0);
    const invalidOperation = invalidManifest.operations[
      normalizeOperationIndex
    ] as unknown as Record<string, unknown>;
    invalidOperation.parameters = [
      {
        name: "mode",
        value_type: "enum",
        required: true,
        description: "Normalization mode.",
        default_value: "peak",
        example_value: "peak",
      },
    ];

    expect(isValidRuntimeCapabilityManifest(invalidManifest)).toBe(false);
    expect(() => assertValidRuntimeCapabilityManifest(invalidManifest)).toThrow(
      /RuntimeCapabilityManifest schema validation failed/,
    );
  });
});
