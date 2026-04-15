import { createHash, randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  type AudioAsset,
  type AudioVersion,
  assertValidAudioAsset,
  assertValidAudioVersion,
  SCHEMA_VERSION,
} from "./contracts.js";
import {
  createNormalizationPlan,
  type NormalizationTarget,
  normalizeAudioFile,
} from "./normalize-audio.js";
import { type AudioFileMetadata, inspectFileMetadata } from "./read-metadata.js";
import { createFileSourceRef, toWorkspaceRelativePath } from "./source-ref.js";

/** Options for importing a source file into workspace storage. */
export interface ImportAudioOptions {
  workspaceRoot?: string;
  outputDirectory?: string;
  importedAt?: Date | string;
  normalizationTarget?: NormalizationTarget;
  tags?: string[];
  notes?: string;
}

/** Result returned after a successful file import. */
export interface ImportAudioResult {
  asset: AudioAsset;
  version: AudioVersion;
  sourceMetadata: AudioFileMetadata;
  materializedMetadata: AudioFileMetadata;
  outputPath: string;
  normalized: boolean;
}

function createId<TPrefix extends "asset" | "ver">(prefix: TPrefix): `${TPrefix}_${string}` {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function normalizeTimestamp(value: Date | string | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function checksumFileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update(await readFile(filePath));
  return hash.digest("hex");
}

function buildAudioAsset(
  assetId: AudioAsset["asset_id"],
  displayName: string,
  importedAt: string,
  sourceUri: string,
  checksumSha256: string,
  metadata: AudioFileMetadata,
  options: Pick<ImportAudioOptions, "tags" | "notes">,
): AudioAsset {
  const asset: AudioAsset = {
    schema_version: SCHEMA_VERSION,
    asset_id: assetId,
    display_name: displayName,
    source: {
      kind: "file",
      uri: sourceUri,
      imported_at: importedAt,
      checksum_sha256: checksumSha256,
    },
    media: {
      container_format: metadata.containerFormat,
      codec: metadata.codec,
      sample_rate_hz: metadata.sampleRateHz,
      channels: metadata.channels,
      duration_seconds: metadata.durationSeconds,
    },
  };

  if (metadata.bitDepth !== undefined) {
    asset.media.bit_depth = metadata.bitDepth;
  }
  if (metadata.channelLayout !== undefined) {
    asset.media.channel_layout = metadata.channelLayout;
  }
  if (options.tags !== undefined) {
    asset.tags = options.tags;
  }
  if (options.notes !== undefined) {
    asset.notes = options.notes;
  }

  return assertValidAudioAsset(asset);
}

function buildAudioVersion(
  versionId: AudioVersion["version_id"],
  assetId: AudioAsset["asset_id"],
  importedAt: string,
  storageRef: string,
  metadata: AudioFileMetadata,
): AudioVersion {
  const version: AudioVersion = {
    schema_version: SCHEMA_VERSION,
    version_id: versionId,
    asset_id: assetId,
    lineage: {
      created_at: importedAt,
      created_by: "modules/io",
      reason: "initial import",
    },
    audio: {
      storage_ref: storageRef,
      sample_rate_hz: metadata.sampleRateHz,
      channels: metadata.channels,
      duration_seconds: metadata.durationSeconds,
      frame_count: metadata.frameCount,
    },
    state: {
      is_original: true,
      is_preview: false,
    },
  };

  if (metadata.channelLayout !== undefined) {
    version.audio.channel_layout = metadata.channelLayout;
  }

  return assertValidAudioVersion(version);
}

/**
 * Imports a readable source file, optionally normalizes it, and emits
 * contract-validated `AudioAsset` and `AudioVersion` artifacts.
 */
export async function importAudioFromFile(
  inputPath: string,
  options: ImportAudioOptions = {},
): Promise<ImportAudioResult> {
  const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
  const outputDirectory = options.outputDirectory ?? "storage/audio";
  const sourceRef = await createFileSourceRef(inputPath, workspaceRoot);
  const importedAt = normalizeTimestamp(options.importedAt);
  const assetId = createId("asset");
  const versionId = createId("ver");
  const sourceMetadata = await inspectFileMetadata(sourceRef.absolutePath);
  const checksumSha256 = await checksumFileSha256(sourceRef.absolutePath);

  const targetExtension =
    options.normalizationTarget?.containerFormat ?? sourceMetadata.containerFormat;
  const outputPath = path.resolve(
    workspaceRoot,
    outputDirectory,
    `${versionId}.${targetExtension}`,
  );
  const outputStorageRef = toWorkspaceRelativePath(outputPath, workspaceRoot);
  await mkdir(path.dirname(outputPath), { recursive: true });

  let materializedMetadata: AudioFileMetadata;
  let normalized = false;

  if (options.normalizationTarget) {
    const plan = createNormalizationPlan(sourceMetadata, options.normalizationTarget);
    normalized = plan.requiresTranscode;

    if (plan.requiresTranscode) {
      await normalizeAudioFile(sourceRef.absolutePath, outputPath, options.normalizationTarget);
      materializedMetadata = await inspectFileMetadata(outputPath);
    } else {
      await copyFile(sourceRef.absolutePath, outputPath);
      materializedMetadata = await inspectFileMetadata(outputPath);
    }
  } else {
    await copyFile(sourceRef.absolutePath, outputPath);
    materializedMetadata = await inspectFileMetadata(outputPath);
  }

  const asset = buildAudioAsset(
    assetId,
    sourceRef.displayName,
    importedAt,
    sourceRef.sourceUri,
    checksumSha256,
    sourceMetadata,
    options,
  );

  const version = buildAudioVersion(
    versionId,
    assetId,
    importedAt,
    outputStorageRef,
    materializedMetadata,
  );

  return {
    asset,
    version,
    sourceMetadata,
    materializedMetadata,
    outputPath,
    normalized,
  };
}
