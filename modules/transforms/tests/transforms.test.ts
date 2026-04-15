import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";
import { afterEach, describe, expect, it } from "vitest";

import audioVersionSchema from "../../../contracts/schemas/json/audio-version.schema.json" with {
  type: "json",
};
import commonSchema from "../../../contracts/schemas/json/common.schema.json" with { type: "json" };
import transformRecordSchema from "../../../contracts/schemas/json/transform-record.schema.json" with {
  type: "json",
};
import {
  type AudioVersion,
  applyEditPlan,
  applyOperation,
  buildFfmpegTransformCommand,
  buildOperation,
  type EditPlan,
  type FfmpegCommand,
  type FfmpegExecutionResult,
  resolveTransformOutputPath,
} from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dirPath) => rm(dirPath, { recursive: true, force: true })),
  );
});

describe("buildFfmpegTransformCommand", () => {
  it("builds an explicit ffmpeg command", () => {
    expect(
      buildFfmpegTransformCommand({
        inputPath: "/tmp/input.wav",
        outputPath: "/tmp/output.wav",
        sampleRateHz: 44100,
        channels: 2,
        filterChain: "volume=3dB",
      }),
    ).toEqual({
      executable: "ffmpeg",
      args: [
        "-y",
        "-i",
        "/tmp/input.wav",
        "-vn",
        "-sn",
        "-dn",
        "-map_metadata",
        "-1",
        "-af",
        "volume=3dB",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-c:a",
        "pcm_s16le",
        "/tmp/output.wav",
      ],
      outputPath: "/tmp/output.wav",
    });
  });
});

describe("buildOperation", () => {
  it("normalizes explicit operation parameters into inspectable filters", () => {
    const result = buildOperation(
      createAudioVersion("storage/audio/source.wav").audio,
      "parametric_eq",
      {
        bands: [{ type: "bell", frequency_hz: 3800, gain_db: -2, q: 1.2 }],
      },
      { scope: "full_file" },
    );

    expect(result.filterChain).toBe("equalizer=f=3800:t=q:w=1.2:g=-2");
    expect(result.effectiveParameters).toEqual({
      bands: [{ type: "bell", frequency_hz: 3800, gain_db: -2, q: 1.2 }],
    });
  });

  it("updates duration metadata for trim", () => {
    const result = buildOperation(
      createAudioVersion("storage/audio/source.wav").audio,
      "trim",
      {},
      { scope: "time_range", start_seconds: 0.25, end_seconds: 1.25 },
    );

    expect(result.nextAudio.duration_seconds).toBe(1);
    expect(result.nextAudio.frame_count).toBe(44100);
  });
});

describe("applyOperation", () => {
  it("emits a contract-aligned output version and transform record", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createFixtureVersion(workspaceRoot);

    const result = await applyOperation({
      workspaceRoot,
      version,
      operation: "gain",
      parameters: { gain_db: 3 },
      outputVersionId: "ver_01HZX8G7J2V3M4N5P6Q7R8S9T0",
      recordId: "transform_01HZX8F7J2V3M4N5P6Q7R8S9T0",
      createdAt: new Date("2026-04-14T20:20:18Z"),
      executor: createFakeExecutor("gain"),
    });

    expect(result.outputVersion.audio.storage_ref).toBe(
      "storage/audio/ver_01HZX8G7J2V3M4N5P6Q7R8S9T0.wav",
    );
    expect(result.transformRecord.operations).toEqual([
      {
        operation: "gain",
        parameters: { gain_db: 3 },
        status: "applied",
      },
    ]);
    expect(
      await readFile(path.join(workspaceRoot, result.outputVersion.audio.storage_ref), "utf8"),
    ).toBe("gain-bytes");
    expect(validateAgainstSchema(audioVersionSchema, result.outputVersion)).toBe(true);
    expect(validateAgainstSchema(transformRecordSchema, result.transformRecord)).toBe(true);
  });

  it("rejects unsupported initial targets", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createFixtureVersion(workspaceRoot);

    await expect(
      applyOperation({
        workspaceRoot,
        version,
        operation: "gain",
        parameters: { gain_db: 1 },
        target: { scope: "channel", channel: "left" },
        executor: createFakeExecutor("bad"),
      }),
    ).rejects.toThrow(/full_file/);
  });
});

describe("applyEditPlan", () => {
  it("executes ordered steps and materializes the final plan output", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createFixtureVersion(workspaceRoot);
    const plan: EditPlan = {
      schema_version: "1.0.0",
      plan_id: "plan_01HZX8E7J2V3M4N5P6Q7R8S9T0",
      asset_id: version.asset_id,
      version_id: version.version_id,
      user_request: "Trim, soften edges, and reduce level slightly.",
      goals: ["shorten the clip", "avoid abrupt boundaries"],
      created_at: "2026-04-14T20:20:15Z",
      steps: [
        {
          step_id: "step_trim_1",
          operation: "trim",
          target: { scope: "time_range", start_seconds: 0.2, end_seconds: 1.2 },
          parameters: {},
          expected_effects: ["shorten the clip"],
          safety_limits: ["preserve one second of material"],
        },
        {
          step_id: "step_fade_1",
          operation: "fade",
          target: { scope: "full_file" },
          parameters: { fade_in_seconds: 0.05, fade_out_seconds: 0.1 },
          expected_effects: ["smooth boundaries"],
          safety_limits: ["keep fades short"],
        },
      ],
    };

    const result = await applyEditPlan({
      workspaceRoot,
      version,
      plan,
      outputVersionId: "ver_01HZX8G7J2V3M4N5P6Q7R8S9T0",
      recordId: "transform_01HZX8F7J2V3M4N5P6Q7R8S9T0",
      createdAt: new Date("2026-04-14T20:20:18Z"),
      executor: createFakeExecutor("plan"),
    });

    expect(result.commands).toHaveLength(2);
    expect(result.commands[0]?.outputPath.endsWith(".step-1.wav")).toBe(true);
    expect(result.commands[1]?.outputPath.endsWith("ver_01HZX8G7J2V3M4N5P6Q7R8S9T0.wav")).toBe(
      true,
    );
    expect(result.transformRecord.operations.map((operation) => operation.operation)).toEqual([
      "trim",
      "fade",
    ]);
    expect(result.outputVersion.audio.duration_seconds).toBe(1);
    expect(result.outputVersion.audio.frame_count).toBe(44100);
    expect(result.outputVersion.lineage.plan_id).toBe(plan.plan_id);
    expect(validateAgainstSchema(audioVersionSchema, result.outputVersion)).toBe(true);
    expect(validateAgainstSchema(transformRecordSchema, result.transformRecord)).toBe(true);
  });
});

describe("resolveTransformOutputPath", () => {
  it("keeps transform outputs workspace-relative", async () => {
    const workspaceRoot = await createWorkspace();
    const result = resolveTransformOutputPath({
      workspaceRoot,
      versionId: "ver_abc123",
    });

    expect(result.relativePath).toBe("storage/audio/ver_abc123.wav");
    expect(result.absolutePath).toBe(
      path.join(workspaceRoot, "storage", "audio", "ver_abc123.wav"),
    );
  });
});

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "transforms-module-"));
  tempDirs.push(workspaceRoot);
  return workspaceRoot;
}

async function createFixtureVersion(workspaceRoot: string): Promise<AudioVersion> {
  const storageRef = "storage/audio/source.wav";
  await mkdir(path.dirname(path.join(workspaceRoot, storageRef)), { recursive: true });
  await writeFile(path.join(workspaceRoot, storageRef), "source-bytes", { flag: "w" });

  return createAudioVersion(storageRef);
}

function createAudioVersion(storageRef: string): AudioVersion {
  return {
    schema_version: "1.0.0",
    version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T0",
    asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
    lineage: {
      created_at: "2026-04-14T20:20:05Z",
      created_by: "modules/io",
      reason: "fixture",
    },
    audio: {
      storage_ref: storageRef,
      sample_rate_hz: 44100,
      channels: 2,
      duration_seconds: 2,
      frame_count: 88200,
      channel_layout: "stereo",
    },
    state: {
      is_original: true,
      is_preview: false,
    },
  };
}

function createFakeExecutor(
  label: string,
): (command: FfmpegCommand) => Promise<FfmpegExecutionResult> {
  return async (command) => {
    await writeFile(command.outputPath, `${label}-bytes`);

    return {
      exitCode: 0,
      stdout: `${label} stdout`,
      stderr: "",
    };
  };
}

function validateAgainstSchema(schema: unknown, payload: unknown): boolean {
  const Ajv2020 = Ajv2020Import as unknown as new (options: {
    strict: boolean;
  }) => {
    addSchema: (value: unknown, key?: string) => void;
    compile: (value: unknown) => {
      (candidate: unknown): boolean;
      errors?: unknown;
    };
  };
  const addFormats = addFormatsImport as unknown as (ajv: object) => void;
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  ajv.addSchema(commonSchema, commonSchema.$id);
  const validate = ajv.compile(schema);
  const valid = validate(payload);

  if (!valid) {
    throw new Error(JSON.stringify(validate.errors));
  }

  return true;
}
