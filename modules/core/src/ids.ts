import { randomUUID } from "node:crypto";

export type AssetId = `asset_${string}`;
export type VersionId = `ver_${string}`;
export type AnalysisId = `analysis_${string}`;
export type SemanticId = `semantic_${string}`;
export type InterpretationId = `interpret_${string}`;
export type PlanId = `plan_${string}`;
export type TransformId = `transform_${string}`;
export type RenderId = `render_${string}`;
export type ComparisonId = `compare_${string}`;
export type SessionId = `session_${string}`;
export type ToolRequestId = `toolreq_${string}`;
export type CapabilityManifestId = `capmanifest_${string}`;

const ID_BODY_PATTERN = /^[A-Za-z0-9]+$/;

function createPrefixedId<TPrefix extends string>(prefix: TPrefix): `${TPrefix}_${string}` {
  const randomBody = randomUUID().replaceAll("-", "");

  return `${prefix}_${randomBody}`;
}

function isPrefixedId(prefix: string, value: unknown): value is `${typeof prefix}_${string}` {
  if (typeof value !== "string") {
    return false;
  }

  const expectedPrefix = `${prefix}_`;

  return (
    value.startsWith(expectedPrefix) && ID_BODY_PATTERN.test(value.slice(expectedPrefix.length))
  );
}

/** Returns a new canonical `AudioAsset` identifier. */
export function createAssetId(): AssetId {
  return createPrefixedId("asset") as AssetId;
}

/** Returns a new canonical `AudioVersion` identifier. */
export function createVersionId(): VersionId {
  return createPrefixedId("ver") as VersionId;
}

/** Returns a new canonical `AnalysisReport` identifier. */
export function createAnalysisId(): AnalysisId {
  return createPrefixedId("analysis") as AnalysisId;
}

/** Returns a new canonical `SemanticProfile` identifier. */
export function createSemanticId(): SemanticId {
  return createPrefixedId("semantic") as SemanticId;
}

/** Returns a new canonical `IntentInterpretation` identifier. */
export function createInterpretationId(): InterpretationId {
  return createPrefixedId("interpret") as InterpretationId;
}

/** Returns a new canonical `EditPlan` identifier. */
export function createPlanId(): PlanId {
  return createPrefixedId("plan") as PlanId;
}

/** Returns a new canonical `TransformRecord` identifier. */
export function createTransformId(): TransformId {
  return createPrefixedId("transform") as TransformId;
}

/** Returns a new canonical `RenderArtifact` identifier. */
export function createRenderId(): RenderId {
  return createPrefixedId("render") as RenderId;
}

/** Returns a new canonical `ComparisonReport` identifier. */
export function createComparisonId(): ComparisonId {
  return createPrefixedId("compare") as ComparisonId;
}

/** Returns a new canonical `SessionGraph` identifier. */
export function createSessionId(): SessionId {
  return createPrefixedId("session") as SessionId;
}

/** Returns a new canonical tool request identifier. */
export function createToolRequestId(): ToolRequestId {
  return createPrefixedId("toolreq") as ToolRequestId;
}

export function createCapabilityManifestId(): CapabilityManifestId {
  return createPrefixedId("capmanifest") as CapabilityManifestId;
}

/** Checks whether a value matches the shared `AudioAsset` id contract. */
export function isAssetId(value: unknown): value is AssetId {
  return isPrefixedId("asset", value);
}

/** Checks whether a value matches the shared `AudioVersion` id contract. */
export function isVersionId(value: unknown): value is VersionId {
  return isPrefixedId("ver", value);
}

/** Checks whether a value matches the shared `AnalysisReport` id contract. */
export function isAnalysisId(value: unknown): value is AnalysisId {
  return isPrefixedId("analysis", value);
}

/** Checks whether a value matches the shared `SemanticProfile` id contract. */
export function isSemanticId(value: unknown): value is SemanticId {
  return isPrefixedId("semantic", value);
}

/** Checks whether a value matches the shared `IntentInterpretation` id contract. */
export function isInterpretationId(value: unknown): value is InterpretationId {
  return isPrefixedId("interpret", value);
}

/** Checks whether a value matches the shared `EditPlan` id contract. */
export function isPlanId(value: unknown): value is PlanId {
  return isPrefixedId("plan", value);
}

/** Checks whether a value matches the shared `TransformRecord` id contract. */
export function isTransformId(value: unknown): value is TransformId {
  return isPrefixedId("transform", value);
}

/** Checks whether a value matches the shared `RenderArtifact` id contract. */
export function isRenderId(value: unknown): value is RenderId {
  return isPrefixedId("render", value);
}

/** Checks whether a value matches the shared `ComparisonReport` id contract. */
export function isComparisonId(value: unknown): value is ComparisonId {
  return isPrefixedId("compare", value);
}

/** Checks whether a value matches the shared `SessionGraph` id contract. */
export function isSessionId(value: unknown): value is SessionId {
  return isPrefixedId("session", value);
}

/** Checks whether a value matches the shared tool request id contract. */
export function isToolRequestId(value: unknown): value is ToolRequestId {
  return isPrefixedId("toolreq", value);
}

export function isCapabilityManifestId(value: unknown): value is CapabilityManifestId {
  return isPrefixedId("capmanifest", value);
}
