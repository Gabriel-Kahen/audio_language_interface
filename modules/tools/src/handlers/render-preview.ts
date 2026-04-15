import type { AudioVersion } from "@audio-language-interface/render";

import { createProvenanceMismatchError } from "../errors.js";
import type { ToolDefinition, ToolRequest } from "../types.js";
import {
  assertToolResultRenderArtifact,
  expectAudioVersion,
  expectOptionalNumber,
  expectOptionalPositiveInteger,
  expectOptionalString,
  expectRecord,
} from "../validation.js";

interface RenderPreviewArguments {
  audioVersion: AudioVersion;
  outputDir?: string;
  outputFileName?: string;
  renderId?: string;
  bitrate?: string;
  sampleRateHz?: number;
  channels?: number;
  loudnessSummary?: Record<string, number>;
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

function parseLoudnessSummary(value: unknown): Record<string, number> | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = expectRecord(value, "arguments.loudness_summary");
  const entries = Object.entries(record).map(([key, entryValue]) => [
    key,
    expectOptionalNumber(entryValue, `arguments.loudness_summary.${key}`),
  ]);

  return Object.fromEntries(entries.filter(([, entryValue]) => entryValue !== undefined)) as Record<
    string,
    number
  >;
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

function validateArguments(value: unknown, request: ToolRequest): RenderPreviewArguments {
  const record = expectRecord(value, "arguments");
  const audioVersion = expectAudioVersion(record.audio_version, "arguments.audio_version");
  const outputDir = expectOptionalString(record.output_dir, "arguments.output_dir");
  const outputFileName = expectOptionalString(
    record.output_file_name,
    "arguments.output_file_name",
  );
  const renderId = expectOptionalString(record.render_id, "arguments.render_id");
  const bitrate = expectOptionalString(record.bitrate, "arguments.bitrate");
  const sampleRateHz = expectOptionalPositiveInteger(
    record.sample_rate_hz,
    "arguments.sample_rate_hz",
  );
  const channels = expectOptionalPositiveInteger(record.channels, "arguments.channels");
  const loudnessSummary = parseLoudnessSummary(record.loudness_summary);

  validateVersionConsistency(request, audioVersion);

  return {
    audioVersion,
    ...(outputDir === undefined ? {} : { outputDir }),
    ...(outputFileName === undefined ? {} : { outputFileName }),
    ...(renderId === undefined ? {} : { renderId }),
    ...(bitrate === undefined ? {} : { bitrate }),
    ...(sampleRateHz === undefined ? {} : { sampleRateHz }),
    ...(channels === undefined ? {} : { channels }),
    ...(loudnessSummary === undefined ? {} : { loudnessSummary }),
  };
}

export const renderPreviewTool: ToolDefinition<RenderPreviewArguments, Record<string, unknown>> = {
  descriptor: {
    name: "render_preview",
    description: "Render an MP3 preview from one audio version.",
    backing_module: "render",
    required_arguments: ["audio_version"],
    optional_arguments: [
      "output_dir",
      "output_file_name",
      "render_id",
      "bitrate",
      "sample_rate_hz",
      "channels",
      "loudness_summary",
    ],
    error_codes: [
      "invalid_arguments",
      "provenance_mismatch",
      "invalid_result_contract",
      "handler_failed",
    ],
  },
  validateArguments,
  async execute(args, context) {
    const rendered = await context.runtime.renderPreview({
      workspaceRoot: context.workspaceRoot,
      version: args.audioVersion,
      ...(args.outputDir === undefined ? {} : { outputDir: args.outputDir }),
      ...(args.outputFileName === undefined ? {} : { outputFileName: args.outputFileName }),
      ...(args.renderId === undefined ? {} : { renderId: args.renderId }),
      ...(args.bitrate === undefined ? {} : { bitrate: args.bitrate }),
      ...(args.sampleRateHz === undefined ? {} : { sampleRateHz: args.sampleRateHz }),
      ...(args.channels === undefined ? {} : { channels: args.channels }),
      ...(args.loudnessSummary === undefined ? {} : { loudnessSummary: args.loudnessSummary }),
    });
    const artifact = assertToolResultRenderArtifact(rendered.artifact, "result.artifact");

    return {
      result: {
        artifact: artifact as unknown as Record<string, unknown>,
        command: toCommandShape(rendered.command),
      },
      ...(artifact.warnings === undefined || artifact.warnings.length === 0
        ? {}
        : { warnings: [...artifact.warnings] }),
    };
  },
};
