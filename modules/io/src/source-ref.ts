import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { InvalidSourceReferenceError } from "./errors.js";

/** Validated representation of a source audio file on disk. */
export interface FileSourceRef {
  kind: "file";
  absolutePath: string;
  displayName: string;
  sourceUri: string;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join(path.posix.sep);
}

/** Converts an absolute path inside the workspace to a POSIX-style relative path. */
export function toWorkspaceRelativePath(absolutePath: string, workspaceRoot: string): string {
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedPath = path.resolve(absolutePath);
  const relativePath = path.relative(resolvedRoot, resolvedPath);

  if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new InvalidSourceReferenceError(`Path is not inside workspace root: ${resolvedPath}`);
  }

  return toPosixPath(relativePath);
}

/**
 * Validates that a path points to a readable file and derives a stable source
 * URI for import artifacts.
 */
export async function createFileSourceRef(
  inputPath: string,
  workspaceRoot: string = process.cwd(),
): Promise<FileSourceRef> {
  const absolutePath = path.resolve(inputPath);

  await access(absolutePath, constants.R_OK).catch((cause: unknown) => {
    throw new InvalidSourceReferenceError(`Source file is not readable: ${absolutePath}`, {
      cause,
    });
  });

  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) {
    throw new InvalidSourceReferenceError(`Source path is not a file: ${absolutePath}`);
  }

  let sourceUri: string;
  try {
    sourceUri = toWorkspaceRelativePath(absolutePath, workspaceRoot);
  } catch {
    sourceUri = pathToFileURL(absolutePath).toString();
  }

  return {
    kind: "file",
    absolutePath,
    displayName: path.basename(absolutePath),
    sourceUri,
  };
}
