import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AudioVersion } from "@audio-language-interface/core";
import type {
  AppliedOrRevertedRequestCycleResult,
  LlmAssistedInterpretationOptions,
  OrchestrationDependencies,
  RequestCycleResult,
} from "@audio-language-interface/orchestration";

import {
  assertValidCliSessionState,
  buildUpdatedCliSessionState,
  getSessionWorkspaceRoot,
  loadCliSessionState,
  saveCliSessionState,
} from "./session-state.js";
import type {
  CliCommand,
  CliExecutionResult,
  CliJsonSummary,
  CliLlmOptions,
  CliRuntimeOverrides,
  FollowUpCliCommand,
  PersistRunArtifactsInput,
  RunCliOptions,
} from "./types.js";

export async function runCli(
  argv: string[],
  options: RunCliOptions = {},
): Promise<CliExecutionResult> {
  const command = parseCliArgs(argv, options.cwd === undefined ? {} : { cwd: options.cwd });

  if (command.kind === "help") {
    writeStdout(options, `${buildHelpText()}\n`);
    return { exitCode: 0 };
  }

  try {
    const summary =
      command.kind === "edit"
        ? await runEditCommand(command, options)
        : await runFollowUpCommand(command, options);

    emitSummary(summary, options, command.json);
    return {
      exitCode: 0,
      summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeStderr(options, `${message}\n`);
    return { exitCode: 1 };
  }
}

export function parseCliArgs(argv: string[], options: { cwd?: string } = {}): CliCommand {
  const positional = [...argv];
  const commandName = positional.shift();

  if (
    commandName === undefined ||
    commandName === "help" ||
    commandName === "--help" ||
    commandName === "-h"
  ) {
    return { kind: "help" };
  }

  if (commandName !== "edit" && commandName !== "follow-up") {
    throw new Error(
      `Unknown command \`${commandName}\`. Use \`help\` to see the supported CLI surface.`,
    );
  }

  const optionsRecord = new Map<string, string | true>();
  const rest: string[] = [];
  for (let index = 0; index < positional.length; index += 1) {
    const token = positional[index];
    if (token === undefined) {
      continue;
    }
    if (token?.startsWith("--")) {
      const next = positional[index + 1];
      if (next === undefined || next.startsWith("--")) {
        optionsRecord.set(token, true);
      } else {
        optionsRecord.set(token, next);
        index += 1;
      }
      continue;
    }

    rest.push(token);
  }

  const llm = parseCliLlmOptions(optionsRecord);
  const bestEffort = parseCliBestEffortOption(optionsRecord);
  const json = optionsRecord.has("--json");
  const cwd = path.resolve(options.cwd ?? process.cwd());

  if (commandName === "edit") {
    const inputPath = rest[0];
    const request = rest[1];
    if (!inputPath || !request) {
      throw new Error(
        "Usage: ali edit <input-path> <request> [--session-dir <path>] [--output <path>] [--json] [--best-effort] [--llm-*]",
      );
    }

    return {
      kind: "edit",
      inputPath: path.resolve(cwd, inputPath),
      request,
      ...(typeof optionsRecord.get("--session-dir") === "string"
        ? { sessionDir: path.resolve(cwd, String(optionsRecord.get("--session-dir"))) }
        : {}),
      ...(typeof optionsRecord.get("--output") === "string"
        ? { outputPath: path.resolve(cwd, String(optionsRecord.get("--output"))) }
        : {}),
      ...(llm === undefined ? {} : { llm }),
      bestEffort,
      json,
    };
  }

  const sessionDir = rest[0];
  const request = rest[1];
  if (!sessionDir || !request) {
    throw new Error(
      "Usage: ali follow-up <session-dir> <request> [--output <path>] [--json] [--best-effort] [--llm-*]",
    );
  }

  return {
    kind: "follow_up",
    sessionDir: path.resolve(cwd, sessionDir),
    request,
    ...(typeof optionsRecord.get("--output") === "string"
      ? { outputPath: path.resolve(cwd, String(optionsRecord.get("--output"))) }
      : {}),
    ...(llm === undefined ? {} : { llm }),
    bestEffort,
    json,
  };
}

function parseCliBestEffortOption(options: Map<string, string | true>): boolean {
  const value = options.get("--best-effort");
  if (value !== undefined && value !== true) {
    throw new Error("`--best-effort` does not accept a value.");
  }

  return value === true;
}

function parseCliLlmOptions(options: Map<string, string | true>): CliLlmOptions | undefined {
  const provider = options.get("--llm-provider");
  const model = options.get("--llm-model");
  const apiKey = options.get("--llm-api-key");
  const codexPath = options.get("--llm-codex-path");
  const profile = options.get("--llm-codex-profile");

  if (
    provider === undefined &&
    model === undefined &&
    apiKey === undefined &&
    codexPath === undefined &&
    profile === undefined
  ) {
    return undefined;
  }

  if (provider !== "openai" && provider !== "google" && provider !== "codex_cli") {
    throw new Error("`--llm-provider` must be `openai`, `google`, or `codex_cli`.");
  }
  if (provider !== "codex_cli" && (typeof model !== "string" || model.length === 0)) {
    throw new Error(
      "`--llm-model` is required for `openai` and `google` interpretation providers.",
    );
  }
  if (provider !== "codex_cli" && (typeof apiKey !== "string" || apiKey.length === 0)) {
    throw new Error(
      "`--llm-api-key` is required for `openai` and `google` interpretation providers.",
    );
  }

  const policyValue = options.get("--llm-policy");
  if (
    policyValue !== undefined &&
    policyValue !== "conservative" &&
    policyValue !== "best_effort"
  ) {
    throw new Error("`--llm-policy` must be `conservative` or `best_effort`.");
  }

  return {
    provider,
    ...(typeof model === "string" ? { model } : {}),
    ...(typeof apiKey === "string" ? { apiKey } : {}),
    ...(typeof policyValue === "string" ? { policy: policyValue } : {}),
    ...(typeof options.get("--llm-api-base-url") === "string"
      ? { apiBaseUrl: String(options.get("--llm-api-base-url")) }
      : {}),
    ...(typeof options.get("--llm-prompt-version") === "string"
      ? { promptVersion: String(options.get("--llm-prompt-version")) }
      : {}),
    ...(typeof options.get("--llm-timeout-ms") === "string"
      ? {
          timeoutMs: parsePositiveInteger(
            String(options.get("--llm-timeout-ms")),
            "--llm-timeout-ms",
          ),
        }
      : {}),
    ...(typeof options.get("--llm-max-retries") === "string"
      ? {
          maxRetries: parseNonNegativeInteger(
            String(options.get("--llm-max-retries")),
            "--llm-max-retries",
          ),
        }
      : {}),
    ...(typeof codexPath === "string" ? { codexPath } : {}),
    ...(typeof profile === "string" ? { profile } : {}),
  };
}

async function runEditCommand(
  command: Extract<CliCommand, { kind: "edit" }>,
  options: RunCliOptions,
): Promise<CliJsonSummary> {
  const {
    defaultOrchestrationDependencies,
    isAppliedOrRevertedRequestCycleResult,
    runRequestCycle,
  } = await loadOrchestrationRuntime();
  const now = (options.now ?? (() => new Date()))();
  const sessionDir =
    command.sessionDir ??
    path.resolve(options.cwd ?? process.cwd(), createDefaultSessionDirectoryName(now));
  await ensureSessionDirectoryForCreate(sessionDir);
  const workspaceRoot = path.join(sessionDir, "workspace");
  const runId = "run-0001";
  const runDir = path.join(sessionDir, "runs", runId);
  await mkdir(runDir, { recursive: true });

  const result = await runRequestCycle({
    workspaceRoot,
    userRequest: command.request,
    input: {
      kind: "import",
      inputPath: command.inputPath,
      importOptions: {
        workspaceRoot,
      },
    },
    renderKind: "final",
    revision: {
      enabled: false,
    },
    ...(command.llm === undefined ? {} : { interpretation: toInterpretationOptions(command.llm) }),
    ...(command.bestEffort ? { planningPolicy: "best_effort" as const } : {}),
    dependencies: createCliDependencies(undefined, options, defaultOrchestrationDependencies),
  });

  const sessionStateInput = {
    workspaceRootRelative: "workspace",
    runId,
    runDirectoryRelative: path.relative(sessionDir, runDir),
    request: command.request,
    createdAt: now.toISOString(),
    result,
  };
  await saveCliSessionState(sessionDir, buildUpdatedCliSessionState(sessionStateInput));

  const outputFileRelative = isAppliedOrRevertedRequestCycleResult(result)
    ? await persistRunArtifacts({
        sessionDir,
        runDir,
        request: command.request,
        result,
        ...(command.outputPath === undefined ? {} : { outputCopyPath: command.outputPath }),
      })
    : await persistRunArtifacts({
        sessionDir,
        runDir,
        request: command.request,
        result,
      });
  if (outputFileRelative !== undefined) {
    await saveCliSessionState(
      sessionDir,
      buildUpdatedCliSessionState({
        ...sessionStateInput,
        outputFileRelative,
      }),
    );
  }

  return buildJsonSummary({
    sessionDir,
    runDir,
    request: command.request,
    result,
    ...(outputFileRelative === undefined ? {} : { outputFileRelative }),
  });
}

async function runFollowUpCommand(
  command: FollowUpCliCommand,
  options: RunCliOptions,
): Promise<CliJsonSummary> {
  const {
    defaultOrchestrationDependencies,
    isAppliedOrRevertedRequestCycleResult,
    runRequestCycle,
  } = await loadOrchestrationRuntime();
  const sessionState = assertValidCliSessionState(await loadCliSessionState(command.sessionDir));
  const now = (options.now ?? (() => new Date()))();
  const runId = `run-${String(sessionState.runs.length + 1).padStart(4, "0")}`;
  const runDir = path.join(command.sessionDir, "runs", runId);
  await mkdir(runDir, { recursive: true });
  const workspaceRoot = getSessionWorkspaceRoot(command.sessionDir, sessionState);

  const result = await runRequestCycle({
    workspaceRoot,
    userRequest: command.request,
    input: {
      kind: "existing",
      asset: sessionState.asset,
      version: sessionState.current_version,
      sessionGraph: sessionState.session_graph,
    },
    renderKind: "final",
    revision: {
      enabled: false,
    },
    ...(command.llm === undefined ? {} : { interpretation: toInterpretationOptions(command.llm) }),
    ...(command.bestEffort ? { planningPolicy: "best_effort" as const } : {}),
    dependencies: createCliDependencies(
      sessionState.available_versions,
      options,
      defaultOrchestrationDependencies,
    ),
  });

  const sessionStateInput = {
    previousState: sessionState,
    workspaceRootRelative: sessionState.workspace_root,
    runId,
    runDirectoryRelative: path.relative(command.sessionDir, runDir),
    request: command.request,
    createdAt: now.toISOString(),
    result,
  };
  await saveCliSessionState(command.sessionDir, buildUpdatedCliSessionState(sessionStateInput));

  const outputFileRelative = isAppliedOrRevertedRequestCycleResult(result)
    ? await persistRunArtifacts({
        sessionDir: command.sessionDir,
        runDir,
        request: command.request,
        result,
        ...(command.outputPath === undefined ? {} : { outputCopyPath: command.outputPath }),
      })
    : await persistRunArtifacts({
        sessionDir: command.sessionDir,
        runDir,
        request: command.request,
        result,
      });
  if (outputFileRelative !== undefined) {
    await saveCliSessionState(
      command.sessionDir,
      buildUpdatedCliSessionState({
        ...sessionStateInput,
        outputFileRelative,
      }),
    );
  }

  return buildJsonSummary({
    sessionDir: command.sessionDir,
    runDir,
    request: command.request,
    result,
    ...(outputFileRelative === undefined ? {} : { outputFileRelative }),
  });
}

function createCliDependencies(
  availableVersions: AudioVersion[] | undefined,
  options: CliRuntimeOverrides,
  defaultOrchestrationDependencies: OrchestrationDependencies,
): OrchestrationDependencies {
  const overrides = options.orchestrationDependencies ?? {};
  return {
    ...defaultOrchestrationDependencies,
    ...overrides,
    getAudioVersionById:
      overrides.getAudioVersionById ??
      (async ({ asset, versionId }) =>
        availableVersions?.find(
          (version) => version.version_id === versionId && version.asset_id === asset.asset_id,
        )),
  };
}

async function loadOrchestrationRuntime(): Promise<{
  defaultOrchestrationDependencies: OrchestrationDependencies;
  isAppliedOrRevertedRequestCycleResult(
    result: RequestCycleResult,
  ): result is Extract<RequestCycleResult, { result_kind: "applied" | "reverted" }>;
  runRequestCycle: typeof import("@audio-language-interface/orchestration").runRequestCycle;
}> {
  const module = await import("@audio-language-interface/orchestration");
  return {
    defaultOrchestrationDependencies: module.defaultOrchestrationDependencies,
    isAppliedOrRevertedRequestCycleResult: module.isAppliedOrRevertedRequestCycleResult,
    runRequestCycle: module.runRequestCycle,
  };
}

function toInterpretationOptions(llm: CliLlmOptions): LlmAssistedInterpretationOptions {
  if (llm.provider === "codex_cli") {
    return {
      mode: "llm_assisted",
      provider: {
        kind: "codex_cli",
        ...(llm.model === undefined ? {} : { model: llm.model }),
        ...(llm.codexPath === undefined ? {} : { codexPath: llm.codexPath }),
        ...(llm.profile === undefined ? {} : { profile: llm.profile }),
        ...(llm.timeoutMs === undefined ? {} : { timeoutMs: llm.timeoutMs }),
        ...(llm.maxRetries === undefined ? {} : { maxRetries: llm.maxRetries }),
      },
      ...(llm.policy === undefined ? {} : { policy: llm.policy }),
      ...(llm.promptVersion === undefined ? {} : { promptVersion: llm.promptVersion }),
    };
  }

  return {
    mode: "llm_assisted",
    apiKey: llm.apiKey ?? "",
    provider: {
      kind: llm.provider,
      model: llm.model ?? "",
      ...(llm.apiBaseUrl === undefined ? {} : { apiBaseUrl: llm.apiBaseUrl }),
      ...(llm.timeoutMs === undefined ? {} : { timeoutMs: llm.timeoutMs }),
      ...(llm.maxRetries === undefined ? {} : { maxRetries: llm.maxRetries }),
    },
    ...(llm.policy === undefined ? {} : { policy: llm.policy }),
    ...(llm.promptVersion === undefined ? {} : { promptVersion: llm.promptVersion }),
  };
}

async function persistRunArtifacts(input: PersistRunArtifactsInput): Promise<string | undefined> {
  await writeFile(path.join(input.runDir, "request.txt"), `${input.request}\n`);
  await writeJson(path.join(input.runDir, "request-cycle-result.json"), input.result);
  await writeJson(path.join(input.runDir, "session-graph.json"), input.result.sessionGraph);

  if (input.result.intentInterpretation) {
    await writeJson(
      path.join(input.runDir, "intent-interpretation.json"),
      input.result.intentInterpretation,
    );
  }

  if (!isAppliedOrRevertedResult(input.result)) {
    await writeJson(path.join(input.runDir, "summary.json"), {
      result_kind: input.result.result_kind,
      clarification_question: input.result.clarification.question,
    });
    return undefined;
  }

  if (input.result.editPlan) {
    await writeJson(path.join(input.runDir, "edit-plan.json"), input.result.editPlan);
  }

  await writeJson(
    path.join(input.runDir, "version-comparison-report.json"),
    input.result.versionComparisonReport,
  );
  await writeJson(
    path.join(input.runDir, "render-comparison-report.json"),
    input.result.renderComparisonReport,
  );
  await writeJson(path.join(input.runDir, "summary.json"), {
    result_kind: input.result.result_kind,
    output_version_id: input.result.outputVersion.version_id,
    follow_up_source: input.result.followUpResolution.source,
  });

  const extension = path.extname(input.result.candidateRender.output.path) || ".wav";
  const sourceOutputPath = path.join(
    input.sessionDir,
    "workspace",
    input.result.candidateRender.output.path,
  );
  const localOutputPath = path.join(input.runDir, `output${extension}`);
  await copyFile(sourceOutputPath, localOutputPath);

  if (input.outputCopyPath) {
    await mkdir(path.dirname(input.outputCopyPath), { recursive: true });
    await copyFile(sourceOutputPath, input.outputCopyPath);
  }

  return path.relative(input.sessionDir, localOutputPath);
}

function buildJsonSummary(input: {
  sessionDir: string;
  runDir: string;
  request: string;
  result: RequestCycleResult;
  outputFileRelative?: string;
}): CliJsonSummary {
  const { result } = input;
  return {
    session_dir: input.sessionDir,
    run_dir: input.runDir,
    request: input.request,
    result_kind: result.result_kind,
    follow_up_source: result.followUpResolution.source,
    ...(result.intentInterpretation?.normalized_request === undefined
      ? {}
      : { interpreted_request: result.intentInterpretation.normalized_request }),
    ...(result.result_kind === "clarification_required"
      ? { clarification_question: result.clarification.question }
      : {}),
    ...(input.outputFileRelative === undefined
      ? {}
      : { output_file: path.join(input.sessionDir, input.outputFileRelative) }),
    ...(isAppliedOrRevertedResult(result)
      ? {
          plan_operations: result.editPlan?.steps.map((step) => step.operation) ?? [],
          comparison_summary: {
            summary_text: result.versionComparisonReport.summary.plain_text,
            severe_regression_count:
              result.versionComparisonReport.regressions?.filter(
                (regression) => regression.severity >= 0.75,
              ).length ?? 0,
            goal_statuses:
              result.versionComparisonReport.goal_alignment?.map((goal) => ({
                goal: goal.goal,
                status: goal.status,
              })) ?? [],
          },
        }
      : {}),
  };
}

function emitSummary(summary: CliJsonSummary, options: RunCliOptions, json: boolean): void {
  if (json) {
    writeStdout(options, `${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  const lines = [
    `Session: ${summary.session_dir}`,
    `Run: ${summary.run_dir}`,
    `Result: ${summary.result_kind}`,
  ];

  if (summary.interpreted_request) {
    lines.push(`Interpreted Request: ${summary.interpreted_request}`);
  }

  if (summary.plan_operations && summary.plan_operations.length > 0) {
    lines.push(`Plan: ${summary.plan_operations.join(" -> ")}`);
  }

  if (summary.output_file) {
    lines.push(`Output: ${summary.output_file}`);
  }

  if (summary.clarification_question) {
    lines.push(`Clarification: ${summary.clarification_question}`);
  }

  if (summary.comparison_summary) {
    lines.push(
      `Version Outcome: ${summary.comparison_summary.summary_text ?? "unknown"} (${summary.comparison_summary.severe_regression_count} severe regressions)`,
    );
  }

  writeStdout(options, `${lines.join("\n")}\n`);
}

function buildHelpText(): string {
  return [
    "Audio Language Interface CLI",
    "",
    "Commands:",
    "  ali edit <input-path> <request> [--session-dir <path>] [--output <path>] [--json] [--best-effort]",
    "  ali follow-up <session-dir> <request> [--output <path>] [--json] [--best-effort]",
    "",
    "Planner flags:",
    "  --best-effort",
    "",
    "Optional LLM flags:",
    "  --llm-provider <openai|google|codex_cli>",
    "  --llm-model <model>",
    "  --llm-api-key <key>",
    "  --llm-policy <conservative|best_effort>",
    "  --llm-timeout-ms <milliseconds>",
    "  --llm-max-retries <count>",
    "  --llm-api-base-url <url>",
    "  --llm-prompt-version <id>",
    "  --llm-codex-path <path>",
    "  --llm-codex-profile <profile>",
  ].join("\n");
}

function createDefaultSessionDirectoryName(now: Date): string {
  const stamp = now.toISOString().replace(/[:]/g, "-").replace(/\..+$/, "");
  return `ali-session-${stamp}`;
}

async function ensureSessionDirectoryForCreate(sessionDir: string): Promise<void> {
  await mkdir(sessionDir, { recursive: true });
  const contents = await readdir(sessionDir);
  if (contents.length > 0) {
    throw new Error(
      `Session directory already exists and is not empty: ${sessionDir}. Choose a new --session-dir for \`ali edit\`.`,
    );
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`\`${flagName}\` must be a positive integer.`);
  }

  return parsed;
}

function parseNonNegativeInteger(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`\`${flagName}\` must be a non-negative integer.`);
  }

  return parsed;
}

function writeStdout(options: RunCliOptions, message: string): void {
  (options.stdout ?? process.stdout).write(message);
}

function writeStderr(options: RunCliOptions, message: string): void {
  (options.stderr ?? process.stderr).write(message);
}

function isAppliedOrRevertedResult(
  result: RequestCycleResult,
): result is AppliedOrRevertedRequestCycleResult {
  return result.result_kind === "applied" || result.result_kind === "reverted";
}

export { buildHelpText };
