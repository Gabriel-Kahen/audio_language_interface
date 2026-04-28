import { cwd } from "node:process";

import { assertValidAudioVersion } from "@audio-language-interface/core";
import type {
  AudioVersion,
  EstimatePitchCenterOptions,
  NormalizedAudioData,
  PitchCenterEstimate,
} from "./types.js";
import { clamp, rms, sliceFrames, toDecibels } from "./utils/math.js";
import { assertValidPitchCenterEstimate } from "./utils/schema.js";
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

interface PitchLagCandidate {
  lag: number;
  score: number;
  harmonicScore: number;
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
    const estimate: PitchCenterEstimate = {
      voicing: "unvoiced",
      confidence: 0,
      analyzed_window_count: analyzedWindowCount,
      voiced_window_count: candidates.length,
      voiced_window_ratio: 0,
    };
    assertValidPitchCenterEstimate(estimate);
    return estimate;
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
    assertValidPitchCenterEstimate(estimate);
    return estimate;
  }

  const roundedMidi = Math.round(weightedMidi);
  const result: PitchCenterEstimate = {
    ...estimate,
    frequency_hz: frequencyHz,
    midi_note: roundedMidi,
    note_name: midiToNoteName(roundedMidi),
    uncertainty_cents: uncertaintyCents,
  };
  assertValidPitchCenterEstimate(result);
  return result;
}

function collectWindowStarts(frameCount: number, windowFrames: number): number[] {
  if (frameCount <= 0) {
    return [0];
  }

  if (frameCount <= windowFrames) {
    return [0];
  }

  const lastStart = Math.max(frameCount - windowFrames, 0);
  if (lastStart === 0) {
    return [0];
  }

  if (frameCount < windowFrames * 2) {
    return [0, lastStart];
  }

  const starts: number[] = [];

  for (let step = 0; step < MAX_ANALYSIS_WINDOWS; step += 1) {
    const ratio = step / (MAX_ANALYSIS_WINDOWS - 1);
    starts.push(Math.round(lastStart * ratio));
  }

  return Array.from(new Set(starts)).sort((left, right) => left - right);
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
  const lagCandidates: PitchLagCandidate[] = [];
  let firstNearBestLag = 0;
  for (let lag = minimumLag; lag <= maximumLag && lag < centeredSamples.length / 2; lag += 1) {
    const score = lagScores[lag] ?? 0;
    const previous = lagScores[lag - 1] ?? Number.NEGATIVE_INFINITY;
    const next = lagScores[lag + 1] ?? Number.NEGATIVE_INFINITY;
    const isLocalMaximum = score >= previous && score >= next;

    if (isLocalMaximum && score >= MIN_CORRELATION_SCORE) {
      lagCandidates.push({
        lag,
        score,
        harmonicScore: scoreHarmonicSupport(centeredSamples, sampleRateHz, sampleRateHz / lag),
      });

      if (firstNearBestLag === 0 && score >= targetScore) {
        firstNearBestLag = lag;
        bestScore = score;
      }
    }
  }

  if (firstNearBestLag === 0) {
    return undefined;
  }

  const bestLag = selectOctaveVerifiedLag(lagCandidates, firstNearBestLag);
  bestScore = lagScores[bestLag] ?? bestScore;

  const frequencyHz = sampleRateHz / bestLag;
  return {
    frequencyHz,
    midiValue: frequencyToMidi(frequencyHz),
    score: bestScore,
  };
}

function selectOctaveVerifiedLag(candidates: PitchLagCandidate[], initialLag: number): number {
  const initialCandidate = candidates.find((candidate) => candidate.lag === initialLag);
  if (initialCandidate === undefined) {
    return initialLag;
  }

  let selected = initialCandidate;
  let selectedScore = combinedLagScore(selected);

  for (const candidate of candidates) {
    if (
      candidate.lag === initialLag ||
      candidate.lag < initialLag ||
      !isOctaveRelated(candidate.lag, initialLag)
    ) {
      continue;
    }

    if (candidate.score < initialCandidate.score - 0.12) {
      continue;
    }

    const candidateScore = combinedLagScore(candidate);
    if (candidateScore > selectedScore + 0.025) {
      selected = candidate;
      selectedScore = candidateScore;
    }
  }

  return selected.lag;
}

function combinedLagScore(candidate: PitchLagCandidate): number {
  return candidate.score * 0.65 + candidate.harmonicScore * 0.35;
}

function isOctaveRelated(candidateLag: number, referenceLag: number): boolean {
  const ratio = candidateLag / referenceLag;
  return (ratio >= 0.48 && ratio <= 0.52) || (ratio >= 1.9 && ratio <= 2.1);
}

function scoreHarmonicSupport(
  samples: Float32Array,
  sampleRateHz: number,
  frequencyHz: number,
): number {
  const nyquistHz = sampleRateHz / 2;
  const harmonicMagnitudes: number[] = [];

  for (let harmonic = 1; harmonic <= 6; harmonic += 1) {
    const harmonicFrequencyHz = frequencyHz * harmonic;
    if (harmonicFrequencyHz >= nyquistHz) {
      break;
    }

    harmonicMagnitudes.push(measureFrequencyMagnitude(samples, sampleRateHz, harmonicFrequencyHz));
  }

  if (harmonicMagnitudes.length === 0) {
    return 0;
  }

  const strongestMagnitude = Math.max(...harmonicMagnitudes);
  if (strongestMagnitude <= 1e-8) {
    return 0;
  }

  let weightedCoverage = 0;
  let weightTotal = 0;
  let weightedEnergy = 0;
  for (let index = 0; index < harmonicMagnitudes.length; index += 1) {
    const magnitude = harmonicMagnitudes[index] ?? 0;
    const weight = 1 / (index + 1);
    weightedCoverage += magnitude >= strongestMagnitude * 0.25 ? weight : 0;
    weightedEnergy += (magnitude / strongestMagnitude) * weight;
    weightTotal += weight;
  }

  const fundamentalPresence = (harmonicMagnitudes[0] ?? 0) / strongestMagnitude;
  return clamp(
    (weightedCoverage / weightTotal) * 0.35 +
      (weightedEnergy / weightTotal) * 0.35 +
      fundamentalPresence * 0.3,
    0,
    1,
  );
}

function measureFrequencyMagnitude(
  samples: Float32Array,
  sampleRateHz: number,
  frequencyHz: number,
): number {
  let real = 0;
  let imaginary = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const phase = (2 * Math.PI * frequencyHz * index) / sampleRateHz;
    const sample = samples[index] ?? 0;
    real += sample * Math.cos(phase);
    imaginary -= sample * Math.sin(phase);
  }

  return (2 * Math.hypot(real, imaginary)) / Math.max(samples.length, 1);
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
