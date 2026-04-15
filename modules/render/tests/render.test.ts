import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";
import { afterEach, describe, expect, it } from "vitest";

import commonSchema from "../../../contracts/schemas/json/common.schema.json" with { type: "json" };
import renderArtifactSchema from "../../../contracts/schemas/json/render-artifact.schema.json" with {
  type: "json",
};
import type {
  AudioVersion,
  FfmpegCommand,
  FfmpegExecutionResult,
  FfprobeCommand,
  FfprobeExecutionResult,
} from "../src/index.js";
import {
  buildFfmpegRenderCommand,
  renderExport,
  renderPreview,
  resolveRenderOutputPath,
} from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dirPath) => {
      const { rm } = await import("node:fs/promises");
      await rm(dirPath, { recursive: true, force: true });
    }),
  );
});

describe("resolveRenderOutputPath", () => {
  it("returns a workspace-relative POSIX output path", async () => {
    const workspaceRoot = await createWorkspace();

    const result = resolveRenderOutputPath({
      workspaceRoot,
      outputDir: "renders/previews",
      renderId: "render_abc123",
      extension: "mp3",
      kind: "preview",
    });

    expect(result.relativePath).toBe("renders/previews/render_abc123.mp3");
    expect(result.fileName).toBe("render_abc123.mp3");
    expect(result.absolutePath).toBe(
      path.join(workspaceRoot, "renders", "previews", "render_abc123.mp3"),
    );
  });

  it("appends the selected extension when outputFileName has none", async () => {
    const workspaceRoot = await createWorkspace();

    const result = resolveRenderOutputPath({
      workspaceRoot,
      outputFileName: "custom-preview",
      renderId: "render_abc123",
      extension: "mp3",
      kind: "preview",
    });

    expect(result.fileName).toBe("custom-preview.mp3");
    expect(result.relativePath).toBe("renders/custom-preview.mp3");
  });

  it("rejects outputFileName extensions that do not match the selected format", async () => {
    const workspaceRoot = await createWorkspace();

    expect(() =>
      resolveRenderOutputPath({
        workspaceRoot,
        outputFileName: "custom-preview.wav",
        renderId: "render_abc123",
        extension: "mp3",
        kind: "preview",
      }),
    ).toThrow(/extension must match the selected format/u);
  });
});

describe("buildFfmpegRenderCommand", () => {
  it("builds an explicit preview command", () => {
    const command = buildFfmpegRenderCommand({
      inputPath: "/tmp/source.wav",
      outputPath: "/tmp/render.mp3",
      sampleRateHz: 44100,
      channels: 2,
      format: {
        format: "mp3",
        codec: "libmp3lame",
        extension: "mp3",
        bitrate: "128k",
      },
    });

    expect(command).toEqual({
      executable: "ffmpeg",
      args: [
        "-y",
        "-i",
        "/tmp/source.wav",
        "-vn",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "128k",
        "/tmp/render.mp3",
      ],
      outputPath: "/tmp/render.mp3",
    });
  });

  it("builds an explicit final export command", () => {
    const command = buildFfmpegRenderCommand({
      inputPath: "/tmp/source.wav",
      outputPath: "/tmp/render.wav",
      sampleRateHz: 48000,
      channels: 1,
      format: {
        format: "wav",
        codec: "pcm_s16le",
        extension: "wav",
      },
    });

    expect(command.args).toEqual([
      "-y",
      "-i",
      "/tmp/source.wav",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "48000",
      "-c:a",
      "pcm_s16le",
      "/tmp/render.wav",
    ]);
  });
});

describe("renderPreview", () => {
  it("renders a contract-aligned preview artifact with probed output metadata", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createAudioVersionFixture(workspaceRoot);

    const result = await renderPreview({
      workspaceRoot,
      version,
      renderId: "render_preview123",
      createdAt: new Date("2026-04-14T20:20:20Z"),
      loudnessSummary: {
        integrated_lufs: -15.1,
        true_peak_dbtp: -1.2,
      },
      executor: createFakeExecutor("preview"),
      probeExecutor: createFakeProbeExecutor({
        format: "mp3",
        codec: "mp3",
        sampleRateHz: 32000,
        channels: 1,
        durationSeconds: 4.25,
      }),
    });

    expect(result.artifact).toMatchObject({
      schema_version: "1.0.0",
      render_id: "render_preview123",
      asset_id: version.asset_id,
      version_id: version.version_id,
      kind: "preview",
      created_at: "2026-04-14T20:20:20.000Z",
      output: {
        path: "renders/render_preview123.mp3",
        format: "mp3",
        codec: "mp3",
        sample_rate_hz: 32000,
        channels: 1,
        duration_seconds: 4.25,
      },
      loudness_summary: {
        integrated_lufs: -15.1,
        true_peak_dbtp: -1.2,
      },
    });
    expect(result.artifact.warnings).toBeUndefined();
    expect(result.artifact.output.file_size_bytes).toBeGreaterThan(0);

    expect(validateRenderArtifact(result.artifact)).toBe(true);
  });

  it("rejects source storage refs that escape the workspace root", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createAudioVersionFixture(workspaceRoot);

    version.audio.storage_ref = "../outside.wav";

    await expect(
      renderPreview({
        workspaceRoot,
        version,
        executor: createFakeExecutor("preview"),
        probeExecutor: createFakeProbeExecutor({
          format: "mp3",
          codec: "mp3",
          sampleRateHz: 44100,
          channels: 2,
          durationSeconds: 4,
        }),
      }),
    ).rejects.toThrow(/workspace-relative POSIX path|AudioVersion validation failed/u);
  });

  it("rejects source storage refs that violate the workspace-relative path contract", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createAudioVersionFixture(workspaceRoot);

    version.audio.storage_ref = "/absolute/source.wav";

    await expect(
      renderPreview({
        workspaceRoot,
        version,
        executor: createFakeExecutor("preview"),
        probeExecutor: createFakeProbeExecutor({
          format: "mp3",
          codec: "mp3",
          sampleRateHz: 44100,
          channels: 2,
          durationSeconds: 4,
        }),
      }),
    ).rejects.toThrow(
      /must match pattern|workspace-relative POSIX path|AudioVersion validation failed/u,
    );
  });

  it("preserves stderr lines that look like real warnings", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createAudioVersionFixture(workspaceRoot);

    const result = await renderPreview({
      workspaceRoot,
      version,
      executor: createFakeExecutor("preview", "[mp3 @ 0x1] Warning: encoder delay mismatch"),
      probeExecutor: createFakeProbeExecutor({
        format: "mp3",
        codec: "mp3",
        sampleRateHz: 44100,
        channels: 2,
        durationSeconds: 4,
      }),
    });

    expect(result.artifact.warnings).toEqual(["[mp3 @ 0x1] Warning: encoder delay mismatch"]);
  });
});

describe("renderExport", () => {
  it("renders a contract-aligned final artifact with explicit final format selection", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createAudioVersionFixture(workspaceRoot);

    const result = await renderExport({
      workspaceRoot,
      version,
      renderId: "render_final123",
      createdAt: new Date("2026-04-14T20:21:20Z"),
      format: "flac",
      sampleRateHz: 48000,
      channels: 1,
      executor: createFakeExecutor("final"),
      probeExecutor: createFakeProbeExecutor({
        format: "flac",
        codec: "flac",
        sampleRateHz: 48000,
        channels: 1,
        durationSeconds: 4,
      }),
    });

    expect(result.artifact).toMatchObject({
      schema_version: "1.0.0",
      render_id: "render_final123",
      asset_id: version.asset_id,
      version_id: version.version_id,
      kind: "final",
      created_at: "2026-04-14T20:21:20.000Z",
      output: {
        path: "renders/render_final123.flac",
        format: "flac",
        codec: "flac",
        sample_rate_hz: 48000,
        channels: 1,
        duration_seconds: 4,
      },
    });
    expect(result.artifact.warnings).toBeUndefined();
    expect(result.command.outputPath.endsWith("render_final123.flac")).toBe(true);
    expect(validateRenderArtifact(result.artifact)).toBe(true);
  });
});

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "render-module-"));
  tempDirs.push(workspaceRoot);
  return workspaceRoot;
}

async function createAudioVersionFixture(workspaceRoot: string): Promise<AudioVersion> {
  const storageDir = path.join(workspaceRoot, "storage", "audio");
  await mkdir(storageDir, { recursive: true });
  await writeFile(path.join(storageDir, "source.wav"), "source-bytes");

  return {
    schema_version: "1.0.0",
    version_id: "ver_01HZX8B7J2V3M4N5P6Q7R8S9T0",
    asset_id: "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
    lineage: {
      created_at: "2026-04-14T20:20:05Z",
      created_by: "modules/io",
      reason: "initial import",
    },
    audio: {
      storage_ref: "storage/audio/source.wav",
      sample_rate_hz: 44100,
      channels: 2,
      duration_seconds: 4,
      frame_count: 176400,
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
  stderr = `${label} stderr`,
): (command: FfmpegCommand) => Promise<FfmpegExecutionResult> {
  return async (command) => {
    await writeFile(command.outputPath, `${label}-bytes`);

    return {
      exitCode: 0,
      stdout: `${label} stdout`,
      stderr,
    };
  };
}

function createFakeProbeExecutor(metadata: {
  format: string;
  codec: string;
  sampleRateHz: number;
  channels: number;
  durationSeconds: number;
}): (command: FfprobeCommand) => Promise<FfprobeExecutionResult> {
  return async (_command) => ({
    exitCode: 0,
    stdout: JSON.stringify({
      streams: [
        {
          codec_name: metadata.codec,
          codec_type: "audio",
          sample_rate: String(metadata.sampleRateHz),
          channels: metadata.channels,
        },
      ],
      format: {
        format_name: metadata.format,
        duration: String(metadata.durationSeconds),
      },
    }),
    stderr: "",
  });
}

function validateRenderArtifact(payload: unknown): boolean {
  const Ajv2020 = Ajv2020Import as unknown as new (options: {
    strict: boolean;
  }) => {
    addSchema: (schema: unknown, key?: string) => void;
    compile: (schema: unknown) => {
      (value: unknown): boolean;
      errors?: unknown;
    };
  };
  const addFormats = addFormatsImport as unknown as (ajv: object) => void;
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  ajv.addSchema(commonSchema, commonSchema.$id);
  const validate = ajv.compile(renderArtifactSchema);
  const valid = validate(payload);

  if (!valid) {
    throw new Error(JSON.stringify(validate.errors));
  }

  return true;
}
