import { readFileSync } from "node:fs";
import path from "node:path";
import wavefile from "wavefile";

import type { AudioVersion, NormalizedAudioData } from "../types.js";
import { averageChannels } from "./math.js";

const { WaveFile } = wavefile;

interface DecodedWaveFile {
  fmt: {
    sampleRate?: number;
  };
  toBitDepth(bitDepth: string): void;
  getSamples(split?: boolean, TypedArrayConstructor?: Function): unknown;
}

export function resolveAnalysisAudioPath(
  audioVersion: AudioVersion,
  workspaceRoot: string,
): string {
  const absolutePath = path.resolve(workspaceRoot, audioVersion.audio.storage_ref);
  const relativePath = path.relative(workspaceRoot, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(
      `AudioVersion.audio.storage_ref must stay inside the workspace root: ${audioVersion.audio.storage_ref}`,
    );
  }

  return absolutePath;
}

export function loadNormalizedAudioData(
  audioVersion: AudioVersion,
  workspaceRoot: string,
): NormalizedAudioData {
  const storageRef = audioVersion.audio.storage_ref;
  if (!storageRef.toLowerCase().endsWith(".wav")) {
    throw new Error(`Unsupported audio format for analysis baseline: ${storageRef}`);
  }

  const absolutePath = resolveAnalysisAudioPath(audioVersion, workspaceRoot);
  const wav = new WaveFile(readFileSync(absolutePath)) as unknown as DecodedWaveFile;
  wav.toBitDepth("32f");

  const rawSamples = wav.getSamples(false, Float32Array);
  const sampleRateHz = Number(wav.fmt.sampleRate);

  if (!Number.isFinite(sampleRateHz) || sampleRateHz <= 0) {
    throw new Error(`Decoded WAV sample rate is invalid for ${storageRef}`);
  }

  const channels = normalizeWaveSamples(rawSamples, storageRef);

  if (channels.length === 0) {
    throw new Error(`No audio channels found in ${storageRef}`);
  }

  const frameCount = channels[0]?.length ?? 0;
  const durationSeconds = frameCount / sampleRateHz;
  const mono = averageChannels(channels);

  assertAudioMetadataMatchesDecodedFile(audioVersion, {
    sampleRateHz,
    channels: channels.length,
    frameCount,
    durationSeconds,
  });

  return {
    sourcePath: absolutePath,
    sampleRateHz,
    durationSeconds,
    frameCount,
    channels,
    mono,
  };
}

function assertAudioMetadataMatchesDecodedFile(
  audioVersion: AudioVersion,
  decoded: {
    sampleRateHz: number;
    channels: number;
    frameCount: number;
    durationSeconds: number;
  },
): void {
  const { audio } = audioVersion;
  const mismatches: string[] = [];

  if (audio.sample_rate_hz !== decoded.sampleRateHz) {
    mismatches.push(
      `sample_rate_hz declared ${audio.sample_rate_hz} but decoded ${decoded.sampleRateHz}`,
    );
  }

  if (audio.channels !== decoded.channels) {
    mismatches.push(`channels declared ${audio.channels} but decoded ${decoded.channels}`);
  }

  if (audio.frame_count !== decoded.frameCount) {
    mismatches.push(`frame_count declared ${audio.frame_count} but decoded ${decoded.frameCount}`);
  }

  const oneFrameDurationSeconds = 1 / decoded.sampleRateHz;
  if (Math.abs(audio.duration_seconds - decoded.durationSeconds) > oneFrameDurationSeconds) {
    mismatches.push(
      `duration_seconds declared ${audio.duration_seconds} but decoded ${decoded.durationSeconds}`,
    );
  }

  if (mismatches.length > 0) {
    throw new Error(
      `AudioVersion metadata does not match decoded file for ${audio.storage_ref}: ${mismatches.join("; ")}`,
    );
  }
}

function normalizeWaveSamples(rawSamples: unknown, storageRef: string): Float32Array[] {
  if (Array.isArray(rawSamples)) {
    return rawSamples.map((channel, index) => {
      if (!isArrayLikeNumberList(channel)) {
        throw new Error(
          `Decoded WAV channel ${index} is not a numeric sample buffer for ${storageRef}`,
        );
      }

      return Float32Array.from(channel);
    });
  }

  if (!isArrayLikeNumberList(rawSamples)) {
    throw new Error(`Decoded WAV samples are not a numeric sample buffer for ${storageRef}`);
  }

  return [Float32Array.from(rawSamples)];
}

function isArrayLikeNumberList(value: unknown): value is ArrayLike<number> {
  if (typeof value !== "object" || value === null || !("length" in value)) {
    return false;
  }

  return true;
}
