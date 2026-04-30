import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";
import { afterEach, describe, expect, it } from "vitest";
import { WaveFile } from "wavefile";

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
  LoudnessProbeCommand,
} from "../src/index.js";
import {
  buildFfmpegRenderCommand,
  renderComparisonPreview,
  renderExport,
  renderPreview,
  resolveRenderOutputPath,
} from "../src/index.js";

const tempDirs: string[] = [];
const execFile = promisify(execFileCallback);

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

  it("adds an audio filter chain when requested", () => {
    const command = buildFfmpegRenderCommand({
      inputPath: "/tmp/source.wav",
      outputPath: "/tmp/render.mp3",
      sampleRateHz: 44100,
      channels: 2,
      audioFilterChain: "volume=-6dB,alimiter=limit=0.891251",
      format: {
        format: "mp3",
        codec: "libmp3lame",
        extension: "mp3",
        bitrate: "128k",
      },
    });

    expect(command.args).toEqual([
      "-y",
      "-i",
      "/tmp/source.wav",
      "-vn",
      "-af",
      "volume=-6dB,alimiter=limit=0.891251",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      "/tmp/render.mp3",
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
        sampleRateHz: 44100,
        channels: 2,
        durationSeconds: 4,
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
        sample_rate_hz: 44100,
        channels: 2,
        duration_seconds: 4,
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

  it("adds validation warnings when the rendered output differs from the requested shape", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createAudioVersionFixture(workspaceRoot);

    const result = await renderPreview({
      workspaceRoot,
      version,
      sampleRateHz: 44100,
      channels: 2,
      executor: createFakeExecutor("preview"),
      probeExecutor: createFakeProbeExecutor({
        format: "mp3",
        codec: "mp3",
        sampleRateHz: 32000,
        channels: 1,
        durationSeconds: 4.05,
      }),
    });

    expect(result.artifact.warnings).toEqual([
      "Rendered output sample rate 32000 Hz differs from requested 44100 Hz.",
      "Rendered output channel count 1 differs from requested 2.",
      "Rendered output duration 4.05 s differs from source duration 4 s.",
    ]);
  });

  it("rejects renders whose probed format does not match the requested preview format", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createAudioVersionFixture(workspaceRoot);

    await expect(
      renderPreview({
        workspaceRoot,
        version,
        executor: createFakeExecutor("preview"),
        probeExecutor: createFakeProbeExecutor({
          format: "wav",
          codec: "pcm_s16le",
          sampleRateHz: 44100,
          channels: 2,
          durationSeconds: 4,
        }),
      }),
    ).rejects.toThrow(/does not match expected format/);
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

  it("renders a real final export whose artifact metadata matches the materialized file", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createRealAudioVersionFixture(workspaceRoot, {
      durationSeconds: 0.5,
      sampleRateHz: 44100,
      channels: 1,
    });

    const result = await renderExport({
      workspaceRoot,
      version,
      renderId: "render_finalreal",
      format: "flac",
      sampleRateHz: 22050,
      channels: 1,
    });
    const outputPath = path.join(workspaceRoot, result.artifact.output.path);
    const probed = await probeAudioMetadata(outputPath);

    expect(result.artifact.output.format).toBe("flac");
    expect(result.artifact.output.sample_rate_hz).toBe(22050);
    expect(result.artifact.output.channels).toBe(1);
    expect(result.artifact.output.file_size_bytes).toBeGreaterThan(0);
    expect(probed.format).toBe(result.artifact.output.format);
    expect(probed.sampleRateHz).toBe(result.artifact.output.sample_rate_hz);
    expect(probed.channels).toBe(result.artifact.output.channels);
    expect(probed.durationSeconds).toBeCloseTo(result.artifact.output.duration_seconds, 3);
    expect(validateRenderArtifact(result.artifact)).toBe(true);
  });
});

describe("renderComparisonPreview", () => {
  it("renders original, edited, and loudness-matched preview artifacts", async () => {
    const workspaceRoot = await createWorkspace();
    const originalVersion = await createAudioVersionFixture(workspaceRoot);
    const editedVersion: AudioVersion = {
      ...originalVersion,
      version_id: "ver_01HZX8B7J2V3M4N5P6Q7EDIT01",
      parent_version_id: originalVersion.version_id,
      audio: {
        ...originalVersion.audio,
        storage_ref: "storage/audio/edited.wav",
      },
      state: {
        is_original: false,
        is_preview: false,
      },
    };
    await writeFile(path.join(workspaceRoot, "storage", "audio", "edited.wav"), "edited-bytes");

    const result = await renderComparisonPreview({
      workspaceRoot,
      originalVersion,
      editedVersion,
      originalLoudness: {
        integrated_lufs: -20,
        true_peak_dbtp: -4,
      },
      editedLoudness: {
        integrated_lufs: -14,
        true_peak_dbtp: -1.5,
      },
      renderIds: {
        originalPreview: "render_originalpreview123",
        editedPreview: "render_editedpreview123",
        loudnessMatchedOriginalPreview: "render_matchedoriginal123",
        loudnessMatchedEditedPreview: "render_matchededited123",
      },
      createdAt: new Date("2026-04-14T20:22:20Z"),
      executor: createFakeExecutor("comparison-preview"),
      probeExecutor: createFakeProbeExecutor({
        format: "mp3",
        codec: "mp3",
        sampleRateHz: 44100,
        channels: 2,
        durationSeconds: 4,
      }),
      loudnessProbeExecutor: createFakeLoudnessProbeExecutor({
        render_originalpreview123: { integrated_lufs: -20.1, true_peak_dbtp: -4.1 },
        render_editedpreview123: { integrated_lufs: -14.2, true_peak_dbtp: -1.8 },
        render_matchedoriginal123: { integrated_lufs: -20, true_peak_dbtp: -4 },
        render_matchededited123: { integrated_lufs: -20.1, true_peak_dbtp: -7.4 },
      }),
    });

    expect(result.originalPreview.artifact.output.path).toBe(
      "renders/comparison-previews/render_originalpreview123.mp3",
    );
    expect(result.editedPreview.artifact.output.path).toBe(
      "renders/comparison-previews/render_editedpreview123.mp3",
    );
    expect(result.loudnessMatchedOriginalPreview.artifact.output.path).toBe(
      "renders/comparison-previews/render_matchedoriginal123.mp3",
    );
    expect(result.loudnessMatchedEditedPreview.artifact.output.path).toBe(
      "renders/comparison-previews/render_matchededited123.mp3",
    );
    expect(result.metadata).toMatchObject({
      method: "integrated_lufs_true_peak_capped_gain",
      target_integrated_lufs: -20,
      max_true_peak_dbtp: -1,
      clipping_guard: "true_peak_gain_cap_and_limiter",
      original: {
        gain_db: 0,
        matched_loudness: {
          integrated_lufs: -20,
        },
      },
      edited: {
        gain_db: -6,
        estimated_true_peak_dbtp: -7.5,
        matched_loudness: {
          integrated_lufs: -20.1,
        },
      },
    });
    expect(result.metadata.warnings).toBeUndefined();
    expect(result.loudnessMatchedEditedPreview.command.args).toContain(
      "volume=-6dB,alimiter=limit=0.891251",
    );
    expect(validateRenderArtifact(result.originalPreview.artifact)).toBe(true);
    expect(validateRenderArtifact(result.editedPreview.artifact)).toBe(true);
    expect(validateRenderArtifact(result.loudnessMatchedOriginalPreview.artifact)).toBe(true);
    expect(validateRenderArtifact(result.loudnessMatchedEditedPreview.artifact)).toBe(true);
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

async function createRealAudioVersionFixture(
  workspaceRoot: string,
  options: {
    durationSeconds: number;
    sampleRateHz: number;
    channels: number;
  },
): Promise<AudioVersion> {
  const storageDir = path.join(workspaceRoot, "storage", "audio");
  await mkdir(storageDir, { recursive: true });
  const totalFrames = Math.round(options.durationSeconds * options.sampleRateHz);
  const samples = Array.from({ length: options.channels }, () =>
    Array.from({ length: totalFrames }, (_, index) =>
      Math.round(Math.sin((2 * Math.PI * 220 * index) / options.sampleRateHz) * 16000),
    ),
  );
  const wav = new WaveFile();
  wav.fromScratch(options.channels, options.sampleRateHz, "16", samples);
  await writeFile(path.join(storageDir, "source.wav"), Buffer.from(wav.toBuffer()));

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
      sample_rate_hz: options.sampleRateHz,
      channels: options.channels,
      duration_seconds: options.durationSeconds,
      frame_count: totalFrames,
      ...(options.channels === 1 ? { channel_layout: "mono" } : { channel_layout: "stereo" }),
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

function createFakeLoudnessProbeExecutor(
  byRenderId: Record<string, { integrated_lufs: number; true_peak_dbtp: number }>,
): (command: LoudnessProbeCommand) => Promise<FfmpegExecutionResult> {
  return async (command) => {
    const entry = Object.entries(byRenderId).find(([renderId]) =>
      command.inputPath.includes(renderId),
    )?.[1];

    if (entry === undefined) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `missing fake loudness for ${command.inputPath}`,
      };
    }

    return {
      exitCode: 0,
      stdout: "",
      stderr: JSON.stringify({
        input_i: String(entry.integrated_lufs),
        input_tp: String(entry.true_peak_dbtp),
      }),
    };
  };
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

async function probeAudioMetadata(absolutePath: string): Promise<{
  format: string;
  sampleRateHz: number;
  channels: number;
  durationSeconds: number;
}> {
  const { stdout } = await execFile("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=format_name,duration:stream=sample_rate,channels",
    "-of",
    "json",
    absolutePath,
  ]);
  const payload = JSON.parse(stdout) as {
    streams?: Array<{ sample_rate?: string; channels?: number }>;
    format?: { format_name?: string; duration?: string };
  };
  const stream = payload.streams?.[0];

  return {
    format: String(payload.format?.format_name).split(",")[0] ?? "",
    sampleRateHz: Number(stream?.sample_rate),
    channels: Number(stream?.channels),
    durationSeconds: Number(payload.format?.duration),
  };
}
