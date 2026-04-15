import type { AudioVersion, EditPlan, OperationName } from "@audio-language-interface/transforms";

import { ToolInputError } from "../errors.js";
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
  "parametric_eq",
  "high_pass_filter",
  "low_pass_filter",
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
    throw new ToolInputError(
      "invalid_arguments",
      "Request asset_id does not match arguments.audio_version.asset_id.",
    );
  }

  if (request.version_id !== undefined && request.version_id !== audioVersion.version_id) {
    throw new ToolInputError(
      "invalid_arguments",
      "Request version_id does not match arguments.audio_version.version_id.",
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
    throw new ToolInputError(
      "invalid_arguments",
      "arguments.edit_plan.asset_id must match arguments.audio_version.asset_id.",
      { field: "arguments.edit_plan.asset_id" },
    );
  }

  if (editPlan.version_id !== audioVersion.version_id) {
    throw new ToolInputError(
      "invalid_arguments",
      "arguments.edit_plan.version_id must match arguments.audio_version.version_id.",
      { field: "arguments.edit_plan.version_id" },
    );
  }

  for (const [index, step] of editPlan.steps.entries()) {
    if (!SUPPORTED_EDIT_PLAN_OPERATIONS.has(step.operation)) {
      throw new ToolInputError(
        "invalid_arguments",
        `arguments.edit_plan.steps[${index}].operation '${step.operation}' is not supported by apply_edit_plan.`,
        {
          field: `arguments.edit_plan.steps[${index}].operation`,
          supported_operations: [...SUPPORTED_EDIT_PLAN_OPERATIONS],
        },
      );
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
