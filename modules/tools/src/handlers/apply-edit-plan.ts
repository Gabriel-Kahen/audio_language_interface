import {
  type AudioVersion,
  buildOperation,
  type EditPlan,
  type OperationName,
} from "@audio-language-interface/transforms";

import { createProvenanceMismatchError, ToolInputError } from "../errors.js";
import type { ToolDefinition, ToolRequest } from "../types.js";
import {
  assertToolResultAudioVersion,
  assertToolResultTransformRecord,
  expectAudioVersion,
  expectEditPlan,
  expectOptionalString,
  expectRecord,
} from "../validation.js";

interface ApplyEditPlanArguments {
  audioVersion: AudioVersion;
  editPlan: EditPlan;
  outputDir?: string;
  outputVersionId?: string;
  recordId?: string;
}

const SUPPORTED_EDIT_PLAN_OPERATIONS = new Set<OperationName>([
  "gain",
  "normalize",
  "trim",
  "fade",
  "pitch_shift",
  "parametric_eq",
  "high_pass_filter",
  "low_pass_filter",
  "compressor",
  "limiter",
  "reverse",
  "mono_sum",
  "channel_swap",
  "stereo_balance_correction",
  "stereo_width",
  "denoise",
]);

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

function validateArguments(value: unknown, request: ToolRequest): ApplyEditPlanArguments {
  const record = expectRecord(value, "arguments");
  const audioVersion = expectAudioVersion(record.audio_version, "arguments.audio_version");
  const editPlan = expectEditPlan(record.edit_plan, "arguments.edit_plan");
  const outputDir = expectOptionalString(record.output_dir, "arguments.output_dir");
  const outputVersionId = expectOptionalString(
    record.output_version_id,
    "arguments.output_version_id",
  );
  const recordId = expectOptionalString(record.record_id, "arguments.record_id");

  validateVersionConsistency(request, audioVersion);

  if (editPlan.asset_id !== audioVersion.asset_id) {
    throw createProvenanceMismatchError(
      "arguments.edit_plan.asset_id",
      "arguments.edit_plan.asset_id must match arguments.audio_version.asset_id.",
      {
        plan_asset_id: editPlan.asset_id,
        audio_version_asset_id: audioVersion.asset_id,
      },
    );
  }

  if (editPlan.version_id !== audioVersion.version_id) {
    throw createProvenanceMismatchError(
      "arguments.edit_plan.version_id",
      "arguments.edit_plan.version_id must match arguments.audio_version.version_id.",
      {
        plan_version_id: editPlan.version_id,
        audio_version_version_id: audioVersion.version_id,
      },
    );
  }

  let currentAudio = audioVersion.audio;
  for (const [index, step] of editPlan.steps.entries()) {
    try {
      const built = buildOperation(currentAudio, step.operation, step.parameters, step.target);
      currentAudio = built.nextAudio;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("only supports full_file")) {
        throw new ToolInputError(
          "invalid_arguments",
          `arguments.edit_plan.steps[${index}].target.scope must be 'full_file' for ${step.operation}.`,
          {
            field: `arguments.edit_plan.steps[${index}].target.scope`,
            operation: step.operation,
            required_scope: "full_file",
            received_scope: step.target.scope,
          },
        );
      }

      if (message.includes("requires stereo 2-channel audio")) {
        throw new ToolInputError(
          "invalid_arguments",
          `arguments.edit_plan.steps[${index}].operation '${step.operation}' requires stereo 2-channel audio.`,
          {
            field: `arguments.edit_plan.steps[${index}].operation`,
            operation: step.operation,
            required_channels: 2,
            received_channels: currentAudio.channels,
          },
        );
      }

      throw new ToolInputError("invalid_arguments", message, {
        field: "arguments.edit_plan",
        step_index: index,
        operation: step.operation,
      });
    }
  }

  return {
    audioVersion,
    editPlan,
    ...(outputDir === undefined ? {} : { outputDir }),
    ...(outputVersionId === undefined ? {} : { outputVersionId }),
    ...(recordId === undefined ? {} : { recordId }),
  };
}

export const applyEditPlanTool: ToolDefinition<ApplyEditPlanArguments, Record<string, unknown>> = {
  descriptor: {
    name: "apply_edit_plan",
    description: "Execute an explicit edit plan and return the new version.",
    backing_module: "transforms",
    required_arguments: ["audio_version", "edit_plan"],
    optional_arguments: ["output_dir", "output_version_id", "record_id"],
    error_codes: [
      "invalid_arguments",
      "provenance_mismatch",
      "invalid_result_contract",
      "handler_failed",
    ],
    capabilities: {
      supported_operations: [...SUPPORTED_EDIT_PLAN_OPERATIONS],
    },
  },
  validateArguments,
  async execute(args, context) {
    const applied = await context.runtime.applyEditPlan({
      workspaceRoot: context.workspaceRoot,
      version: args.audioVersion,
      plan: args.editPlan,
      ...(args.outputDir === undefined ? {} : { outputDir: args.outputDir }),
      ...(args.outputVersionId === undefined ? {} : { outputVersionId: args.outputVersionId }),
      ...(args.recordId === undefined ? {} : { recordId: args.recordId }),
    });
    const outputVersion = assertToolResultAudioVersion(
      applied.outputVersion,
      "result.output_version",
    );
    const transformRecord = assertToolResultTransformRecord(
      applied.transformRecord,
      "result.transform_record",
    );

    return {
      result: {
        output_version: outputVersion as unknown as Record<string, unknown>,
        transform_record: transformRecord as unknown as Record<string, unknown>,
        commands: applied.commands.map(toCommandShape),
      },
      ...(applied.warnings.length === 0 ? {} : { warnings: [...applied.warnings] }),
    };
  },
};
