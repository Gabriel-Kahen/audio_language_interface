import path from "node:path";

import {
  buildFfmpegTransformCommand,
  executeFfmpegCommand,
  extractTransformWarnings,
} from "./ffmpeg-adapter.js";
import { buildOperation } from "./operation-spec.js";
import { probeOutputAudioMetadata } from "./output-metadata.js";
import { createOutputVersionId, resolveTransformOutputPath } from "./path-policy.js";
import { createAppliedOperation, createTransformRecord } from "./record-builder.js";
import type { ApplyOperationOptions, ApplyTransformsResult, AudioVersion } from "./types.js";
import { CONTRACT_SCHEMA_VERSION } from "./types.js";

/**
 * Applies one explicit transform to an input audio version and materializes a
 * new workspace-relative WAV output plus a matching transform record.
 */
export async function applyOperation(
  options: ApplyOperationOptions,
): Promise<ApplyTransformsResult> {
  const startedAtDate = options.createdAt ?? new Date();
  const outputVersionId = options.outputVersionId ?? createOutputVersionId();
  const outputPath = resolveTransformOutputPath({
    workspaceRoot: options.workspaceRoot,
    ...(options.outputDir !== undefined ? { outputDir: options.outputDir } : {}),
    versionId: outputVersionId,
  });
  const built = buildOperation(
    options.version.audio,
    options.operation,
    options.parameters,
    options.target ?? { scope: "full_file" },
  );
  const effectiveTarget = options.target ?? { scope: "full_file" };
  const inputPath = path.resolve(options.workspaceRoot, options.version.audio.storage_ref);
  const command = buildFfmpegTransformCommand({
    ...(options.ffmpegPath !== undefined ? { ffmpegPath: options.ffmpegPath } : {}),
    inputPath,
    outputPath: outputPath.absolutePath,
    sampleRateHz: built.nextAudio.sample_rate_hz,
    channels: built.nextAudio.channels,
    filterChain: built.filterChain,
  });
  const execution = await executeFfmpegCommand(command, options.executor);
  const warnings = extractTransformWarnings(execution.stderr);
  const outputAudio = built.requiresOutputProbe
    ? await probeOutputAudioMetadata({
        outputPath: outputPath.absolutePath,
        fallbackAudio: built.nextAudio,
      })
    : built.nextAudio;
  const effectiveParameters = finalizeOperationParameters(
    options.operation,
    built.effectiveParameters,
    options.version.audio,
    outputAudio,
  );
  const finishedAtDate = new Date();
  const transformRecord = createTransformRecord({
    ...(options.recordId !== undefined ? { recordId: options.recordId } : {}),
    assetId: options.version.asset_id,
    inputVersionId: options.version.version_id,
    outputVersionId,
    startedAt: startedAtDate.toISOString(),
    finishedAt: finishedAtDate.toISOString(),
    runtimeMs: finishedAtDate.getTime() - startedAtDate.getTime(),
    operations: [createAppliedOperation(options.operation, effectiveTarget, effectiveParameters)],
    warnings,
  });
  const outputVersion = createOutputVersion({
    inputVersion: options.version,
    outputVersionId,
    outputStorageRef: outputPath.relativePath,
    audio: outputAudio,
    createdAt: finishedAtDate.toISOString(),
    transformRecordId: transformRecord.record_id,
  });

  return {
    outputVersion,
    transformRecord,
    commands: [command],
    warnings,
  };
}

function finalizeOperationParameters(
  operation: ApplyOperationOptions["operation"],
  parameters: Record<string, unknown>,
  inputAudio: AudioVersion["audio"],
  outputAudio: AudioVersion["audio"],
): Record<string, unknown> {
  if (operation !== "trim_silence") {
    return parameters;
  }

  return {
    ...parameters,
    result_duration_seconds: outputAudio.duration_seconds,
    trimmed_duration_seconds: Number(
      Math.max(0, inputAudio.duration_seconds - outputAudio.duration_seconds).toFixed(6),
    ),
  };
}

function createOutputVersion(input: {
  inputVersion: AudioVersion;
  outputVersionId: string;
  outputStorageRef: string;
  audio: AudioVersion["audio"];
  createdAt: string;
  transformRecordId: string;
}): AudioVersion {
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    version_id: input.outputVersionId,
    asset_id: input.inputVersion.asset_id,
    parent_version_id: input.inputVersion.version_id,
    lineage: {
      created_at: input.createdAt,
      created_by: "modules/transforms",
      reason: "single explicit transform",
      transform_record_id: input.transformRecordId,
    },
    audio: {
      ...input.audio,
      storage_ref: input.outputStorageRef,
    },
    state: {
      is_original: false,
      is_preview: input.inputVersion.state?.is_preview ?? false,
    },
  };
}
