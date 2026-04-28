import { readFileSync } from "node:fs";
import path from "node:path";

import wavefile from "wavefile";

import type { AudioVersion, VerificationTarget } from "./types.js";

const { WaveFile } = wavefile;
const DECIBEL_FLOOR = -120;
const MIN_REFERENCE_RMS = 1e-8;

type TypedArrayConstructor = abstract new (...args: unknown[]) => ArrayLike<number>;

interface DecodedWaveFile {
  fmt: {
    sampleRate?: number;
  };
  toBitDepth(bitDepth: string): void;
  getSamples(split?: boolean, TypedArrayConstructor?: TypedArrayConstructor): unknown;
}

interface LocalAudioData {
  sampleRateHz: number;
  channels: Float32Array[];
  mono: Float32Array;
}

interface WindowMetrics {
  levels: {
    integrated_lufs: number;
    true_peak_dbtp: number;
  };
  spectral_balance: {
    low_band_db: number;
    mid_band_db: number;
    high_band_db: number;
    brightness_tilt_db: number;
    presence_band_db: number;
    harshness_ratio_db: number;
  };
}

export interface LocalAudioVerificationContext {
  workspaceRoot: string;
  baselineVersion: AudioVersion;
  candidateVersion: AudioVersion;
}

export interface LocalMetricObservation {
  observedDelta?: number;
  observedValue?: number;
  evidence: string;
}

export function createLocalAudioMetricReader(context: LocalAudioVerificationContext | undefined): {
  readTargetObservation(target: VerificationTarget): LocalMetricObservation | undefined;
} {
  let baselineAudio: LocalAudioData | undefined;
  let candidateAudio: LocalAudioData | undefined;
  let baselineLoadFailed = false;
  let candidateLoadFailed = false;

  function loadBaselineAudio(): LocalAudioData | undefined {
    if (context === undefined || baselineLoadFailed) {
      return undefined;
    }
    try {
      baselineAudio ??= loadAudioData(context.baselineVersion, context.workspaceRoot);
    } catch {
      baselineLoadFailed = true;
      return undefined;
    }
    return baselineAudio;
  }

  function loadCandidateAudio(): LocalAudioData | undefined {
    if (context === undefined || candidateLoadFailed) {
      return undefined;
    }
    try {
      candidateAudio ??= loadAudioData(context.candidateVersion, context.workspaceRoot);
    } catch {
      candidateLoadFailed = true;
      return undefined;
    }
    return candidateAudio;
  }

  return {
    readTargetObservation(target) {
      if (context === undefined || target.metric === undefined) {
        return undefined;
      }

      if (target.metric === "derived.fade_in_boundary_ratio") {
        return readFadeBoundaryRatio(loadCandidateAudio(), target, "in");
      }

      if (target.metric === "derived.fade_out_boundary_ratio") {
        return readFadeBoundaryRatio(loadCandidateAudio(), target, "out");
      }

      if (target.target?.scope !== "time_range") {
        return undefined;
      }

      return readTimeRangeMetricDelta(loadBaselineAudio(), loadCandidateAudio(), target);
    },
  };
}

function readFadeBoundaryRatio(
  audio: LocalAudioData | undefined,
  target: VerificationTarget,
  direction: "in" | "out",
): LocalMetricObservation | undefined {
  if (audio === undefined || target.threshold === undefined) {
    return undefined;
  }

  const durationSeconds =
    direction === "in"
      ? inferFadeDurationSeconds(target, "fade_in_seconds")
      : inferFadeDurationSeconds(target, "fade_out_seconds");
  if (durationSeconds === undefined || durationSeconds <= 0) {
    return undefined;
  }

  const fadeFrames = Math.max(4, Math.round(durationSeconds * audio.sampleRateHz));
  const probeFrames = Math.max(2, Math.floor(fadeFrames * 0.25));
  const totalFrames = audio.mono.length;
  if (totalFrames < probeFrames * 2) {
    return undefined;
  }

  const earlyStart = direction === "in" ? 0 : Math.max(0, totalFrames - fadeFrames);
  const earlyEnd = direction === "in" ? probeFrames : earlyStart + probeFrames;
  const lateStart =
    direction === "in"
      ? Math.max(0, fadeFrames - probeFrames)
      : Math.max(0, totalFrames - probeFrames);
  const lateEnd = direction === "in" ? fadeFrames : totalFrames;

  const attenuatedRms =
    direction === "in"
      ? rms(audio.mono, earlyStart, earlyEnd)
      : rms(audio.mono, lateStart, lateEnd);
  const referenceRms =
    direction === "in"
      ? rms(audio.mono, lateStart, lateEnd)
      : rms(audio.mono, earlyStart, earlyEnd);

  if (referenceRms < MIN_REFERENCE_RMS) {
    return undefined;
  }

  const ratio = Number((attenuatedRms / referenceRms).toFixed(4));
  return {
    observedValue: ratio,
    evidence: `Measured ${direction === "in" ? "fade-in" : "fade-out"} boundary RMS ratio ${ratio.toFixed(
      4,
    )} over ${durationSeconds.toFixed(3)}s.`,
  };
}

function inferFadeDurationSeconds(
  target: VerificationTarget,
  parameterName: "fade_in_seconds" | "fade_out_seconds",
): number | undefined {
  const match = target.target_id.match(
    parameterName === "fade_in_seconds" ? /fade_in_([0-9]+)ms/ : /fade_out_([0-9]+)ms/,
  );
  if (match?.[1] !== undefined) {
    return Number(match[1]) / 1000;
  }

  const rationaleMatch = target.rationale?.match(
    parameterName === "fade_in_seconds"
      ? /fade-in span is ([0-9.]+) seconds/
      : /fade-out span is ([0-9.]+) seconds/,
  );
  return rationaleMatch?.[1] === undefined ? undefined : Number(rationaleMatch[1]);
}

function readTimeRangeMetricDelta(
  baselineAudio: LocalAudioData | undefined,
  candidateAudio: LocalAudioData | undefined,
  target: VerificationTarget,
): LocalMetricObservation | undefined {
  const startSeconds = target.target?.start_seconds;
  const endSeconds = target.target?.end_seconds;
  if (
    baselineAudio === undefined ||
    candidateAudio === undefined ||
    startSeconds === undefined ||
    endSeconds === undefined ||
    target.metric === undefined
  ) {
    return undefined;
  }

  const baselineMetric = readWindowMetric(baselineAudio, startSeconds, endSeconds, target.metric);
  const candidateMetric = readWindowMetric(candidateAudio, startSeconds, endSeconds, target.metric);
  if (baselineMetric === undefined || candidateMetric === undefined) {
    return undefined;
  }

  const delta = Number((candidateMetric - baselineMetric).toFixed(3));
  return {
    observedDelta: delta,
    observedValue: Number(candidateMetric.toFixed(3)),
    evidence: `Measured local ${target.metric} delta was ${delta.toFixed(3)} in ${startSeconds}s-${endSeconds}s.`,
  };
}

function readWindowMetric(
  audio: LocalAudioData,
  startSeconds: number,
  endSeconds: number,
  metric: string,
): number | undefined {
  const metrics = analyzeWindow(audio, startSeconds, endSeconds);
  if (metrics === undefined) {
    return undefined;
  }

  const value = metric.split(".").reduce<unknown>((current, segment) => {
    if (current === undefined || current === null || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, metrics);

  return typeof value === "number" ? value : undefined;
}

function analyzeWindow(
  audio: LocalAudioData,
  startSeconds: number,
  endSeconds: number,
): WindowMetrics | undefined {
  const startFrame = Math.max(0, Math.floor(startSeconds * audio.sampleRateHz));
  const endFrame = Math.min(audio.mono.length, Math.ceil(endSeconds * audio.sampleRateHz));
  if (endFrame <= startFrame + 8) {
    return undefined;
  }

  const window = audio.mono.slice(startFrame, endFrame);
  const levelDb = toDecibels(rms(window, 0, window.length));
  const truePeakDbtp = toDecibels(maxAbs(window));
  const spectrum = analyzeWindowSpectrum(window, audio.sampleRateHz);

  return {
    levels: {
      integrated_lufs: levelDb,
      true_peak_dbtp: truePeakDbtp,
    },
    spectral_balance: spectrum,
  };
}

function analyzeWindowSpectrum(
  samples: Float32Array,
  sampleRateHz: number,
): WindowMetrics["spectral_balance"] {
  const windowSize = Math.min(2048, samples.length);
  const start = Math.max(0, Math.floor((samples.length - windowSize) / 2));
  let lowEnergy = 0;
  let midEnergy = 0;
  let highEnergy = 0;
  let lowMidEnergy = 0;
  let presenceEnergy = 0;
  const hann = createHannWindow(windowSize);

  for (let bin = 0; bin <= windowSize / 2; bin += 1) {
    let real = 0;
    let imaginary = 0;
    for (let sampleIndex = 0; sampleIndex < windowSize; sampleIndex += 1) {
      const windowed = (samples[start + sampleIndex] ?? 0) * (hann[sampleIndex] ?? 0);
      const phase = (2 * Math.PI * bin * sampleIndex) / windowSize;
      real += windowed * Math.cos(phase);
      imaginary -= windowed * Math.sin(phase);
    }

    const magnitude = Math.sqrt(real * real + imaginary * imaginary);
    const frequencyHz = (bin * sampleRateHz) / windowSize;

    if (frequencyHz < 250) {
      lowEnergy += magnitude;
    } else if (frequencyHz < 4000) {
      midEnergy += magnitude;
    } else {
      highEnergy += magnitude;
    }

    if (frequencyHz >= 250 && frequencyHz < 2000) {
      lowMidEnergy += magnitude;
    } else if (frequencyHz >= 2500 && frequencyHz < 6000) {
      presenceEnergy += magnitude;
    }
  }

  const lowBandDb = toDecibels(lowEnergy);
  const midBandDb = toDecibels(midEnergy);
  const highBandDb = toDecibels(highEnergy);
  const presenceBandDb = toDecibels(presenceEnergy);
  const lowMidBandDb = toDecibels(lowMidEnergy);

  return {
    low_band_db: lowBandDb,
    mid_band_db: midBandDb,
    high_band_db: highBandDb,
    brightness_tilt_db: Number((highBandDb - lowBandDb).toFixed(3)),
    presence_band_db: presenceBandDb,
    harshness_ratio_db: Number((presenceBandDb - lowMidBandDb).toFixed(3)),
  };
}

function loadAudioData(version: AudioVersion, workspaceRoot: string): LocalAudioData {
  if (!version.audio.storage_ref.toLowerCase().endsWith(".wav")) {
    throw new Error(
      `Local compare verification only supports WAV files: ${version.audio.storage_ref}`,
    );
  }

  const absolutePath = path.resolve(workspaceRoot, version.audio.storage_ref);
  const relativePath = path.relative(workspaceRoot, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(
      `AudioVersion.audio.storage_ref must stay inside the workspace root: ${version.audio.storage_ref}`,
    );
  }

  const wav = new WaveFile(readFileSync(absolutePath)) as unknown as DecodedWaveFile;
  wav.toBitDepth("32f");
  const rawSamples = wav.getSamples(false, Float32Array);
  const channels = normalizeWaveSamples(rawSamples);
  const sampleRateHz = Number(wav.fmt.sampleRate);
  const mono = averageChannels(channels);

  return { sampleRateHz, channels, mono };
}

function normalizeWaveSamples(rawSamples: unknown): Float32Array[] {
  if (Array.isArray(rawSamples)) {
    return rawSamples.map((channel) => Float32Array.from(channel as ArrayLike<number>));
  }

  return [Float32Array.from(rawSamples as ArrayLike<number>)];
}

function averageChannels(channels: Float32Array[]): Float32Array {
  const frameCount = channels[0]?.length ?? 0;
  const mono = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (const channel of channels) {
      sum += channel[frame] ?? 0;
    }
    mono[frame] = sum / Math.max(1, channels.length);
  }
  return mono;
}

function rms(samples: Float32Array, startFrame: number, endFrame: number): number {
  const start = Math.max(0, Math.min(samples.length, startFrame));
  const end = Math.max(start, Math.min(samples.length, endFrame));
  let sumSquares = 0;
  for (let index = start; index < end; index += 1) {
    const sample = samples[index] ?? 0;
    sumSquares += sample * sample;
  }
  return end <= start ? 0 : Math.sqrt(sumSquares / (end - start));
}

function maxAbs(samples: Float32Array): number {
  let max = 0;
  for (const sample of samples) {
    max = Math.max(max, Math.abs(sample));
  }
  return max;
}

function toDecibels(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DECIBEL_FLOOR;
  }
  return Number((20 * Math.log10(value)).toFixed(3));
}

function createHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    window[index] = 0.5 * (1 - Math.cos((2 * Math.PI * index) / Math.max(1, size - 1)));
  }
  return window;
}
