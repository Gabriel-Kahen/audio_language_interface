import path from "node:path";

import { createRenderId } from "@audio-language-interface/core";

import type { RenderKind, ResolvedRenderPath } from "./types.js";

export interface ResolveRenderOutputPathOptions {
  workspaceRoot: string;
  outputDir?: string | undefined;
  outputFileName?: string | undefined;
  renderId?: string | undefined;
  extension: string;
  kind: RenderKind;
}

/**
 * Resolves a materialized render output path that must stay inside the
 * workspace root and is later emitted as a POSIX-style relative artifact path.
 */
export function resolveRenderOutputPath(
  options: ResolveRenderOutputPathOptions,
): ResolvedRenderPath {
  const renderId = options.renderId ?? createRenderId();
  const outputDir = normalizeWorkspaceRelativeSegment(options.outputDir ?? "renders");
  const extension = normalizeExtension(options.extension);
  const fileName = normalizeOutputFileName(
    options.outputFileName,
    renderId,
    extension,
    options.kind,
  );
  const relativePath = toPosixPath(path.posix.join(outputDir, fileName));
  const { absolutePath, relativePath: relativeFromRoot } = resolveWorkspaceContainedPath(
    options.workspaceRoot,
    relativePath,
    `Render ${options.kind} output must stay inside the workspace root`,
  );

  return {
    renderId,
    absolutePath,
    relativePath: toPosixPath(relativeFromRoot),
    fileName,
  };
}

export function resolveSourceAudioPath(workspaceRoot: string, storageRef: string): string {
  assertWorkspaceRelativePosixPath(
    storageRef,
    "AudioVersion.audio.storage_ref must be a workspace-relative POSIX path",
  );

  return resolveWorkspaceContainedPath(
    workspaceRoot,
    storageRef,
    "AudioVersion.audio.storage_ref must stay inside the workspace root",
  ).absolutePath;
}

function normalizeWorkspaceRelativeSegment(value: string): string {
  const normalized = toPosixPath(value.trim().replace(/^\.\//u, "").replace(/^\/+/, ""));

  if (normalized.length === 0) {
    throw new Error("Render outputDir must not be empty.");
  }

  return normalized;
}

function normalizeExtension(value: string): string {
  const normalized = value.trim().replace(/^\./u, "");

  if (normalized.length === 0) {
    throw new Error("Render extension must not be empty.");
  }

  return normalized;
}

function normalizeOutputFileName(
  outputFileName: string | undefined,
  renderId: string,
  extension: string,
  kind: RenderKind,
): string {
  if (outputFileName === undefined) {
    return `${renderId}.${extension}`;
  }

  const trimmed = toPosixPath(outputFileName.trim());

  if (trimmed.length === 0) {
    throw new Error(`Render ${kind} outputFileName must not be empty.`);
  }

  const parsed = path.posix.parse(toPosixPath(trimmed));

  if (parsed.ext.length === 0) {
    return `${trimmed}.${extension}`;
  }

  const actualExtension = parsed.ext.replace(/^\./u, "").toLowerCase();

  if (actualExtension !== extension.toLowerCase()) {
    throw new Error(
      `Render ${kind} outputFileName extension must match the selected format: expected .${extension}`,
    );
  }

  return trimmed;
}

function resolveWorkspaceContainedPath(
  workspaceRoot: string,
  relativeOrAbsolutePath: string,
  errorPrefix: string,
): { absolutePath: string; relativePath: string } {
  const absolutePath = path.resolve(workspaceRoot, relativeOrAbsolutePath);
  const relativePath = path.relative(workspaceRoot, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`${errorPrefix}: ${relativeOrAbsolutePath}`);
  }

  return {
    absolutePath,
    relativePath: toPosixPath(relativePath),
  };
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join(path.posix.sep);
}

function assertWorkspaceRelativePosixPath(value: string, errorMessage: string): void {
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    /^[A-Za-z]:[\\/]/u.test(value) ||
    value.includes("\\")
  ) {
    throw new Error(`${errorMessage}: ${value}`);
  }

  const segments = value.split("/");

  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error(`${errorMessage}: ${value}`);
  }
}
