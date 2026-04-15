import { createTransformRecordId } from "./path-policy.js";
import type { OperationName, TransformRecord, TransformRecordOperation } from "./types.js";
import { CONTRACT_SCHEMA_VERSION } from "./types.js";

/** Creates a transform-record operation entry for a successfully applied step. */
export function createAppliedOperation(
  operation: OperationName,
  parameters: Record<string, unknown>,
): TransformRecordOperation {
  return {
    operation,
    parameters,
    status: "applied",
  };
}

/** Creates a contract-aligned transform record payload. */
export function createTransformRecord(input: {
  recordId?: string;
  planId?: string;
  assetId: string;
  inputVersionId: string;
  outputVersionId: string;
  startedAt: string;
  finishedAt: string;
  runtimeMs: number;
  operations: TransformRecordOperation[];
  warnings: string[];
}): TransformRecord {
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    record_id: input.recordId ?? createTransformRecordId(),
    ...(input.planId ? { plan_id: input.planId } : {}),
    asset_id: input.assetId,
    input_version_id: input.inputVersionId,
    output_version_id: input.outputVersionId,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    runtime_ms: input.runtimeMs,
    operations: input.operations,
    warnings: input.warnings,
  };
}
