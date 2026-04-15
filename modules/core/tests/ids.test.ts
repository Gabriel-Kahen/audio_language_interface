import { describe, expect, it } from "vitest";

import {
  createAnalysisId,
  createAssetId,
  createComparisonId,
  createPlanId,
  createRenderId,
  createSemanticId,
  createSessionId,
  createToolRequestId,
  createTransformId,
  createVersionId,
  isAnalysisId,
  isAssetId,
  isComparisonId,
  isPlanId,
  isRenderId,
  isSemanticId,
  isSessionId,
  isToolRequestId,
  isTransformId,
  isVersionId,
} from "../src/index.js";

describe("ids", () => {
  it("creates asset ids with the contract prefix", () => {
    const assetId = createAssetId();

    expect(assetId).toMatch(/^asset_[A-Za-z0-9]+$/);
    expect(isAssetId(assetId)).toBe(true);
  });

  it("creates version ids with the contract prefix", () => {
    const versionId = createVersionId();

    expect(versionId).toMatch(/^ver_[A-Za-z0-9]+$/);
    expect(isVersionId(versionId)).toBe(true);
  });

  it("covers the shared prefixed id families used across related artifacts", () => {
    expect(isAnalysisId(createAnalysisId())).toBe(true);
    expect(isSemanticId(createSemanticId())).toBe(true);
    expect(isPlanId(createPlanId())).toBe(true);
    expect(isTransformId(createTransformId())).toBe(true);
    expect(isRenderId(createRenderId())).toBe(true);
    expect(isComparisonId(createComparisonId())).toBe(true);
    expect(isSessionId(createSessionId())).toBe(true);
    expect(isToolRequestId(createToolRequestId())).toBe(true);
  });
});
