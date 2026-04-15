import { type AssetId, createAssetId } from "./ids.js";
import { err, ok, type ValidationIssue, type ValidationResult } from "./result.js";
import { getAudioAssetSchemaIssues } from "./schema-validation.js";
import { type IsoTimestamp, isIsoTimestamp, nowTimestamp } from "./time.js";

export const SCHEMA_VERSION = "1.0.0" as const;

export type SourceKind = "file" | "bytes" | "stream" | "generated";

export interface AudioAssetSource {
  kind: SourceKind;
  imported_at: IsoTimestamp;
  uri?: string;
  checksum_sha256?: string;
}

export interface AudioAssetMedia {
  container_format: string;
  codec: string;
  sample_rate_hz: number;
  channels: number;
  duration_seconds: number;
  bit_depth?: number;
  channel_layout?: string;
}

export interface AudioAsset {
  schema_version: typeof SCHEMA_VERSION;
  asset_id: AssetId;
  display_name: string;
  source: AudioAssetSource;
  media: AudioAssetMedia;
  tags?: string[];
  notes?: string;
}

export interface CreateAudioAssetInput {
  asset_id?: AssetId;
  display_name: string;
  source: Omit<AudioAssetSource, "imported_at"> & {
    imported_at?: IsoTimestamp;
  };
  media: AudioAssetMedia;
  tags?: string[];
  notes?: string;
}

/**
 * Creates a canonical `AudioAsset`, generating stable local defaults and
 * enforcing the published runtime invariants before returning.
 */
export function createAudioAsset(input: CreateAudioAssetInput): AudioAsset {
  const asset: AudioAsset = {
    schema_version: SCHEMA_VERSION,
    asset_id: input.asset_id ?? createAssetId(),
    display_name: input.display_name,
    source: {
      ...input.source,
      imported_at: input.source.imported_at ?? nowTimestamp(),
    },
    media: { ...input.media },
    ...(input.tags ? { tags: [...input.tags] } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };

  return assertValidAudioAsset(asset);
}

/** Validates an unknown value against the runtime `AudioAsset` contract. */
export function validateAudioAsset(value: unknown): ValidationResult<AudioAsset> {
  const issues = audioAssetIssues(value);

  if (issues.length > 0) {
    return err({
      code: "validation_error",
      message: "Invalid AudioAsset.",
      issues,
    });
  }

  return ok(value as AudioAsset);
}

/** Validates an `AudioAsset` and throws when any invariant is violated. */
export function assertValidAudioAsset(value: unknown): AudioAsset {
  const result = validateAudioAsset(value);

  if (!result.ok) {
    throw new Error(formatValidationError("AudioAsset", result.error.issues));
  }

  return result.value;
}

/** Type guard backed by the same validator used elsewhere in the module. */
export function isAudioAsset(value: unknown): value is AudioAsset {
  return validateAudioAsset(value).ok;
}

function audioAssetIssues(value: unknown): ValidationIssue[] {
  const issues = getAudioAssetSchemaIssues(value);

  if (issues.length > 0) {
    return issues;
  }

  const asset = value as AudioAsset;

  if (!isIsoTimestamp(asset.source.imported_at)) {
    issues.push({
      instancePath: "/source/imported_at",
      keyword: "isoTimestamp",
      message: "must be an ISO 8601 UTC timestamp",
    });
  }

  return issues;
}

function formatValidationError(typeName: string, issues: ValidationIssue[]): string {
  const details = issues
    .map((issue) => `${issue.instancePath || "/"}: ${issue.message}`)
    .join("; ");

  return `${typeName} validation failed: ${details}`;
}
