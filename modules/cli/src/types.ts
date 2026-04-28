import type { AudioAsset, AudioVersion } from "@audio-language-interface/core";
import type { SessionGraph } from "@audio-language-interface/history";
import type { InterpretationPolicy } from "@audio-language-interface/interpretation";
import type {
  AppliedOrRevertedRequestCycleResult,
  OrchestrationDependencies,
  RequestCycleResult,
} from "@audio-language-interface/orchestration";

export interface CliLlmOptions {
  provider: "openai" | "google" | "codex_cli";
  model?: string;
  apiKey?: string;
  policy?: InterpretationPolicy;
  timeoutMs?: number;
  maxRetries?: number;
  apiBaseUrl?: string;
  promptVersion?: string;
  codexPath?: string;
  profile?: string;
}

export interface EditCliCommand {
  kind: "edit";
  inputPath: string;
  request: string;
  sessionDir?: string;
  outputPath?: string;
  llm?: CliLlmOptions;
  bestEffort: boolean;
  json: boolean;
}

export interface FollowUpCliCommand {
  kind: "follow_up";
  sessionDir: string;
  request: string;
  outputPath?: string;
  llm?: CliLlmOptions;
  bestEffort: boolean;
  json: boolean;
}

export interface HelpCliCommand {
  kind: "help";
}

export type CliCommand = EditCliCommand | FollowUpCliCommand | HelpCliCommand;

export interface CliRunRecord {
  run_id: string;
  created_at: string;
  command_kind: "edit" | "follow_up";
  user_request: string;
  result_kind: RequestCycleResult["result_kind"];
  run_directory: string;
  current_version_id: string;
  output_file?: string;
}

export interface CliSessionState {
  schema_version: "1.0.0";
  session_directory_version: "1";
  created_at: string;
  updated_at: string;
  session_id: string;
  workspace_root: string;
  asset: AudioAsset;
  current_version: AudioVersion;
  available_versions: AudioVersion[];
  session_graph: SessionGraph;
  runs: CliRunRecord[];
}

export interface CliJsonSummary {
  session_dir: string;
  run_dir: string;
  request: string;
  result_kind: RequestCycleResult["result_kind"];
  follow_up_source?: RequestCycleResult["followUpResolution"]["source"];
  output_file?: string;
  interpreted_request?: string;
  clarification_question?: string;
  plan_operations?: string[];
  comparison_summary?: {
    summary_text?: string;
    severe_regression_count: number;
    goal_statuses: Array<{
      goal: string;
      status: string;
    }>;
  };
}

export interface CliIoStreams {
  stdout?: {
    write(chunk: string): void;
  };
  stderr?: {
    write(chunk: string): void;
  };
}

export interface CliRuntimeOverrides {
  orchestrationDependencies?: Partial<OrchestrationDependencies>;
  now?: () => Date;
}

export interface RunCliOptions extends CliIoStreams, CliRuntimeOverrides {
  cwd?: string;
}

export interface CliExecutionResult {
  exitCode: number;
  summary?: CliJsonSummary;
}

export interface PersistRunArtifactsInput {
  sessionDir: string;
  runDir: string;
  request: string;
  result: RequestCycleResult;
  outputCopyPath?: string;
}

export interface UpdateCliSessionStateInput {
  previousState?: CliSessionState;
  workspaceRootRelative: string;
  runId: string;
  runDirectoryRelative: string;
  request: string;
  createdAt: string;
  result: RequestCycleResult;
  outputFileRelative?: string;
}

export type AppliedResult = AppliedOrRevertedRequestCycleResult;
