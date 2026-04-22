import {
  defaultRuntimeCapabilityManifest,
  type RuntimeCapabilityManifest,
} from "@audio-language-interface/capabilities";
import type { AudioVersion } from "@audio-language-interface/core";
import type { IntentInterpretation } from "@audio-language-interface/interpretation";
import type { AnalysisReport } from "@audio-language-interface/planning";
import type { SemanticProfile } from "@audio-language-interface/semantics";

import { createProvenanceMismatchError } from "../errors.js";
import type { ToolDefinition, ToolRequest } from "../types.js";
import {
  assertToolResultIntentInterpretation,
  expectAnalysisReport,
  expectAudioVersion,
  expectOptionalString,
  expectRecord,
  expectRuntimeCapabilityManifest,
  expectSemanticProfile,
  expectString,
} from "../validation.js";

interface InterpretRequestProviderArguments {
  kind: "openai" | "google";
  apiKey: string;
  model: string;
  apiBaseUrl?: string;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

interface InterpretRequestArguments {
  audioVersion: AudioVersion;
  analysisReport: AnalysisReport;
  semanticProfile: SemanticProfile;
  userRequest: string;
  provider: InterpretRequestProviderArguments;
  capabilityManifest?: RuntimeCapabilityManifest;
  promptVersion?: string;
  sessionContext?: {
    currentVersionId?: string;
    previousRequest?: string;
    originalUserRequest?: string;
    followUpSource?:
      | "direct_request"
      | "repeat_last_request"
      | "less"
      | "undo"
      | "revert"
      | "try_another_version";
  };
}

function validateVersionConsistency(request: ToolRequest, audioVersion: AudioVersion): void {
  if (request.asset_id !== undefined && request.asset_id !== audioVersion.asset_id) {
    throw createProvenanceMismatchError(
      "request.asset_id",
      "Request asset_id does not match arguments.audio_version.asset_id.",
      {
        request_asset_id: request.asset_id,
        argument_asset_id: audioVersion.asset_id,
      },
    );
  }

  if (request.version_id !== undefined && request.version_id !== audioVersion.version_id) {
    throw createProvenanceMismatchError(
      "request.version_id",
      "Request version_id does not match arguments.audio_version.version_id.",
      {
        request_version_id: request.version_id,
        argument_version_id: audioVersion.version_id,
      },
    );
  }
}

function parseProvider(value: unknown): InterpretRequestProviderArguments {
  const record = expectRecord(value, "arguments.provider");
  const kind = expectString(record.kind, "arguments.provider.kind");
  if (kind !== "openai" && kind !== "google") {
    throw new Error("arguments.provider.kind must be either 'openai' or 'google'.");
  }

  const apiKey = expectString(record.api_key, "arguments.provider.api_key");
  const model = expectString(record.model, "arguments.provider.model");
  const apiBaseUrl = expectOptionalString(record.api_base_url, "arguments.provider.api_base_url");
  const temperatureValue = record.temperature;
  const timeoutValue = record.timeout_ms;
  const maxRetriesValue = record.max_retries;

  return {
    kind,
    apiKey,
    model,
    ...(typeof apiBaseUrl === "string" ? { apiBaseUrl } : {}),
    ...(typeof temperatureValue === "number" ? { temperature: temperatureValue } : {}),
    ...(typeof timeoutValue === "number" ? { timeoutMs: timeoutValue } : {}),
    ...(typeof maxRetriesValue === "number" ? { maxRetries: maxRetriesValue } : {}),
  };
}

function validateArguments(value: unknown, request: ToolRequest): InterpretRequestArguments {
  const record = expectRecord(value, "arguments");
  const audioVersion = expectAudioVersion(record.audio_version, "arguments.audio_version");
  const analysisReport = expectAnalysisReport(record.analysis_report, "arguments.analysis_report");
  const semanticProfile = expectSemanticProfile(
    record.semantic_profile,
    "arguments.semantic_profile",
  );
  const userRequest = expectString(record.user_request, "arguments.user_request");
  const provider = parseProvider(record.provider);
  const capabilityManifest =
    record.capability_manifest === undefined
      ? undefined
      : expectRuntimeCapabilityManifest(
          record.capability_manifest,
          "arguments.capability_manifest",
        );
  const promptVersion = expectOptionalString(record.prompt_version, "arguments.prompt_version");
  const sessionContextRecord =
    record.session_context === undefined
      ? undefined
      : expectRecord(record.session_context, "arguments.session_context");
  let sessionContext: InterpretRequestArguments["sessionContext"] | undefined;

  validateVersionConsistency(request, audioVersion);

  if (sessionContextRecord !== undefined) {
    const parsedSessionContext: NonNullable<InterpretRequestArguments["sessionContext"]> = {};

    if (sessionContextRecord.current_version_id !== undefined) {
      parsedSessionContext.currentVersionId = expectString(
        sessionContextRecord.current_version_id,
        "arguments.session_context.current_version_id",
      );
    }

    if (sessionContextRecord.previous_request !== undefined) {
      parsedSessionContext.previousRequest = expectString(
        sessionContextRecord.previous_request,
        "arguments.session_context.previous_request",
      );
    }

    if (sessionContextRecord.original_user_request !== undefined) {
      parsedSessionContext.originalUserRequest = expectString(
        sessionContextRecord.original_user_request,
        "arguments.session_context.original_user_request",
      );
    }

    if (sessionContextRecord.follow_up_source !== undefined) {
      parsedSessionContext.followUpSource = expectString(
        sessionContextRecord.follow_up_source,
        "arguments.session_context.follow_up_source",
      ) as Exclude<
        NonNullable<InterpretRequestArguments["sessionContext"]>["followUpSource"],
        undefined
      >;
    }

    sessionContext = parsedSessionContext;
  }

  return {
    audioVersion,
    analysisReport,
    semanticProfile,
    userRequest,
    provider,
    ...(capabilityManifest === undefined ? {} : { capabilityManifest }),
    ...(promptVersion === undefined ? {} : { promptVersion }),
    ...(sessionContext === undefined ? {} : { sessionContext }),
  };
}

export const interpretRequestTool: ToolDefinition<
  InterpretRequestArguments,
  Record<string, unknown>
> = {
  descriptor: {
    name: "interpret_request",
    description:
      "Use an explicit LLM provider to normalize a raw user request into an IntentInterpretation artifact.",
    backing_module: "interpretation",
    required_arguments: [
      "audio_version",
      "analysis_report",
      "semantic_profile",
      "user_request",
      "provider",
    ],
    optional_arguments: ["capability_manifest", "prompt_version", "session_context"],
    error_codes: [
      "invalid_arguments",
      "provenance_mismatch",
      "invalid_result_contract",
      "handler_failed",
    ],
  },
  validateArguments,
  async execute(args, context) {
    const interpretation = await context.runtime.interpretRequest({
      userRequest: args.userRequest,
      audioVersion: args.audioVersion,
      analysisReport: args.analysisReport,
      semanticProfile: args.semanticProfile,
      capabilityManifest: args.capabilityManifest ?? defaultRuntimeCapabilityManifest,
      provider: {
        kind: args.provider.kind,
        apiKey: args.provider.apiKey,
        model: args.provider.model,
        ...(args.provider.apiBaseUrl === undefined ? {} : { baseUrl: args.provider.apiBaseUrl }),
        ...(args.provider.temperature === undefined
          ? {}
          : { temperature: args.provider.temperature }),
        ...(args.provider.timeoutMs === undefined ? {} : { timeoutMs: args.provider.timeoutMs }),
        ...(args.provider.maxRetries === undefined ? {} : { maxRetries: args.provider.maxRetries }),
      },
      ...(args.sessionContext === undefined
        ? {}
        : {
            sessionContext: {
              ...(args.sessionContext.currentVersionId === undefined
                ? {}
                : { current_version_id: args.sessionContext.currentVersionId }),
              ...(args.sessionContext.previousRequest === undefined
                ? {}
                : { previous_request: args.sessionContext.previousRequest }),
              ...(args.sessionContext.originalUserRequest === undefined
                ? {}
                : { original_user_request: args.sessionContext.originalUserRequest }),
              ...(args.sessionContext.followUpSource === undefined
                ? {}
                : { follow_up_source: args.sessionContext.followUpSource }),
            },
          }),
      ...(args.promptVersion === undefined ? {} : { promptVersion: args.promptVersion }),
    });

    return {
      result: {
        intent_interpretation: assertToolResultIntentInterpretation(
          interpretation satisfies IntentInterpretation,
          "result.intent_interpretation",
        ) as unknown as Record<string, unknown>,
      },
    };
  },
};
