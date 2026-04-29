import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  type AudioVersion,
  assertValidAudioAsset,
  assertValidAudioVersion,
  createSessionId,
} from "@audio-language-interface/core";
import { assertValidSessionGraph, type SessionGraph } from "@audio-language-interface/history";
import type { RequestCycleResult } from "@audio-language-interface/orchestration";

import type { CliRunRecord, CliSessionState, UpdateCliSessionStateInput } from "./types.js";

const CLI_SESSION_STATE_FILE = "session.json";

export function getCliSessionStatePath(sessionDir: string): string {
  return path.join(sessionDir, CLI_SESSION_STATE_FILE);
}

export async function loadCliSessionState(sessionDir: string): Promise<CliSessionState> {
  const statePath = getCliSessionStatePath(sessionDir);
  const raw = JSON.parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
  return assertValidCliSessionState(raw);
}

export async function saveCliSessionState(
  sessionDir: string,
  state: CliSessionState,
): Promise<void> {
  await mkdir(sessionDir, { recursive: true });
  await writeFile(getCliSessionStatePath(sessionDir), `${JSON.stringify(state, null, 2)}\n`);
}

export function assertValidCliSessionState(value: unknown): CliSessionState {
  if (!value || typeof value !== "object") {
    throw new Error("CLI session state must be an object.");
  }

  const record = value as Record<string, unknown>;
  if (record.schema_version !== "1.0.0") {
    throw new Error("CLI session state schema_version must be '1.0.0'.");
  }
  if (record.session_directory_version !== "1") {
    throw new Error("CLI session state session_directory_version must be '1'.");
  }
  if (typeof record.created_at !== "string" || typeof record.updated_at !== "string") {
    throw new Error("CLI session state timestamps must be strings.");
  }
  if (typeof record.session_id !== "string") {
    throw new Error("CLI session state session_id must be a string.");
  }
  if (typeof record.workspace_root !== "string" || record.workspace_root.length === 0) {
    throw new Error("CLI session state workspace_root must be a non-empty string.");
  }

  const asset = assertValidAudioAsset(record.asset);
  const currentVersion = assertValidAudioVersion(record.current_version);
  const availableVersions = expectAudioVersionArray(
    record.available_versions,
    "available_versions",
  );
  const sessionGraphValue = record.session_graph;
  assertValidSessionGraph(sessionGraphValue as SessionGraph);
  const sessionGraph = sessionGraphValue as SessionGraph;
  const runs = expectRunArray(record.runs);

  if (!availableVersions.some((version) => version.version_id === currentVersion.version_id)) {
    throw new Error("CLI session state current_version must exist in available_versions.");
  }
  if (asset.asset_id !== currentVersion.asset_id) {
    throw new Error("CLI session state current_version must belong to asset.");
  }
  if (
    sessionGraph.active_refs.asset_id !== asset.asset_id ||
    sessionGraph.active_refs.version_id !== currentVersion.version_id
  ) {
    throw new Error(
      "CLI session state session_graph.active_refs must match asset and current_version.",
    );
  }
  if (sessionGraph.session_id !== record.session_id) {
    throw new Error("CLI session state session_graph.session_id must match session_id.");
  }

  return {
    schema_version: "1.0.0",
    session_directory_version: "1",
    created_at: record.created_at,
    updated_at: record.updated_at,
    session_id: record.session_id,
    workspace_root: record.workspace_root,
    asset,
    current_version: currentVersion,
    available_versions: availableVersions,
    session_graph: sessionGraph,
    runs,
  };
}

function expectAudioVersionArray(value: unknown, fieldName: string): AudioVersion[] {
  if (!Array.isArray(value)) {
    throw new Error(`CLI session state ${fieldName} must be an array.`);
  }

  return value.map((entry, index) => {
    try {
      return assertValidAudioVersion(entry);
    } catch (error) {
      throw new Error(
        `CLI session state ${fieldName}[${index}] is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}

function expectRunArray(value: unknown): CliRunRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("CLI session state runs must be an array.");
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`CLI session state runs[${index}] must be an object.`);
    }

    const record = entry as Record<string, unknown>;
    if (
      typeof record.run_id !== "string" ||
      typeof record.created_at !== "string" ||
      (record.command_kind !== "edit" && record.command_kind !== "follow_up") ||
      typeof record.user_request !== "string" ||
      (record.result_kind !== "applied" &&
        record.result_kind !== "reverted" &&
        record.result_kind !== "clarification_required") ||
      typeof record.run_directory !== "string" ||
      typeof record.current_version_id !== "string"
    ) {
      throw new Error(`CLI session state runs[${index}] is invalid.`);
    }

    return {
      run_id: record.run_id,
      created_at: record.created_at,
      command_kind: record.command_kind,
      user_request: record.user_request,
      result_kind: record.result_kind,
      run_directory: record.run_directory,
      current_version_id: record.current_version_id,
      ...(typeof record.output_file === "string" ? { output_file: record.output_file } : {}),
    };
  });
}

export function buildUpdatedCliSessionState(input: UpdateCliSessionStateInput): CliSessionState {
  const now = input.createdAt;
  const previousRuns = input.previousState?.runs ?? [];
  const previousVersions = input.previousState?.available_versions ?? [];
  const allVersions = collectAvailableVersions(previousVersions, input.result);
  const currentVersion =
    input.result.result_kind === "clarification_required"
      ? input.result.inputVersion
      : input.result.outputVersion;
  const runRecord: CliRunRecord = {
    run_id: input.runId,
    created_at: now,
    command_kind: input.previousState ? "follow_up" : "edit",
    user_request: input.request,
    result_kind: input.result.result_kind,
    run_directory: input.runDirectoryRelative,
    current_version_id: currentVersion.version_id,
    ...(input.outputFileRelative === undefined ? {} : { output_file: input.outputFileRelative }),
  };

  return {
    schema_version: "1.0.0",
    session_directory_version: "1",
    created_at: input.previousState?.created_at ?? now,
    updated_at: now,
    session_id:
      input.previousState?.session_id ?? input.result.sessionGraph.session_id ?? createSessionId(),
    workspace_root: input.workspaceRootRelative,
    asset: input.result.asset,
    current_version: currentVersion,
    available_versions: allVersions,
    session_graph: input.result.sessionGraph,
    runs: [...previousRuns, runRecord],
  };
}

function collectAvailableVersions(
  previousVersions: AudioVersion[],
  result: RequestCycleResult,
): AudioVersion[] {
  const collected = new Map<string, AudioVersion>();

  for (const version of previousVersions) {
    collected.set(version.version_id, version);
  }

  collected.set(result.inputVersion.version_id, result.inputVersion);

  if (result.result_kind !== "clarification_required") {
    collected.set(result.outputVersion.version_id, result.outputVersion);
    for (const iteration of result.iterations ?? []) {
      collected.set(iteration.inputVersion.version_id, iteration.inputVersion);
      collected.set(iteration.outputVersion.version_id, iteration.outputVersion);
    }
  }

  return [...collected.values()];
}

export function getSessionWorkspaceRoot(sessionDir: string, state: CliSessionState): string {
  return path.resolve(sessionDir, state.workspace_root);
}
