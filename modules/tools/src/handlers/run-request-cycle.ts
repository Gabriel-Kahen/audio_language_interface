import type { AudioAsset, AudioVersion, NormalizationTarget } from "@audio-language-interface/io";
import {
  type AppliedOrRevertedRequestCycleResult,
  defaultOrchestrationDependencies,
  type LlmAssistedInterpretationOptions,
  type LlmInterpretationProviderConfig,
  OrchestrationStageError,
  type RequestCycleResult,
} from "@audio-language-interface/orchestration";

import { createProvenanceMismatchError, ToolInputError } from "../errors.js";
import type { ToolDefinition, ToolRequest } from "../types.js";
import {
  assertToolResultAnalysisReport,
  assertToolResultAudioAsset,
  assertToolResultAudioVersion,
  assertToolResultComparisonReport,
  assertToolResultEditPlan,
  assertToolResultRenderArtifact,
  assertToolResultSemanticProfile,
  assertToolResultSessionGraph,
  assertToolResultTransformRecord,
  expectArray,
  expectAudioAsset,
  expectAudioVersion,
  expectOptionalBoolean,
  expectOptionalNumber,
  expectOptionalString,
  expectOptionalStringArray,
  expectRecord,
  expectSessionGraph,
  expectString,
} from "../validation.js";

interface RunRequestCycleImportInputArguments {
  kind: "import";
  inputPath: string;
  importOptions?: RunRequestCycleImportOptions;
}

interface RunRequestCycleImportOptions {
  outputDirectory?: string;
  normalizationTarget?: NormalizationTarget;
  tags?: string[];
  notes?: string;
  importedAt?: string;
}

interface RunRequestCycleExistingInputArguments {
  kind: "existing";
  asset: AudioAsset;
  audioVersion: AudioVersion;
  sessionGraph: import("@audio-language-interface/history").SessionGraph;
  availableVersions?: AudioVersion[];
}

type RunRequestCycleInputArguments =
  | RunRequestCycleImportInputArguments
  | RunRequestCycleExistingInputArguments;

interface RunRequestCycleArguments {
  userRequest: string;
  input: RunRequestCycleInputArguments;
  renderKind?: "preview" | "final";
  revisionEnabled?: boolean;
  interpretation?: LlmAssistedInterpretationOptions;
}

function parseNormalizationTarget(
  value: unknown,
  fieldName: string,
): NormalizationTarget | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = expectRecord(value, fieldName);
  const containerFormat = expectString(record.container_format, `${fieldName}.container_format`);
  if (containerFormat !== "wav") {
    throw new ToolInputError(
      "invalid_arguments",
      `${fieldName}.container_format must be 'wav' for the current tool surface.`,
      {
        field: `${fieldName}.container_format`,
      },
    );
  }

  const codec = expectString(record.codec, `${fieldName}.codec`);
  if (codec !== "pcm_s16le" && codec !== "pcm_s24le" && codec !== "pcm_f32le") {
    throw new ToolInputError(
      "invalid_arguments",
      `${fieldName}.codec must be one of pcm_s16le, pcm_s24le, or pcm_f32le.`,
      {
        field: `${fieldName}.codec`,
      },
    );
  }

  return {
    containerFormat,
    codec,
    sampleRateHz: expectPositiveIntegerLike(record.sample_rate_hz, `${fieldName}.sample_rate_hz`),
    channels: expectPositiveIntegerLike(record.channels, `${fieldName}.channels`),
  };
}

function expectPositiveIntegerLike(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  throw new ToolInputError("invalid_arguments", `${fieldName} must be a positive integer.`, {
    field: fieldName,
  });
}

function parseImportOptions(value: unknown): RunRequestCycleImportOptions {
  if (value === undefined) {
    return {};
  }

  const record = expectRecord(value, "arguments.input.import_options");
  const outputDirectory = expectOptionalString(
    record.output_directory,
    "arguments.input.import_options.output_directory",
  );
  const normalizationTarget = parseNormalizationTarget(
    record.normalization_target,
    "arguments.input.import_options.normalization_target",
  );
  const tags = expectOptionalStringArray(record.tags, "arguments.input.import_options.tags");
  const notes = expectOptionalString(record.notes, "arguments.input.import_options.notes");
  const importedAt = expectOptionalString(
    record.imported_at,
    "arguments.input.import_options.imported_at",
  );

  return {
    ...(outputDirectory === undefined ? {} : { outputDirectory }),
    ...(normalizationTarget === undefined ? {} : { normalizationTarget }),
    ...(tags === undefined ? {} : { tags }),
    ...(notes === undefined ? {} : { notes }),
    ...(importedAt === undefined ? {} : { importedAt }),
  };
}

function parseInput(value: unknown, request: ToolRequest): RunRequestCycleInputArguments {
  const record = expectRecord(value, "arguments.input");
  const kind = expectString(record.kind, "arguments.input.kind");

  if (kind === "import") {
    if (request.asset_id !== undefined || request.version_id !== undefined) {
      throw new ToolInputError(
        "invalid_arguments",
        "Import request-cycle inputs must not include request.asset_id or request.version_id before the first version is materialized.",
        {
          field: "request",
          input_kind: "import",
        },
      );
    }

    return {
      kind: "import",
      inputPath: expectString(record.input_path, "arguments.input.input_path"),
      ...(record.import_options === undefined
        ? {}
        : { importOptions: parseImportOptions(record.import_options) }),
    };
  }

  if (kind !== "existing") {
    throw new ToolInputError(
      "invalid_arguments",
      "arguments.input.kind must be either 'import' or 'existing'.",
      {
        field: "arguments.input.kind",
      },
    );
  }

  const asset = expectAudioAsset(record.asset, "arguments.input.asset");
  const audioVersion = expectAudioVersion(record.audio_version, "arguments.input.audio_version");
  const sessionGraph = expectSessionGraph(record.session_graph, "arguments.input.session_graph");
  const availableVersions = record.available_versions
    ? expectArray(record.available_versions, "arguments.input.available_versions").map(
        (entry, index) => expectAudioVersion(entry, `arguments.input.available_versions[${index}]`),
      )
    : undefined;

  validateExistingInputConsistency(request, asset, audioVersion, sessionGraph, availableVersions);

  return {
    kind: "existing",
    asset,
    audioVersion,
    sessionGraph,
    ...(availableVersions === undefined ? {} : { availableVersions }),
  };
}

function validateExistingInputConsistency(
  request: ToolRequest,
  asset: AudioAsset,
  audioVersion: AudioVersion,
  sessionGraph: import("@audio-language-interface/history").SessionGraph,
  availableVersions: AudioVersion[] | undefined,
): void {
  if (audioVersion.asset_id !== asset.asset_id) {
    throw createProvenanceMismatchError(
      "arguments.input.audio_version.asset_id",
      "arguments.input.audio_version.asset_id must match arguments.input.asset.asset_id.",
      {
        asset_id: asset.asset_id,
        audio_version_asset_id: audioVersion.asset_id,
      },
    );
  }

  if (request.asset_id !== undefined && request.asset_id !== asset.asset_id) {
    throw createProvenanceMismatchError(
      "request.asset_id",
      "Request asset_id does not match arguments.input.asset.asset_id.",
      {
        request_asset_id: request.asset_id,
        argument_asset_id: asset.asset_id,
      },
    );
  }

  if (request.version_id !== undefined && request.version_id !== audioVersion.version_id) {
    throw createProvenanceMismatchError(
      "request.version_id",
      "Request version_id does not match arguments.input.audio_version.version_id.",
      {
        request_version_id: request.version_id,
        argument_version_id: audioVersion.version_id,
      },
    );
  }

  if (request.session_id !== undefined && request.session_id !== sessionGraph.session_id) {
    throw createProvenanceMismatchError(
      "request.session_id",
      "Request session_id does not match arguments.input.session_graph.session_id.",
      {
        request_session_id: request.session_id,
        argument_session_id: sessionGraph.session_id,
      },
    );
  }

  if (sessionGraph.active_refs.asset_id !== asset.asset_id) {
    throw createProvenanceMismatchError(
      "arguments.input.session_graph.active_refs.asset_id",
      "arguments.input.session_graph.active_refs.asset_id must match arguments.input.asset.asset_id.",
      {
        session_graph_asset_id: sessionGraph.active_refs.asset_id,
        asset_id: asset.asset_id,
      },
    );
  }

  if (sessionGraph.active_refs.version_id !== audioVersion.version_id) {
    throw createProvenanceMismatchError(
      "arguments.input.session_graph.active_refs.version_id",
      "arguments.input.session_graph.active_refs.version_id must match arguments.input.audio_version.version_id.",
      {
        session_graph_version_id: sessionGraph.active_refs.version_id,
        audio_version_id: audioVersion.version_id,
      },
    );
  }

  if (!availableVersions) {
    return;
  }

  const seenVersionIds = new Set<string>();
  for (const [index, version] of availableVersions.entries()) {
    if (version.asset_id !== asset.asset_id) {
      throw createProvenanceMismatchError(
        `arguments.input.available_versions[${index}].asset_id`,
        "Every arguments.input.available_versions entry must belong to the current asset.",
        {
          asset_id: asset.asset_id,
          available_version_asset_id: version.asset_id,
          version_id: version.version_id,
        },
      );
    }

    if (seenVersionIds.has(version.version_id)) {
      throw new ToolInputError(
        "invalid_arguments",
        "arguments.input.available_versions must not contain duplicate version ids.",
        {
          field: "arguments.input.available_versions",
          version_id: version.version_id,
        },
      );
    }

    seenVersionIds.add(version.version_id);
  }
}

function parseInterpretationProvider(
  value: unknown,
  fieldName: string,
): LlmInterpretationProviderConfig {
  const record = expectRecord(value, fieldName);
  const kind = expectString(record.kind, `${fieldName}.kind`);
  if (kind !== "openai" && kind !== "google" && kind !== "codex_cli") {
    throw new ToolInputError(
      "invalid_arguments",
      `${fieldName}.kind must be one of 'openai', 'google', or 'codex_cli'.`,
      {
        field: `${fieldName}.kind`,
      },
    );
  }
  const timeoutMs = expectOptionalNumber(record.timeout_ms, `${fieldName}.timeout_ms`);
  const maxRetries = expectOptionalNumber(record.max_retries, `${fieldName}.max_retries`);

  if (kind === "codex_cli") {
    const model = expectOptionalString(record.model, `${fieldName}.model`);
    const codexPath = expectOptionalString(record.codex_path, `${fieldName}.codex_path`);
    const profile = expectOptionalString(record.profile, `${fieldName}.profile`);

    return {
      kind: "codex_cli",
      ...(model === undefined ? {} : { model }),
      ...(codexPath === undefined ? {} : { codexPath }),
      ...(profile === undefined ? {} : { profile }),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      ...(maxRetries === undefined ? {} : { maxRetries }),
    };
  }

  const model = expectString(record.model, `${fieldName}.model`);
  const apiBaseUrl = expectOptionalString(record.api_base_url, `${fieldName}.api_base_url`);
  const temperature = expectOptionalNumber(record.temperature, `${fieldName}.temperature`);

  return {
    kind,
    model,
    ...(apiBaseUrl === undefined ? {} : { apiBaseUrl }),
    ...(temperature === undefined ? {} : { temperature }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(maxRetries === undefined ? {} : { maxRetries }),
  };
}

function parseInterpretationPolicy(
  value: unknown,
  fieldName: string,
): NonNullable<LlmAssistedInterpretationOptions["policy"]> {
  const policy = expectString(value, fieldName);
  if (policy !== "conservative" && policy !== "best_effort") {
    throw new ToolInputError(
      "invalid_arguments",
      `${fieldName} must be either 'conservative' or 'best_effort'.`,
      {
        field: fieldName,
      },
    );
  }

  return policy;
}

function parseInterpretation(value: unknown): LlmAssistedInterpretationOptions | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = expectRecord(value, "arguments.interpretation");
  const mode = expectString(record.mode, "arguments.interpretation.mode");
  if (mode !== "llm_assisted") {
    throw new ToolInputError(
      "invalid_arguments",
      "arguments.interpretation.mode must be 'llm_assisted'.",
      {
        field: "arguments.interpretation.mode",
      },
    );
  }

  const provider = parseInterpretationProvider(
    record.provider,
    "arguments.interpretation.provider",
  );
  const apiKey =
    provider.kind === "codex_cli"
      ? undefined
      : expectString(record.api_key, "arguments.interpretation.api_key");

  return {
    mode: "llm_assisted",
    ...(apiKey === undefined ? {} : { apiKey }),
    provider,
    ...(record.policy === undefined
      ? {}
      : {
          policy: parseInterpretationPolicy(record.policy, "arguments.interpretation.policy"),
        }),
    ...(record.prompt_version === undefined
      ? {}
      : {
          promptVersion: expectString(
            record.prompt_version,
            "arguments.interpretation.prompt_version",
          ),
        }),
  };
}

function validateArguments(value: unknown, request: ToolRequest): RunRequestCycleArguments {
  const record = expectRecord(value, "arguments");
  const userRequest = expectString(record.user_request, "arguments.user_request");
  const input = parseInput(record.input, request);
  const renderKind = expectOptionalString(record.render_kind, "arguments.render_kind");
  const interpretation = parseInterpretation(record.interpretation);
  const revision =
    record.revision === undefined ? undefined : expectRecord(record.revision, "arguments.revision");
  const revisionEnabled = expectOptionalBoolean(revision?.enabled, "arguments.revision.enabled");

  if (renderKind !== undefined && renderKind !== "preview" && renderKind !== "final") {
    throw new ToolInputError(
      "invalid_arguments",
      "arguments.render_kind must be either 'preview' or 'final'.",
      {
        field: "arguments.render_kind",
      },
    );
  }

  return {
    userRequest,
    input,
    ...(renderKind === undefined ? {} : { renderKind }),
    ...(interpretation === undefined ? {} : { interpretation }),
    ...(revisionEnabled === undefined ? {} : { revisionEnabled }),
  };
}

function toCommandShape(command: {
  executable: string;
  args: string[];
  outputPath: string;
}): Record<string, unknown> {
  return {
    executable: command.executable,
    args: [...command.args],
    output_path: command.outputPath,
  };
}

function toFollowUpResolutionShape(
  resolution: RequestCycleResult["followUpResolution"],
): Record<string, unknown> {
  if (resolution.kind === "apply") {
    return {
      kind: "apply",
      resolved_user_request: resolution.resolvedUserRequest,
      source: resolution.source,
      ...(resolution.inputVersionId === undefined
        ? {}
        : { input_version_id: resolution.inputVersionId }),
      ...(resolution.branchId === undefined ? {} : { branch_id: resolution.branchId }),
    };
  }

  return {
    kind: "revert",
    target_version_id: resolution.targetVersionId,
    source: resolution.source,
  };
}

function toTraceShape(trace: RequestCycleResult["trace"]): Record<string, unknown>[] {
  return trace.map((entry) => ({
    stage: entry.stage,
    status: entry.status,
    started_at: entry.started_at,
    completed_at: entry.completed_at,
    attempts: entry.attempts,
    ...(entry.pass === undefined ? {} : { pass: entry.pass }),
    ...(entry.message === undefined ? {} : { message: entry.message }),
  }));
}

function toRevisionShape(
  revision: AppliedOrRevertedRequestCycleResult["revision"],
): Record<string, unknown> | undefined {
  if (!revision) {
    return undefined;
  }

  return {
    should_revise: revision.shouldRevise,
    rationale: revision.rationale,
    source: revision.source,
  };
}

function toIterationShape(
  iterations: AppliedOrRevertedRequestCycleResult["iterations"],
): Record<string, unknown>[] | undefined {
  if (!iterations || iterations.length === 0) {
    return undefined;
  }

  return iterations.map((iteration) => ({
    iteration: iteration.iteration,
    input_version: iteration.inputVersion as unknown as Record<string, unknown>,
    output_version: iteration.outputVersion as unknown as Record<string, unknown>,
    input_analysis: iteration.inputAnalysis as unknown as Record<string, unknown>,
    output_analysis: iteration.outputAnalysis as unknown as Record<string, unknown>,
    ...(iteration.semanticProfile === undefined
      ? {}
      : { semantic_profile: iteration.semanticProfile as unknown as Record<string, unknown> }),
    ...(iteration.intentInterpretation === undefined
      ? {}
      : {
          intent_interpretation: iteration.intentInterpretation as unknown as Record<
            string,
            unknown
          >,
        }),
    edit_plan: iteration.editPlan as unknown as Record<string, unknown>,
    comparison_report: iteration.comparisonReport as unknown as Record<string, unknown>,
    transform_record: iteration.transformResult.transformRecord as unknown as Record<
      string,
      unknown
    >,
    commands: iteration.transformResult.commands.map(toCommandShape),
  }));
}

function buildVersionResolver(
  input: RunRequestCycleExistingInputArguments,
): NonNullable<typeof defaultOrchestrationDependencies.getAudioVersionById> {
  const versionStore = new Map<string, AudioVersion>();

  versionStore.set(input.audioVersion.version_id, input.audioVersion);
  for (const version of input.availableVersions ?? []) {
    versionStore.set(version.version_id, version);
  }

  return async ({ asset, versionId }) => {
    const resolved = versionStore.get(versionId);
    if (!resolved) {
      throw new ToolInputError(
        "invalid_arguments",
        `Historical AudioVersion '${versionId}' is not available in arguments.input.available_versions.`,
        {
          field: "arguments.input.available_versions",
          version_id: versionId,
          asset_id: asset.asset_id,
        },
      );
    }

    return resolved;
  };
}

function normalizeOrchestrationError(error: unknown, userRequest: string): never {
  if (error instanceof OrchestrationStageError) {
    if (error.cause instanceof ToolInputError) {
      throw error.cause;
    }

    if (
      error.stage === "resolve_follow_up" ||
      error.stage === "load_follow_up_input" ||
      error.stage === "load_revert_target"
    ) {
      throw new ToolInputError("invalid_arguments", error.message, {
        field: "arguments.input",
        stage: error.stage,
        user_request: userRequest,
        ...(error.partialResult === undefined ? {} : { partial_result: error.partialResult }),
      });
    }
  }

  throw error;
}

function buildToolResult(result: RequestCycleResult): Record<string, unknown> {
  if (result.result_kind === "clarification_required") {
    return {
      result_kind: result.result_kind,
      asset: assertToolResultAudioAsset(result.asset, "result.asset") as unknown as Record<
        string,
        unknown
      >,
      input_version: assertToolResultAudioVersion(
        result.inputVersion,
        "result.input_version",
      ) as unknown as Record<string, unknown>,
      input_analysis: assertToolResultAnalysisReport(
        result.inputAnalysis,
        "result.input_analysis",
      ) as unknown as Record<string, unknown>,
      follow_up_resolution: toFollowUpResolutionShape(result.followUpResolution),
      ...(result.semanticProfile === undefined
        ? {}
        : {
            semantic_profile: assertToolResultSemanticProfile(
              result.semanticProfile,
              "result.semantic_profile",
            ) as unknown as Record<string, unknown>,
          }),
      ...(result.intentInterpretation === undefined
        ? {}
        : {
            intent_interpretation: result.intentInterpretation as unknown as Record<
              string,
              unknown
            >,
          }),
      clarification: {
        question: result.clarification.question,
        pending_clarification: result.clarification.pendingClarification as unknown as Record<
          string,
          unknown
        >,
      },
      session_graph: assertToolResultSessionGraph(
        result.sessionGraph,
        "result.session_graph",
      ) as unknown as Record<string, unknown>,
      trace: toTraceShape(result.trace),
    };
  }

  const topLevelTransformRecord = result.transformResult
    ? assertToolResultTransformRecord(
        result.transformResult.transformRecord,
        "result.transform_record",
      )
    : undefined;

  return {
    result_kind: result.result_kind,
    asset: assertToolResultAudioAsset(result.asset, "result.asset") as unknown as Record<
      string,
      unknown
    >,
    input_version: assertToolResultAudioVersion(
      result.inputVersion,
      "result.input_version",
    ) as unknown as Record<string, unknown>,
    input_analysis: assertToolResultAnalysisReport(
      result.inputAnalysis,
      "result.input_analysis",
    ) as unknown as Record<string, unknown>,
    follow_up_resolution: toFollowUpResolutionShape(result.followUpResolution),
    ...(result.semanticProfile === undefined
      ? {}
      : {
          semantic_profile: assertToolResultSemanticProfile(
            result.semanticProfile,
            "result.semantic_profile",
          ) as unknown as Record<string, unknown>,
        }),
    ...(result.intentInterpretation === undefined
      ? {}
      : {
          intent_interpretation: result.intentInterpretation as unknown as Record<string, unknown>,
        }),
    ...(result.editPlan === undefined
      ? {}
      : {
          edit_plan: assertToolResultEditPlan(
            result.editPlan,
            "result.edit_plan",
          ) as unknown as Record<string, unknown>,
        }),
    output_version: assertToolResultAudioVersion(
      result.outputVersion,
      "result.output_version",
    ) as unknown as Record<string, unknown>,
    ...(topLevelTransformRecord === undefined
      ? {}
      : {
          transform_record: topLevelTransformRecord as unknown as Record<string, unknown>,
          commands: result.transformResult?.commands.map(toCommandShape) ?? [],
        }),
    output_analysis: assertToolResultAnalysisReport(
      result.outputAnalysis,
      "result.output_analysis",
    ) as unknown as Record<string, unknown>,
    version_comparison_report: assertToolResultComparisonReport(
      result.versionComparisonReport,
      "result.version_comparison_report",
    ) as unknown as Record<string, unknown>,
    baseline_render: assertToolResultRenderArtifact(
      result.baselineRender,
      "result.baseline_render",
    ) as unknown as Record<string, unknown>,
    candidate_render: assertToolResultRenderArtifact(
      result.candidateRender,
      "result.candidate_render",
    ) as unknown as Record<string, unknown>,
    render_comparison_report: assertToolResultComparisonReport(
      result.renderComparisonReport,
      "result.render_comparison_report",
    ) as unknown as Record<string, unknown>,
    comparison_report: assertToolResultComparisonReport(
      result.comparisonReport,
      "result.comparison_report",
    ) as unknown as Record<string, unknown>,
    session_graph: assertToolResultSessionGraph(
      result.sessionGraph,
      "result.session_graph",
    ) as unknown as Record<string, unknown>,
    trace: toTraceShape(result.trace),
    ...(toRevisionShape(result.revision) === undefined
      ? {}
      : { revision: toRevisionShape(result.revision) }),
    ...(toIterationShape(result.iterations) === undefined
      ? {}
      : { iterations: toIterationShape(result.iterations) }),
  };
}

export const runRequestCycleTool: ToolDefinition<
  RunRequestCycleArguments,
  Record<string, unknown>
> = {
  descriptor: {
    name: "run_request_cycle",
    description:
      "Run the full orchestration editing cycle, including explicit session-aware follow-up requests.",
    backing_module: "orchestration",
    required_arguments: ["user_request", "input"],
    optional_arguments: ["render_kind", "interpretation", "revision"],
    error_codes: [
      "invalid_arguments",
      "provenance_mismatch",
      "invalid_result_contract",
      "handler_failed",
    ],
  },
  validateArguments,
  async execute(args, context) {
    try {
      const dependencies =
        args.input.kind === "existing"
          ? {
              ...defaultOrchestrationDependencies,
              ...(context.runtime.interpretRequest === undefined
                ? {}
                : { interpretRequest: context.runtime.interpretRequest }),
              getAudioVersionById: buildVersionResolver(args.input),
            }
          : {
              ...defaultOrchestrationDependencies,
              ...(context.runtime.interpretRequest === undefined
                ? {}
                : { interpretRequest: context.runtime.interpretRequest }),
            };

      const result = await context.runtime.runRequestCycle({
        workspaceRoot: context.workspaceRoot,
        userRequest: args.userRequest,
        input:
          args.input.kind === "import"
            ? {
                kind: "import",
                inputPath: args.input.inputPath,
                ...(args.input.importOptions === undefined
                  ? {}
                  : { importOptions: args.input.importOptions }),
              }
            : {
                kind: "existing",
                asset: args.input.asset,
                version: args.input.audioVersion,
                sessionGraph: args.input.sessionGraph,
              },
        ...(args.renderKind === undefined ? {} : { renderKind: args.renderKind }),
        ...(args.interpretation === undefined ? {} : { interpretation: args.interpretation }),
        ...(args.revisionEnabled === undefined
          ? {}
          : { revision: { enabled: args.revisionEnabled } }),
        ...(context.request.session_id === undefined
          ? {}
          : { sessionId: context.request.session_id }),
        dependencies,
      });

      return {
        result: buildToolResult(result),
      };
    } catch (error) {
      normalizeOrchestrationError(error, args.userRequest);
    }
  },
};
