import { createHash } from "node:crypto";
import path from "node:path";

import {
  buildFfmpegTransformCommand,
  executeFfmpegCommand,
  extractTransformWarnings,
} from "./ffmpeg-adapter.js";
import { buildOperation } from "./operation-spec.js";
import {
  createOutputVersionId,
  createTransformRecordId,
  resolveTransformOutputPath,
} from "./path-policy.js";
import type {
  AudioVersion,
  DeriveSliceMapFromTransientsOptions,
  ExtractSliceOptions,
  ExtractSlicesOptions,
  SliceBoundary,
  SliceDefinition,
  SliceExtractionResult,
  SliceExtractionResultItem,
  SliceMap,
  SliceTransformRecord,
  SliceTransformRecordOperation,
  TransientMap,
} from "./types.js";
import { CONTRACT_SCHEMA_VERSION } from "./types.js";

const SLICE_OPERATION_NAME = "slice_extract" as const;
const SLICE_MAP_SLICER_NAME = "transient-slice-builder";
const SLICE_MAP_SLICER_VERSION = "0.1.0";

/**
 * Convert a transient map into explicit, deterministic slice boundaries.
 */
export function deriveSliceMapFromTransients(
  options: DeriveSliceMapFromTransientsOptions,
): SliceMap {
  const preRollSeconds = options.preRollSeconds ?? 0;
  const postRollSeconds = options.postRollSeconds ?? 0;
  const minimumSliceDurationSeconds = options.minimumSliceDurationSeconds ?? 0.01;
  const transients = [...options.transientMap.transients].sort(
    (left, right) => left.time_seconds - right.time_seconds,
  );

  if (options.transientMap.asset_id !== options.version.asset_id) {
    throw new Error("Transient map asset_id must match the input audio version asset_id.");
  }

  if (options.transientMap.version_id !== options.version.version_id) {
    throw new Error("Transient map version_id must match the input audio version version_id.");
  }

  const slices: SliceDefinition[] = [];

  for (const [index, transient] of transients.entries()) {
    const startSeconds = roundToSixDecimals(Math.max(0, transient.time_seconds - preRollSeconds));
    const nextTransientTime =
      transients[index + 1]?.time_seconds ?? options.version.audio.duration_seconds;
    const rawEndSeconds = Math.min(
      options.version.audio.duration_seconds,
      nextTransientTime + postRollSeconds,
    );
    const endSeconds = roundToSixDecimals(rawEndSeconds);

    if (endSeconds - startSeconds < minimumSliceDurationSeconds) {
      continue;
    }

    slices.push({
      slice_id: createDerivedSliceId(index),
      start_seconds: startSeconds,
      end_seconds: endSeconds,
      peak_time_seconds: roundToSixDecimals(transient.time_seconds),
      ...(transient.confidence === undefined ? {} : { confidence: transient.confidence }),
    });
  }

  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    slice_map_id: createSliceMapId(options.transientMap, preRollSeconds, postRollSeconds),
    asset_id: options.version.asset_id,
    version_id: options.version.version_id,
    generated_at: options.generatedAt ?? options.transientMap.generated_at,
    source_transient_map_id: options.transientMap.transient_map_id,
    slicer: {
      name: SLICE_MAP_SLICER_NAME,
      version: SLICE_MAP_SLICER_VERSION,
    },
    slices,
  };
}

/**
 * Extracts a single explicit slice from an input audio version.
 */
export async function extractSlice(
  options: ExtractSliceOptions,
): Promise<SliceExtractionResultItem> {
  const result = await extractSlices({
    workspaceRoot: options.workspaceRoot,
    version: options.version,
    slices: [options.slice],
    ...(options.outputDir !== undefined ? { outputDir: options.outputDir } : {}),
    ...(options.outputVersionId !== undefined
      ? { outputVersionIds: [options.outputVersionId] }
      : {}),
    ...(options.recordId !== undefined ? { recordIds: [options.recordId] } : {}),
    ...(options.createdAt !== undefined ? { createdAt: options.createdAt } : {}),
    ...(options.ffmpegPath !== undefined ? { ffmpegPath: options.ffmpegPath } : {}),
    ...(options.executor !== undefined ? { executor: options.executor } : {}),
  });

  const output = result.outputs[0];

  if (output === undefined) {
    throw new Error("extractSlice did not produce an output slice.");
  }

  return output;
}

/**
 * Extracts one or many slices from an input audio version using explicit
 * time boundaries or a slice-map-like input shape.
 */
export async function extractSlices(options: ExtractSlicesOptions): Promise<SliceExtractionResult> {
  const slices = normalizeSliceDefinitions(options);
  const outputVersionIds = normalizeProvidedIds(
    options.outputVersionIds,
    slices.length,
    "outputVersionIds",
  );
  const recordIds = normalizeProvidedIds(options.recordIds, slices.length, "recordIds");
  const inputPath = path.resolve(options.workspaceRoot, options.version.audio.storage_ref);
  const outputs: SliceExtractionResultItem[] = [];

  for (const [index, slice] of slices.entries()) {
    const startedAtDate = options.createdAt ?? new Date();
    const built = buildOperation(
      options.version.audio,
      "trim",
      {
        start_seconds: slice.start_seconds,
        end_seconds: slice.end_seconds,
      },
      {
        scope: "time_range",
        start_seconds: slice.start_seconds,
        end_seconds: slice.end_seconds,
      },
    );
    const outputVersionId = outputVersionIds[index] ?? createOutputVersionId();
    const outputPath = resolveTransformOutputPath({
      workspaceRoot: options.workspaceRoot,
      ...(options.outputDir !== undefined ? { outputDir: options.outputDir } : {}),
      versionId: outputVersionId,
    });
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
    const finishedAtDate = new Date();
    const record = createSliceTransformRecord({
      ...(recordIds[index] !== undefined ? { recordId: recordIds[index] } : {}),
      assetId: options.version.asset_id,
      inputVersionId: options.version.version_id,
      outputVersionId,
      sliceId: slice.slice_id,
      sliceIndex: index,
      sourceRange: {
        start_seconds: built.effectiveParameters.start_seconds as number,
        end_seconds: built.effectiveParameters.end_seconds as number,
        duration_seconds: built.effectiveParameters.duration_seconds as number,
      },
      startedAt: startedAtDate.toISOString(),
      finishedAt: finishedAtDate.toISOString(),
      runtimeMs: finishedAtDate.getTime() - startedAtDate.getTime(),
      warnings,
    });

    outputs.push({
      slice_id: slice.slice_id,
      slice_index: index,
      source_range: {
        start_seconds: built.effectiveParameters.start_seconds as number,
        end_seconds: built.effectiveParameters.end_seconds as number,
        duration_seconds: built.effectiveParameters.duration_seconds as number,
      },
      outputVersion: createSliceOutputVersion({
        inputVersion: options.version,
        outputVersionId,
        outputStorageRef: outputPath.relativePath,
        audio: built.nextAudio,
        createdAt: finishedAtDate.toISOString(),
        transformRecordId: record.record_id,
        sliceId: slice.slice_id,
        sliceIndex: index,
        sourceRange: {
          start_seconds: built.effectiveParameters.start_seconds as number,
          end_seconds: built.effectiveParameters.end_seconds as number,
          duration_seconds: built.effectiveParameters.duration_seconds as number,
        },
      }),
      transformRecord: record,
      commands: [command],
      warnings,
    });
  }

  return { outputs };
}

function normalizeSliceDefinitions(options: ExtractSlicesOptions): SliceDefinition[] {
  const hasSlices = options.slices !== undefined;
  const hasSliceMap = options.sliceMap !== undefined;

  if (hasSlices === hasSliceMap) {
    throw new Error("extractSlices requires exactly one of slices or sliceMap.");
  }

  if (hasSliceMap) {
    assertSliceMapMatchesVersion(options.sliceMap, options.version);
  }

  const slices = hasSlices
    ? (options.slices ?? [])
    : normalizeSliceMap(options.sliceMap as SliceMap);

  if (slices.length === 0) {
    throw new Error("extractSlices requires at least one slice boundary.");
  }

  const seenSliceIds = new Set<string>();

  return slices.map((slice, index) => {
    const sliceId = normalizeSliceId(slice.slice_id, index);

    if (seenSliceIds.has(sliceId)) {
      throw new Error(`Duplicate slice_id detected: ${sliceId}`);
    }

    seenSliceIds.add(sliceId);

    return {
      slice_id: sliceId,
      ...normalizeBoundary(slice, options.version.audio.duration_seconds, sliceId, index),
    };
  });
}

function assertSliceMapMatchesVersion(sliceMap: SliceMap | undefined, version: AudioVersion): void {
  if (sliceMap === undefined) {
    return;
  }

  if (sliceMap.asset_id !== version.asset_id) {
    throw new Error("Slice map asset_id must match the input audio version asset_id.");
  }

  if (sliceMap.version_id !== version.version_id) {
    throw new Error("Slice map version_id must match the input audio version version_id.");
  }
}

function normalizeSliceMap(sliceMap: SliceMap): SliceDefinition[] {
  return sliceMap.slices.map((slice, index) => ({
    slice_id: normalizeSliceId(slice.slice_id, index),
    start_seconds: slice.start_seconds,
    end_seconds: slice.end_seconds,
    ...(slice.peak_time_seconds === undefined
      ? {}
      : { peak_time_seconds: slice.peak_time_seconds }),
    ...(slice.label === undefined ? {} : { label: slice.label }),
    ...(slice.confidence === undefined ? {} : { confidence: slice.confidence }),
  }));
}

function normalizeBoundary(
  slice: SliceBoundary,
  durationSeconds: number,
  sliceId: string,
  index: number,
): SliceBoundary & { duration_seconds: number } {
  const startSeconds = readFiniteNumber(slice.start_seconds, `slice[${index}].start_seconds`);
  const endSeconds = readFiniteNumber(slice.end_seconds, `slice[${index}].end_seconds`);

  if (startSeconds < 0 || endSeconds < 0) {
    throw new Error(`Slice ${sliceId} start and end seconds must be non-negative.`);
  }

  const normalizedStart = roundToSixDecimals(startSeconds);
  const normalizedEnd = roundToSixDecimals(endSeconds);

  if (normalizedEnd <= normalizedStart) {
    throw new Error(`Slice ${sliceId} end_seconds must be greater than start_seconds.`);
  }

  if (normalizedStart >= durationSeconds) {
    throw new Error(`Slice ${sliceId} start_seconds must be inside the source duration.`);
  }

  if (normalizedEnd > durationSeconds) {
    throw new Error(`Slice ${sliceId} end_seconds must not exceed the source duration.`);
  }

  const duration = roundToSixDecimals(normalizedEnd - normalizedStart);

  if (duration <= 0) {
    throw new Error(`Slice ${sliceId} duration must be greater than 0.`);
  }

  return {
    start_seconds: normalizedStart,
    end_seconds: normalizedEnd,
    duration_seconds: duration,
  };
}

function createSliceTransformRecord(input: {
  recordId?: string;
  assetId: string;
  inputVersionId: string;
  outputVersionId: string;
  sliceId: string;
  sliceIndex: number;
  sourceRange: SliceBoundary & { duration_seconds: number };
  startedAt: string;
  finishedAt: string;
  runtimeMs: number;
  warnings: string[];
}): SliceTransformRecord {
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    record_id: input.recordId ?? createTransformRecordId(),
    asset_id: input.assetId,
    input_version_id: input.inputVersionId,
    output_version_id: input.outputVersionId,
    slice_id: input.sliceId,
    slice_index: input.sliceIndex,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    runtime_ms: input.runtimeMs,
    ...(input.warnings.length === 0 ? {} : { warnings: input.warnings }),
    operations: [
      createSliceTransformRecordOperation(input.sliceId, input.sliceIndex, input.sourceRange),
    ],
  };
}

function createSliceTransformRecordOperation(
  sliceId: string,
  sliceIndex: number,
  sourceRange: SliceBoundary & { duration_seconds: number },
): SliceTransformRecordOperation {
  return {
    operation: SLICE_OPERATION_NAME,
    parameters: {
      slice_id: sliceId,
      slice_index: sliceIndex,
      start_seconds: sourceRange.start_seconds,
      end_seconds: sourceRange.end_seconds,
      duration_seconds: sourceRange.duration_seconds,
    },
    status: "applied",
  };
}

function createSliceOutputVersion(input: {
  inputVersion: AudioVersion;
  outputVersionId: string;
  outputStorageRef: string;
  audio: AudioVersion["audio"];
  createdAt: string;
  transformRecordId: string;
  sliceId: string;
  sliceIndex: number;
  sourceRange: SliceBoundary & { duration_seconds: number };
}): AudioVersion {
  return {
    schema_version: CONTRACT_SCHEMA_VERSION,
    version_id: input.outputVersionId,
    asset_id: input.inputVersion.asset_id,
    parent_version_id: input.inputVersion.version_id,
    lineage: {
      created_at: input.createdAt,
      created_by: "modules/transforms",
      reason: `slice extraction #${input.sliceIndex + 1} (${input.sliceId}) [${formatNumber(input.sourceRange.start_seconds)}, ${formatNumber(input.sourceRange.end_seconds)}]`,
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

function normalizeProvidedIds(
  ids: string[] | undefined,
  expectedLength: number,
  label: string,
): string[] {
  if (ids === undefined) {
    return [];
  }

  if (ids.length !== expectedLength) {
    throw new Error(`${label} must match the number of requested slices.`);
  }

  const seen = new Set<string>();

  return ids.map((value, index) => {
    const normalized = normalizeSliceId(value, index);

    if (seen.has(normalized)) {
      throw new Error(`Duplicate ${label} entry detected: ${normalized}`);
    }

    seen.add(normalized);
    return normalized;
  });
}

function normalizeSliceId(value: string, index: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`slice_id at index ${index} must be a non-empty string.`);
  }

  return value.trim();
}

function createDerivedSliceId(index: number): string {
  return `slice_${String(index + 1).padStart(3, "0")}`;
}

function createSliceMapId(
  transientMap: TransientMap,
  preRollSeconds: number,
  postRollSeconds: number,
): string {
  const digest = createHash("sha256")
    .update(transientMap.transient_map_id)
    .update("|")
    .update(String(roundToSixDecimals(preRollSeconds)))
    .update("|")
    .update(String(roundToSixDecimals(postRollSeconds)))
    .digest("hex")
    .slice(0, 24)
    .toUpperCase();

  return `slicemap_${digest}`;
}

function readFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
}

function roundToSixDecimals(value: number): number {
  return Number(value.toFixed(6));
}

function formatNumber(value: number): string {
  return roundToSixDecimals(value).toString();
}
