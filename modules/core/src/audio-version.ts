import { SCHEMA_VERSION } from "./audio-asset.js";
import {
  type AssetId,
  createVersionId,
  type PlanId,
  type TransformId,
  type VersionId,
} from "./ids.js";
import { err, ok, type ValidationIssue, type ValidationResult } from "./result.js";
import { getAudioVersionSchemaIssues } from "./schema-validation.js";
import { type IsoTimestamp, isIsoTimestamp, nowTimestamp } from "./time.js";

export interface AudioVersionLineage {
  created_at: IsoTimestamp;
  created_by: string;
  reason?: string;
  plan_id?: PlanId;
  transform_record_id?: TransformId;
}

export interface AudioVersionAudio {
  storage_ref: string;
  sample_rate_hz: number;
  channels: number;
  duration_seconds: number;
  frame_count: number;
  channel_layout?: string;
}

export interface AudioVersionState {
  is_original?: boolean;
  is_preview?: boolean;
}

export interface AudioVersion {
  schema_version: typeof SCHEMA_VERSION;
  version_id: VersionId;
  asset_id: AssetId;
  parent_version_id?: VersionId;
  lineage: AudioVersionLineage;
  audio: AudioVersionAudio;
  state?: AudioVersionState;
}

export interface CreateAudioVersionInput {
  version_id?: VersionId;
  asset_id: AssetId;
  parent_version_id?: VersionId;
  lineage: Omit<AudioVersionLineage, "created_at"> & {
    created_at?: IsoTimestamp;
  };
  audio: AudioVersionAudio;
  state?: AudioVersionState;
}

/**
 * Creates a canonical `AudioVersion`, generating stable local defaults and
 * enforcing the published runtime invariants before returning.
 */
export function createAudioVersion(input: CreateAudioVersionInput): AudioVersion {
  const version: AudioVersion = {
    schema_version: SCHEMA_VERSION,
    version_id: input.version_id ?? createVersionId(),
    asset_id: input.asset_id,
    ...(input.parent_version_id ? { parent_version_id: input.parent_version_id } : {}),
    lineage: {
      ...input.lineage,
      created_at: input.lineage.created_at ?? nowTimestamp(),
    },
    audio: { ...input.audio },
    ...(input.state ? { state: { ...input.state } } : {}),
  };

  return assertValidAudioVersion(version);
}

/** Validates an unknown value against the runtime `AudioVersion` contract. */
export function validateAudioVersion(value: unknown): ValidationResult<AudioVersion> {
  const issues = audioVersionIssues(value);

  if (issues.length > 0) {
    return err({
      code: "validation_error",
      message: "Invalid AudioVersion.",
      issues,
    });
  }

  return ok(value as AudioVersion);
}

/** Validates an `AudioVersion` and throws when any invariant is violated. */
export function assertValidAudioVersion(value: unknown): AudioVersion {
  const result = validateAudioVersion(value);

  if (!result.ok) {
    throw new Error(formatValidationError("AudioVersion", result.error.issues));
  }

  return result.value;
}

/** Type guard backed by the same validator used elsewhere in the module. */
export function isAudioVersion(value: unknown): value is AudioVersion {
  return validateAudioVersion(value).ok;
}

function audioVersionIssues(value: unknown): ValidationIssue[] {
  const issues = getAudioVersionSchemaIssues(value);

  if (issues.length > 0) {
    return issues;
  }

  const version = value as AudioVersion;

  if (version.parent_version_id === version.version_id) {
    issues.push({
      instancePath: "/parent_version_id",
      keyword: "not",
      message: "must not equal version_id",
    });
  }

  if (!isIsoTimestamp(version.lineage.created_at)) {
    issues.push({
      instancePath: "/lineage/created_at",
      keyword: "isoTimestamp",
      message: "must be an ISO 8601 UTC timestamp",
    });
  }

  if (!isWorkspaceRelativePosixPath(version.audio.storage_ref)) {
    issues.push({
      instancePath: "/audio/storage_ref",
      keyword: "workspacePath",
      message: "must be a workspace-relative POSIX path without '.' or '..' segments",
    });
  }

  if (
    !frameCountMatchesDuration(
      version.audio.frame_count,
      version.audio.duration_seconds,
      version.audio.sample_rate_hz,
    )
  ) {
    issues.push({
      instancePath: "/audio/frame_count",
      keyword: "consistency",
      message: "must agree with duration_seconds at the declared sample_rate_hz",
    });
  }

  return issues;
}

function isWorkspaceRelativePosixPath(value: string): boolean {
  if (value.length === 0 || value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) {
    return false;
  }

  if (value.includes("\\")) {
    return false;
  }

  return value
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function frameCountMatchesDuration(
  frameCount: number,
  durationSeconds: number,
  sampleRateHz: number,
): boolean {
  const expectedDurationSeconds = frameCount / sampleRateHz;
  const oneFrameDurationSeconds = 1 / sampleRateHz;

  return Math.abs(durationSeconds - expectedDurationSeconds) <= oneFrameDurationSeconds;
}

function formatValidationError(typeName: string, issues: ValidationIssue[]): string {
  const details = issues
    .map((issue) => `${issue.instancePath || "/"}: ${issue.message}`)
    .join("; ");

  return `${typeName} validation failed: ${details}`;
}
