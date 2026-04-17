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

    expect(gain).toBe(
      defaultRuntimeCapabilityManifest.operations.find((operation) => operation.name === "gain"),
    );
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

  it("keeps operation names unique and taxonomy-aligned", () => {
    const operationNames = defaultRuntimeCapabilityManifest.operations.map(
      (operation) => operation.name,
    );

    expect(new Set(operationNames).size).toBe(operationNames.length);
    expect(operationNames.sort()).toEqual(
      [
        "channel_swap",
        "compressor",
        "denoise",
        "fade",
        "gain",
        "high_pass_filter",
        "limiter",
        "low_pass_filter",
        "mono_sum",
        "normalize",
        "parametric_eq",
        "pitch_shift",
        "reverse",
        "stereo_balance_correction",
        "stereo_width",
        "time_stretch",
        "trim",
        "trim_silence",
      ].sort(),
    );
  });

  it("rejects manifests with unsupported operation names", () => {
    const invalidManifest = cloneManifest();
    const firstOperation = invalidManifest.operations[0];
    expect(firstOperation).toBeDefined();
    if (!firstOperation) {
      throw new Error("Expected at least one operation.");
    }

    (firstOperation as unknown as Record<string, unknown>).name = "unsupported_operation";

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
    if (normalizeOperationIndex < 0) {
      throw new Error("Expected normalize operation to exist.");
    }

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
