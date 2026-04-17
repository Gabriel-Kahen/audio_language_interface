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
import type {
  ApplyEditPlanOptions,
  ApplyTransformsResult,
  FfmpegCommand,
  TransformRecordOperation,
} from "./types.js";
import { CONTRACT_SCHEMA_VERSION } from "./types.js";

/**
 * Executes an edit plan step-by-step, rendering one intermediate file per step
 * and returning the final output version, transform record, and FFmpeg command list.
 */
export async function applyEditPlan(options: ApplyEditPlanOptions): Promise<ApplyTransformsResult> {
  if (options.plan.asset_id !== options.version.asset_id) {
    throw new Error("EditPlan asset_id must match the input AudioVersion asset_id.");
  }

  if (options.plan.version_id !== options.version.version_id) {
    throw new Error("EditPlan version_id must match the input AudioVersion version_id.");
  }

  const startedAtDate = options.createdAt ?? new Date();
  const outputVersionId = options.outputVersionId ?? createOutputVersionId();
  const commands: FfmpegCommand[] = [];
  const operations: TransformRecordOperation[] = [];
  const warnings: string[] = [];
  const builtSteps: Array<{
    step: ApplyEditPlanOptions["plan"]["steps"][number];
    built: ReturnType<typeof buildOperation>;
  }> = [];
  let currentAudio = options.version.audio;
  for (const step of options.plan.steps) {
    const built = buildOperation(currentAudio, step.operation, step.parameters, step.target);
    builtSteps.push({ step, built });
    currentAudio = built.nextAudio;
  }
  let currentVersion = options.version;

  for (const [index, { step, built }] of builtSteps.entries()) {
    const resolvedPath = resolveTransformOutputPath({
      workspaceRoot: options.workspaceRoot,
      ...(options.outputDir !== undefined ? { outputDir: options.outputDir } : {}),
      versionId: outputVersionId,
      fileName:
        index === options.plan.steps.length - 1
          ? `${outputVersionId}.wav`
          : `${outputVersionId}.step-${index + 1}.wav`,
    });
    const command = buildFfmpegTransformCommand({
      ...(options.ffmpegPath !== undefined ? { ffmpegPath: options.ffmpegPath } : {}),
      inputPath: path.resolve(options.workspaceRoot, currentVersion.audio.storage_ref),
      outputPath: resolvedPath.absolutePath,
      sampleRateHz: built.nextAudio.sample_rate_hz,
      channels: built.nextAudio.channels,
      filterChain: built.filterChain,
    });
    const execution = await executeFfmpegCommand(command, options.executor);
    warnings.push(...extractTransformWarnings(execution.stderr));
    const outputAudio = built.requiresOutputProbe
      ? await probeOutputAudioMetadata({
          outputPath: resolvedPath.absolutePath,
          fallbackAudio: built.nextAudio,
        })
      : built.nextAudio;
    const effectiveParameters = finalizeOperationParameters(
      step.operation,
      built.effectiveParameters,
      currentVersion.audio,
      outputAudio,
    );

    commands.push(command);
    operations.push(createAppliedOperation(step.operation, effectiveParameters));
    currentVersion = {
      schema_version: CONTRACT_SCHEMA_VERSION,
      version_id:
        index === options.plan.steps.length - 1
          ? outputVersionId
          : `${outputVersionId}_step_${index + 1}`,
      asset_id: options.version.asset_id,
      parent_version_id: currentVersion.version_id,
      lineage: {
        created_at: startedAtDate.toISOString(),
        created_by: "modules/transforms",
        reason: `edit plan step ${step.step_id}`,
        plan_id: options.plan.plan_id,
      },
      audio: {
        ...outputAudio,
        storage_ref: resolvedPath.relativePath,
      },
      state: {
        is_original: false,
        is_preview: options.version.state?.is_preview ?? false,
      },
    };
  }

  const finishedAtDate = new Date();
  const transformRecord = createTransformRecord({
    ...(options.recordId !== undefined ? { recordId: options.recordId } : {}),
    planId: options.plan.plan_id,
    capabilityManifestId: options.plan.capability_manifest_id,
    assetId: options.version.asset_id,
    inputVersionId: options.version.version_id,
    outputVersionId,
    startedAt: startedAtDate.toISOString(),
    finishedAt: finishedAtDate.toISOString(),
    runtimeMs: finishedAtDate.getTime() - startedAtDate.getTime(),
    operations,
    warnings,
  });
  const outputVersion = {
    ...currentVersion,
    version_id: outputVersionId,
    parent_version_id: options.version.version_id,
    lineage: {
      created_at: finishedAtDate.toISOString(),
      created_by: "modules/transforms",
      reason: `applied edit plan ${options.plan.plan_id}`,
      plan_id: options.plan.plan_id,
      transform_record_id: transformRecord.record_id,
    },
  };

  return {
    outputVersion,
    transformRecord,
    commands,
    warnings,
  };
}

function finalizeOperationParameters(
  operation: TransformRecordOperation["operation"],
  parameters: Record<string, unknown>,
  inputAudio: ApplyEditPlanOptions["version"]["audio"],
  outputAudio: ApplyEditPlanOptions["version"]["audio"],
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
