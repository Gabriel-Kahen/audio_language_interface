import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";
import { afterEach, describe, expect, it } from "vitest";
import { WaveFile } from "wavefile";

import audioVersionSchema from "../../../contracts/schemas/json/audio-version.schema.json" with {
  type: "json",
};
import commonSchema from "../../../contracts/schemas/json/common.schema.json" with { type: "json" };
import transformRecordSchema from "../../../contracts/schemas/json/transform-record.schema.json" with {
  type: "json",
};
import { type AudioVersion, applyOperation } from "../src/index.js";

const execFile = promisify(execFileCallback);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("transform audio invariants", () => {
  it("materializes deterministic trim records with schema-shaped output metadata", async () => {
    const workspaceRoot = await createWorkspace();
    const version = await createSourceVersion(workspaceRoot, {
      sampleRateHz: 44100,
      channels: 2,
      durationSeconds: 1,
    });

    const first = await applyOperation({
      workspaceRoot,
      version,
      operation: "trim",
      target: { scope: "time_range", start_seconds: 0.125, end_seconds: 0.625 },
      parameters: {},
      outputVersionId: "ver_01HYTRANSFORMINV000000001",
      recordId: "transform_01HYTRANSFORMINV000001",
      createdAt: new Date("2026-04-28T12:00:00Z"),
    });
    const second = await applyOperation({
      workspaceRoot,
      version,
      operation: "trim",
      target: { scope: "time_range", start_seconds: 0.125, end_seconds: 0.625 },
      parameters: {},
      outputVersionId: "ver_01HYTRANSFORMINV000000002",
      recordId: "transform_01HYTRANSFORMINV000002",
      createdAt: new Date("2026-04-28T12:00:00Z"),
    });

    const firstPath = path.join(workspaceRoot, first.outputVersion.audio.storage_ref);
    const secondPath = path.join(workspaceRoot, second.outputVersion.audio.storage_ref);
    const [firstStat, firstMetadata, firstBytes, secondBytes] = await Promise.all([
      stat(firstPath),
      probeAudioMetadata(firstPath),
      readFile(firstPath),
      readFile(secondPath),
    ]);

    expect(firstStat.isFile()).toBe(true);
    expect(firstStat.size).toBeGreaterThan(0);
    expect(first.outputVersion.audio.sample_rate_hz).toBe(44100);
    expect(first.outputVersion.audio.channels).toBe(2);
    expect(first.outputVersion.audio.frame_count).toBe(22050);
    expect(first.outputVersion.audio.duration_seconds).toBe(0.5);
    expect(firstMetadata.sampleRateHz).toBe(first.outputVersion.audio.sample_rate_hz);
    expect(firstMetadata.channels).toBe(first.outputVersion.audio.channels);
    expect(firstMetadata.durationSeconds).toBeCloseTo(
      first.outputVersion.audio.duration_seconds,
      3,
    );
    expect(firstBytes.equals(secondBytes)).toBe(true);
    expect(stripVariableRecordFields(first.transformRecord)).toEqual(
      stripVariableRecordFields(second.transformRecord),
    );
    expect(first.transformRecord.operations).toEqual([
      {
        operation: "trim",
        target: { scope: "time_range", start_seconds: 0.125, end_seconds: 0.625 },
        parameters: {
          start_seconds: 0.125,
          end_seconds: 0.625,
          duration_seconds: 0.5,
        },
        status: "applied",
      },
    ]);
    expect(validateAgainstSchema(audioVersionSchema, first.outputVersion)).toBe(true);
    expect(validateAgainstSchema(transformRecordSchema, first.transformRecord)).toBe(true);
  });
});

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "transform-invariants-"));
  tempDirs.push(workspaceRoot);
  return workspaceRoot;
}

async function createSourceVersion(
  workspaceRoot: string,
  options: { sampleRateHz: number; channels: number; durationSeconds: number },
): Promise<AudioVersion> {
  const storageRef = "storage/audio/source.wav";
  const absolutePath = path.join(workspaceRoot, storageRef);
  await writeSineWav(absolutePath, options);
  const frameCount = Math.round(options.sampleRateHz * options.durationSeconds);

  return {
    schema_version: "1.0.0",
    version_id: "ver_01HYSOURCEINVARIANT0000001",
    asset_id: "asset_01HYSOURCEINVARIANT00001",
    lineage: {
      created_at: "2026-04-28T11:59:00Z",
      created_by: "modules/io",
      reason: "test fixture",
    },
    audio: {
      storage_ref: storageRef,
      sample_rate_hz: options.sampleRateHz,
      channels: options.channels,
      duration_seconds: options.durationSeconds,
      frame_count: frameCount,
      channel_layout: options.channels === 1 ? "mono" : "stereo",
    },
    state: { is_original: true, is_preview: false },
  };
}

async function writeSineWav(
  filePath: string,
  options: { sampleRateHz: number; channels: number; durationSeconds: number },
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const frameCount = Math.round(options.sampleRateHz * options.durationSeconds);
  const samples = Array.from({ length: options.channels }, (_, channel) =>
    Array.from({ length: frameCount }, (_, frame) =>
      Math.round(
        Math.sin((2 * Math.PI * (330 + channel * 110) * frame) / options.sampleRateHz) * 10000,
      ),
    ),
  );
  const wav = new WaveFile();
  wav.fromScratch(options.channels, options.sampleRateHz, "16", samples);
  await writeFile(filePath, Buffer.from(wav.toBuffer()));
}

async function probeAudioMetadata(absolutePath: string): Promise<{
  sampleRateHz: number;
  channels: number;
  durationSeconds: number;
}> {
  const { stdout } = await execFile("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=sample_rate,channels",
    "-of",
    "json",
    absolutePath,
  ]);
  const payload = JSON.parse(stdout) as {
    streams?: Array<{ sample_rate?: string; channels?: number }>;
    format?: { duration?: string };
  };
  const stream = payload.streams?.[0];

  return {
    sampleRateHz: Number(stream?.sample_rate),
    channels: Number(stream?.channels),
    durationSeconds: Number(payload.format?.duration),
  };
}

function stripVariableRecordFields(record: unknown): unknown {
  const clone = structuredClone(record) as Record<string, unknown>;
  clone.record_id = "<record>";
  clone.output_version_id = "<output>";
  clone.finished_at = "<finished>";
  clone.runtime_ms = "<runtime>";
  return clone;
}

function validateAgainstSchema(schema: unknown, payload: unknown): boolean {
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
  const validate = ajv.compile(schema);
  const valid = validate(payload);

  if (!valid) {
    throw new Error(JSON.stringify(validate.errors));
  }

  return true;
}
