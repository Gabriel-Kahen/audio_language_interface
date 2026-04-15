import { randomBytes } from "node:crypto";
import path from "node:path";

export interface ResolvedTransformPath {
  versionId: string;
  absolutePath: string;
  relativePath: string;
}

/** Returns a new contract-shaped transform record id. */
export function createTransformRecordId(): string {
  return `transform_${randomBytes(12).toString("hex")}`;
}

/** Returns a new contract-shaped output version id. */
export function createOutputVersionId(): string {
  return `ver_${randomBytes(16).toString("hex")}`;
}

/**
 * Resolves an output path inside the workspace root and returns both absolute
 * and contract-friendly relative forms.
 */
export function resolveTransformOutputPath(options: {
  workspaceRoot: string;
  versionId?: string;
  outputDir?: string;
  fileName?: string;
}): ResolvedTransformPath {
  const versionId = options.versionId ?? createOutputVersionId();
  const outputDir = normalizeWorkspaceRelativeSegment(options.outputDir ?? "storage/audio");
  const fileName = options.fileName ?? `${versionId}.wav`;
  const relativePath = toPosixPath(path.posix.join(outputDir, fileName));
  const absolutePath = path.resolve(options.workspaceRoot, relativePath);
  const relativeFromRoot = path.relative(options.workspaceRoot, absolutePath);

  if (relativeFromRoot.startsWith("..") || path.isAbsolute(relativeFromRoot)) {
    throw new Error(`Transform output must stay inside the workspace root: ${relativePath}`);
  }

  return {
    versionId,
    absolutePath,
    relativePath: toPosixPath(relativeFromRoot),
  };
}

function normalizeWorkspaceRelativeSegment(value: string): string {
  const normalized = toPosixPath(value.trim().replace(/^\.\//u, "").replace(/^\/+/, ""));

  if (normalized.length === 0) {
    throw new Error("Transform outputDir must not be empty.");
  }

  return normalized;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join(path.posix.sep);
}
