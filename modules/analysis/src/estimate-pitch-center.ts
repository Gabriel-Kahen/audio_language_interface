import { cwd } from "node:process";

import { assertValidAudioVersion } from "@audio-language-interface/core";
import type {
  AudioVersion,
  EstimatePitchCenterOptions,
  NormalizedAudioData,
  PitchCenterEstimate,
} from "./types.js";
import { clamp, rms, sliceFrames, toDecibels } from "./utils/math.js";
import { loadNormalizedAudioData } from "./utils/wav.js";

const ANALYSIS_WINDOW_FRAMES = 2048;
const MAX_ANALYSIS_WINDOWS = 3;
const MIN_PITCH_HZ = 80;
const MAX_PITCH_HZ = 1000;
const ACTIVE_WINDOW_RMS_DBFS = -42;
const MIN_CORRELATION_SCORE = 0.68;
const STRONG_CORRELATION_SCORE = 0.78;
const VOICED_UNCERTAINTY_CENTS = 35;
const MIXED_UNCERTAINTY_CENTS = 80;

interface PitchWindowCandidate {
  frequencyHz: number;
  midiValue: number;
  score: number;
}

/**
 * Estimate a conservative pitch center for one contract-aligned `AudioVersion`.
 *
 * The current baseline shares the analysis module's WAV-only loading path and
 * emits a narrow inspectable result with explicit voicing and uncertainty.
 */
export function estimatePitchCenter(
  audioVersion: AudioVersion,
  options: EstimatePitchCenterOptions = {},
): PitchCenterEstimate {
  assertValidAudioVersion(audioVersion);
  const audioData = loadNormalizedAudioData(audioVersion, options.workspaceRoot ?? cwd());
  return estimatePitchCenterFromAudioData(audioData);
}

export function estimatePitchCenterFromAudioData(
  audioData: NormalizedAudioData,
): PitchCenterEstimate {
  const windowStarts = collectWindowStarts(audioData.frameCount, ANALYSIS_WINDOW_FRAMES);
  const candidates: PitchWindowCandidate[] = [];
  let analyzedWindowCount = 0;

  for (const startFrame of windowStarts) {
    const window = sliceFrames(audioData.mono, startFrame, ANALYSIS_WINDOW_FRAMES);
    if (window.length < ANALYSIS_WINDOW_FRAMES / 2) {
      continue;
    }

    const windowRmsDbfs = toDecibels(rms(window));
    if (windowRmsDbfs < ACTIVE_WINDOW_RMS_DBFS) {
      continue;
    }

    analyzedWindowCount += 1;
    const candidate = estimateWindowPitch(window, audioData.sampleRateHz);
    if (candidate !== undefined) {
      candidates.push(candidate);
    }
  }

  if (analyzedWindowCount === 0 || candidates.length === 0) {
    return {
      voicing: "unvoiced",
      confidence: 0,
      analyzed_window_count: analyzedWindowCount,
      voiced_window_count: candidates.length,
      voiced_window_ratio: 0,
    };
  }

  const voicedWindowRatio = candidates.length / analyzedWindowCount;
  const weightedMidi = weightedMean(
    candidates.map((candidate) => candidate.midiValue),
    candidates.map((candidate) => candidate.score),
  );
  const frequencyHz = midiToFrequency(weightedMidi);
  const uncertaintyCents = Math.max(
    0,
    weightedMean(
      candidates.map((candidate) => Math.abs((candidate.midiValue - weightedMidi) * 100)),
      candidates.map((candidate) => candidate.score),
    ),
  );
  const averageScore = weightedMean(
    candidates.map((candidate) => candidate.score),
    candidates.map((candidate) => candidate.score),
  );
  const confidence = clamp(
    normalizeScore(averageScore, MIN_CORRELATION_SCORE, STRONG_CORRELATION_SCORE) * 0.45 +
      clamp(1 - uncertaintyCents / MIXED_UNCERTAINTY_CENTS, 0, 1) * 0.35 +
      clamp(voicedWindowRatio, 0, 1) * 0.2,
    0,
    1,
  );
  const estimate: PitchCenterEstimate = {
    voicing: classifyVoicing(voicedWindowRatio, uncertaintyCents, confidence),
    confidence,
    analyzed_window_count: analyzedWindowCount,
    voiced_window_count: candidates.length,
    voiced_window_ratio: voicedWindowRatio,
  };

  if (estimate.voicing === "unvoiced") {
    return estimate;
  }

  const roundedMidi = Math.round(weightedMidi);
  return {
    ...estimate,
    frequency_hz: frequencyHz,
    midi_note: roundedMidi,
    note_name: midiToNoteName(roundedMidi),
    uncertainty_cents: uncertaintyCents,
  };
}

function collectWindowStarts(frameCount: number, windowFrames: number): number[] {
  if (frameCount <= 0) {
    return [0];
  }

  if (frameCount <= windowFrames) {
    return [0];
  }

  const steps = Math.min(MAX_ANALYSIS_WINDOWS, Math.max(1, Math.floor(frameCount / windowFrames)));
  const lastStart = Math.max(frameCount - windowFrames, 0);
  const starts: number[] = [];

  for (let step = 0; step < steps; step += 1) {
    const ratio = steps === 1 ? 0 : step / (steps - 1);
    starts.push(Math.round(lastStart * ratio));
  }

  return starts;
}

function estimateWindowPitch(
  samples: Float32Array,
  sampleRateHz: number,
): PitchWindowCandidate | undefined {
  const centeredSamples = centerSamples(samples);
  if (rms(centeredSamples) <= 1e-4) {
    return undefined;
  }

  const minimumLag = Math.max(1, Math.floor(sampleRateHz / MAX_PITCH_HZ));
  const maximumLag = Math.max(minimumLag, Math.floor(sampleRateHz / MIN_PITCH_HZ));
  const lagScores: number[] = [];
  let bestScore = 0;

  for (let lag = minimumLag; lag <= maximumLag && lag < centeredSamples.length / 2; lag += 1) {
    let numerator = 0;
    let denominatorA = 0;
    let denominatorB = 0;

    for (let index = 0; index + lag < centeredSamples.length; index += 1) {
      const a = centeredSamples[index] ?? 0;
      const b = centeredSamples[index + lag] ?? 0;
      numerator += a * b;
      denominatorA += a * a;
      denominatorB += b * b;
    }

    const denominator = Math.sqrt(denominatorA * denominatorB);
    if (denominator === 0) {
      continue;
    }

    const score = numerator / denominator;
    lagScores[lag] = score;
    bestScore = Math.max(bestScore, score);
  }

  if (bestScore < MIN_CORRELATION_SCORE) {
    return undefined;
  }

  const targetScore = Math.max(MIN_CORRELATION_SCORE, bestScore - 0.02);
  let bestLag = 0;
  for (let lag = minimumLag; lag <= maximumLag && lag < centeredSamples.length / 2; lag += 1) {
    const score = lagScores[lag] ?? 0;
    const previous = lagScores[lag - 1] ?? Number.NEGATIVE_INFINITY;
    const next = lagScores[lag + 1] ?? Number.NEGATIVE_INFINITY;
    const isLocalMaximum = score >= previous && score >= next;

    if (isLocalMaximum && score >= targetScore) {
      bestLag = lag;
      bestScore = score;
      break;
    }
  }

  if (bestLag === 0) {
    return undefined;
  }

  const frequencyHz = sampleRateHz / bestLag;
  return {
    frequencyHz,
    midiValue: frequencyToMidi(frequencyHz),
    score: bestScore,
  };
}

function centerSamples(samples: Float32Array): Float32Array {
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    sum += samples[index] ?? 0;
  }

  const mean = sum / Math.max(samples.length, 1);
  const centered = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    centered[index] = (samples[index] ?? 0) - mean;
  }

  return centered;
}

function weightedMean(values: number[], weights: number[]): number {
  if (values.length === 0 || weights.length === 0) {
    return 0;
  }

  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index += 1) {
    const weight = weights[index] ?? 0;
    numerator += (values[index] ?? 0) * weight;
    denominator += weight;
  }

  if (denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}

function normalizeScore(value: number, floor: number, ceiling: number): number {
  return clamp((value - floor) / Math.max(ceiling - floor, 1e-6), 0, 1);
}

function classifyVoicing(
  voicedWindowRatio: number,
  uncertaintyCents: number,
  confidence: number,
): PitchCenterEstimate["voicing"] {
  if (
    voicedWindowRatio >= 0.6 &&
    uncertaintyCents <= VOICED_UNCERTAINTY_CENTS &&
    confidence >= 0.7
  ) {
    return "voiced";
  }

  if (
    voicedWindowRatio >= 0.25 &&
    uncertaintyCents <= MIXED_UNCERTAINTY_CENTS &&
    confidence >= 0.45
  ) {
    return "mixed";
  }

  return "unvoiced";
}

function frequencyToMidi(frequencyHz: number): number {
  return 69 + 12 * Math.log2(frequencyHz / 440);
}

function midiToFrequency(midiValue: number): number {
  return 440 * 2 ** ((midiValue - 69) / 12);
}

function midiToNoteName(midiValue: number): string {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const pitchClass = ((midiValue % 12) + 12) % 12;
  const octave = Math.floor(midiValue / 12) - 1;
  return `${noteNames[pitchClass]}${octave}`;
}
