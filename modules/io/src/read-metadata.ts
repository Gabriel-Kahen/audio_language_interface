import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { execa } from "execa";
import { parseFile } from "music-metadata";
import wavefile from "wavefile";

import { ExternalToolError, UnsupportedAudioFormatError } from "./errors.js";

const SUPPORTED_CONTAINER_FORMATS = new Set([
  "wav",
  "flac",
  "mp3",
  "aiff",
  "aif",
  "aifc",
  "ogg",
  "m4a",
  "mp4",
]);

/** Container-level metadata emitted by `inspectFileMetadata`. */
export interface AudioFileMetadata {
  sourcePath: string;
  fileSizeBytes: number;
  containerFormat: string;
  codec: string;
  sampleRateHz: number;
  channels: number;
  durationSeconds: number;
  frameCount: number;
  bitDepth?: number;
  channelLayout?: string;
}

export interface FfprobeStream {
  codec_name?: string;
  codec_type?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  bits_per_raw_sample?: string;
  duration?: string;
}

export interface FfprobeFormat {
  format_name?: string;
  duration?: string;
}

/** Subset of `ffprobe` JSON output consumed by this module. */
export interface FfprobeResult {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

export interface WavMetadata {
  codec: string;
  bitDepth?: number;
  frameCount: number;
}

/** Dependency injection hooks used by tests around metadata inspection. */
export interface ReadMetadataDependencies {
  parseAudioFile?: typeof parseFile;
  statFile?: typeof stat;
  runFfprobe?: (filePath: string) => Promise<FfprobeResult | undefined>;
}

/** Normalizes parser- or extension-derived container names into canonical values. */
export function normalizeContainerFormat(value: string | undefined): string {
  if (!value) {
    return "unknown";
  }

  const normalized = value.toLowerCase();
  if (normalized.includes("wave") || normalized.includes("wav")) {
    return "wav";
  }
  if (normalized.includes("aiff") || normalized === "aif") {
    return "aiff";
  }
  if (normalized.includes("mpeg") || normalized === "mp3") {
    return "mp3";
  }
  if (normalized.includes("quicktime") || normalized.includes("m4a")) {
    return "m4a";
  }

  return normalized.split(",")[0]?.trim() || "unknown";
}

/** Returns whether the container format is supported by the current implementation. */
export function isSupportedContainerFormat(containerFormat: string): boolean {
  return SUPPORTED_CONTAINER_FORMATS.has(normalizeContainerFormat(containerFormat));
}

/** Throws when a container format is outside the module's supported set. */
export function assertSupportedContainerFormat(containerFormat: string): void {
  const normalized = normalizeContainerFormat(containerFormat);
  if (!isSupportedContainerFormat(normalized)) {
    throw new UnsupportedAudioFormatError(normalized);
  }
}

/** Infers simple channel layouts when explicit metadata is unavailable. */
export function inferChannelLayout(channels: number): string | undefined {
  if (channels === 1) {
    return "mono";
  }
  if (channels === 2) {
    return "stereo";
  }

  return undefined;
}

/** Builds the explicit `ffprobe` command used for metadata enrichment. */
export function buildFfprobeCommand(filePath: string): {
  command: string;
  args: string[];
} {
  return {
    command: "ffprobe",
    args: ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath],
  };
}

/**
 * Runs `ffprobe` if available.
 *
 * Returns `undefined` when the binary is missing from `PATH`.
 */
export async function runFfprobe(filePath: string): Promise<FfprobeResult | undefined> {
  const { command, args } = buildFfprobeCommand(filePath);

  try {
    const result = await execa(command, args);
    return JSON.parse(result.stdout) as FfprobeResult;
  } catch (cause) {
    if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") {
      return undefined;
    }

    throw new ExternalToolError("ffprobe", `ffprobe failed for ${filePath}`, { cause });
  }
}

/** Reads WAV-specific codec, bit depth, and frame count details. */
export async function readWavMetadata(filePath: string): Promise<WavMetadata> {
  const wav = new wavefile.WaveFile(await readFile(filePath));
  const wavFormat = wav.fmt as {
    audioFormat?: number;
    bitsPerSample?: number;
    blockAlign: number;
  };
  const wavData = wav.data as { chunkSize: number };
  const bitDepth = Number.isInteger(wavFormat.bitsPerSample) ? wavFormat.bitsPerSample : undefined;
  const frameCount = Math.floor(wavData.chunkSize / wavFormat.blockAlign);

  const metadata: WavMetadata = {
    codec: mapWavFormatToCodec(wavFormat.audioFormat, bitDepth),
    frameCount,
  };

  if (bitDepth !== undefined) {
    metadata.bitDepth = bitDepth;
  }

  return metadata;
}

function mapWavFormatToCodec(
  audioFormat: number | undefined,
  bitDepth: number | undefined,
): string {
  if (audioFormat === 3 && bitDepth === 32) {
    return "pcm_f32le";
  }
  if (bitDepth === 24) {
    return "pcm_s24le";
  }
  if (bitDepth === 32) {
    return "pcm_s32le";
  }

  return "pcm_s16le";
}

/**
 * Inspects a supported audio file and returns the normalized metadata fields
 * needed by `AudioAsset` and `AudioVersion`.
 */
export async function inspectFileMetadata(
  filePath: string,
  dependencies: ReadMetadataDependencies = {},
): Promise<AudioFileMetadata> {
  const parseAudioFile = dependencies.parseAudioFile ?? parseFile;
  const statFile = dependencies.statFile ?? stat;
  const probe = dependencies.runFfprobe ?? runFfprobe;
  const fileStat = await statFile(filePath);
  const parsed = await parseAudioFile(filePath, { duration: true });
  const ffprobe = await probe(filePath);
  const audioStream = ffprobe?.streams?.find((stream) => stream.codec_type === "audio");

  const extensionContainer = normalizeContainerFormat(path.extname(filePath).slice(1));
  const containerFormat = normalizeContainerFormat(
    parsed.format.container ?? ffprobe?.format?.format_name ?? extensionContainer,
  );

  assertSupportedContainerFormat(containerFormat);

  const wavMetadata = containerFormat === "wav" ? await readWavMetadata(filePath) : undefined;
  const sampleRateHz = parsed.format.sampleRate ?? Number(audioStream?.sample_rate);
  const channels = parsed.format.numberOfChannels ?? audioStream?.channels;
  const durationFromStream = Number(audioStream?.duration);
  const durationFromFormat = Number(ffprobe?.format?.duration);
  const durationSeconds =
    parsed.format.duration ??
    (Number.isFinite(durationFromStream) ? durationFromStream : durationFromFormat);

  if (!sampleRateHz || !channels || Number.isNaN(durationSeconds)) {
    throw new UnsupportedAudioFormatError(
      containerFormat,
      `Could not determine required metadata for ${filePath}`,
    );
  }

  const frameCount =
    wavMetadata?.frameCount ??
    parsed.format.numberOfSamples ??
    Math.round(durationSeconds * sampleRateHz);

  const ffprobeBitDepth = Number(audioStream?.bits_per_raw_sample);
  const metadata: AudioFileMetadata = {
    sourcePath: filePath,
    fileSizeBytes: fileStat.size,
    containerFormat,
    codec:
      wavMetadata?.codec ??
      audioStream?.codec_name ??
      parsed.format.codec ??
      `${containerFormat}_audio`,
    sampleRateHz,
    channels,
    durationSeconds,
    frameCount,
  };

  const channelLayout = audioStream?.channel_layout ?? inferChannelLayout(channels);
  if (channelLayout !== undefined) {
    metadata.channelLayout = channelLayout;
  }

  const bitDepth =
    wavMetadata?.bitDepth ??
    parsed.format.bitsPerSample ??
    (Number.isFinite(ffprobeBitDepth) ? ffprobeBitDepth : undefined);

  if (bitDepth !== undefined) {
    metadata.bitDepth = bitDepth;
  }

  return metadata;
}
