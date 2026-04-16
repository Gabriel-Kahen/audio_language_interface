import {
  TEMPO_DEFAULT_MAX_BPM,
  TEMPO_DEFAULT_MAX_CANDIDATES,
  TEMPO_DEFAULT_MIN_BPM,
} from "./constants.js";
import { detectTransients } from "./detect-transients.js";
import type {
  AudioVersion,
  TempoEstimate,
  TempoEstimationOptions,
  TransientEvent,
} from "./types.js";
import { clamp } from "./utils/math.js";

const MIN_REQUIRED_TRANSIENTS = 3;
const MAX_PAIR_SPAN = 4;
const MAX_GRID_MULTIPLE = 8;
const ALIGNMENT_TOLERANCE_RATIO = 0.12;

interface TempoCandidateScore {
  bpm: number;
  score: number;
}

/**
 * Estimate a coarse tempo from transient spacing in one `AudioVersion`.
 *
 * This standalone estimator intentionally stays narrow: it reuses the baseline
 * transient detector, scores tempo candidates against inter-onset spacing, and
 * reports one best BPM plus confidence and close alternates when ambiguity
 * remains.
 */
export function estimateTempo(
  audioVersion: AudioVersion,
  options: TempoEstimationOptions = {},
): TempoEstimate {
  const minBpm = options.minBpm ?? TEMPO_DEFAULT_MIN_BPM;
  const maxBpm = options.maxBpm ?? TEMPO_DEFAULT_MAX_BPM;
  const maxCandidates = options.maxCandidates ?? TEMPO_DEFAULT_MAX_CANDIDATES;

  validateTempoOptions(minBpm, maxBpm, maxCandidates);

  const transientMap = detectTransients(
    audioVersion,
    options.workspaceRoot === undefined ? {} : { workspaceRoot: options.workspaceRoot },
  );
  const transients = transientMap.transients;

  if (transients.length < MIN_REQUIRED_TRANSIENTS) {
    return {
      bpm: null,
      confidence: 0,
      ambiguity_candidates_bpm: [],
    };
  }

  const candidateBpms = collectCandidateBpms(transients, minBpm, maxBpm);
  const scoredCandidates = scoreTempoCandidates(transients, candidateBpms);

  if (scoredCandidates.length === 0) {
    return {
      bpm: null,
      confidence: 0,
      ambiguity_candidates_bpm: [],
    };
  }

  const bestCandidate = scoredCandidates[0];
  const secondCandidate = scoredCandidates[1];
  if (bestCandidate === undefined) {
    return {
      bpm: null,
      confidence: 0,
      ambiguity_candidates_bpm: [],
    };
  }

  const confidence = computeConfidence(bestCandidate, secondCandidate, transients.length);
  if (confidence < 0.35) {
    return {
      bpm: null,
      confidence,
      ambiguity_candidates_bpm: scoredCandidates
        .slice(0, maxCandidates)
        .map((candidate) => roundToTwoDecimals(candidate.bpm)),
    };
  }

  return {
    bpm: roundToTwoDecimals(bestCandidate.bpm),
    confidence,
    beat_interval_seconds: roundToSixDecimals(60 / bestCandidate.bpm),
    ambiguity_candidates_bpm: scoredCandidates
      .slice(1)
      .filter((candidate) => bestCandidate.score - candidate.score <= 0.18)
      .slice(0, Math.max(0, maxCandidates - 1))
      .map((candidate) => roundToTwoDecimals(candidate.bpm)),
  };
}

function validateTempoOptions(minBpm: number, maxBpm: number, maxCandidates: number): void {
  if (!Number.isFinite(minBpm) || !Number.isFinite(maxBpm) || minBpm <= 0 || maxBpm <= 0) {
    throw new Error("Tempo estimation BPM bounds must be finite positive numbers");
  }

  if (minBpm >= maxBpm) {
    throw new Error("Tempo estimation minBpm must be lower than maxBpm");
  }

  if (!Number.isInteger(maxCandidates) || maxCandidates < 1) {
    throw new Error("Tempo estimation maxCandidates must be a positive integer");
  }
}

function collectCandidateBpms(
  transients: readonly TransientEvent[],
  minBpm: number,
  maxBpm: number,
): number[] {
  const candidates = new Set<number>();

  for (let startIndex = 0; startIndex < transients.length - 1; startIndex += 1) {
    for (
      let endIndex = startIndex + 1;
      endIndex < transients.length && endIndex <= startIndex + MAX_PAIR_SPAN;
      endIndex += 1
    ) {
      const start = transients[startIndex];
      const end = transients[endIndex];
      if (start === undefined || end === undefined) {
        continue;
      }

      const intervalSeconds = end.time_seconds - start.time_seconds;
      const pulseSpan = endIndex - startIndex;
      if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0 || pulseSpan <= 0) {
        continue;
      }

      const baseBpm = (60 * pulseSpan) / intervalSeconds;
      addCandidateIfInRange(candidates, baseBpm, minBpm, maxBpm);
      addCandidateIfInRange(candidates, baseBpm / 2, minBpm, maxBpm);
      addCandidateIfInRange(candidates, baseBpm * 2, minBpm, maxBpm);
    }
  }

  return [...candidates].sort((a, b) => a - b);
}

function addCandidateIfInRange(
  candidates: Set<number>,
  bpm: number,
  minBpm: number,
  maxBpm: number,
): void {
  if (!Number.isFinite(bpm) || bpm < minBpm || bpm > maxBpm) {
    return;
  }

  candidates.add(roundToTwoDecimals(bpm));
}

function scoreTempoCandidates(
  transients: readonly TransientEvent[],
  candidateBpms: readonly number[],
): TempoCandidateScore[] {
  const scored = candidateBpms
    .map((bpm) => ({
      bpm,
      score: scoreTempoCandidate(transients, bpm),
    }))
    .filter((candidate) => candidate.score > 0);

  scored.sort((left, right) => right.score - left.score || left.bpm - right.bpm);
  return scored;
}

function scoreTempoCandidate(transients: readonly TransientEvent[], bpm: number): number {
  const periodSeconds = 60 / bpm;
  let alignedWeight = 0;
  let totalWeight = 0;
  let exactMatchWeight = 0;

  for (let startIndex = 0; startIndex < transients.length - 1; startIndex += 1) {
    for (
      let endIndex = startIndex + 1;
      endIndex < transients.length && endIndex <= startIndex + MAX_PAIR_SPAN;
      endIndex += 1
    ) {
      const start = transients[startIndex];
      const end = transients[endIndex];
      if (start === undefined || end === undefined) {
        continue;
      }

      const intervalSeconds = end.time_seconds - start.time_seconds;
      if (intervalSeconds <= 0) {
        continue;
      }

      const multiple = Math.round(intervalSeconds / periodSeconds);
      if (multiple < 1 || multiple > MAX_GRID_MULTIPLE) {
        continue;
      }

      const averageStrength = ((start.strength ?? 0) + (end.strength ?? 0)) * 0.5;
      const pairWeight = averageStrength / multiple;
      const normalizedError = Math.abs(intervalSeconds - multiple * periodSeconds) / periodSeconds;
      totalWeight += pairWeight;

      if (normalizedError > ALIGNMENT_TOLERANCE_RATIO) {
        continue;
      }

      const alignment = 1 - normalizedError / ALIGNMENT_TOLERANCE_RATIO;
      alignedWeight += pairWeight * alignment;
      if (multiple === 1) {
        exactMatchWeight += pairWeight * alignment;
      }
    }
  }

  if (totalWeight === 0) {
    return 0;
  }

  const coverage = alignedWeight / totalWeight;
  const directPulsePreference = exactMatchWeight / totalWeight;
  return clamp(0.75 * coverage + 0.25 * directPulsePreference, 0, 1);
}

function computeConfidence(
  bestCandidate: TempoCandidateScore,
  secondCandidate: TempoCandidateScore | undefined,
  transientCount: number,
): number {
  const separation = bestCandidate.score - (secondCandidate?.score ?? 0);
  const pulseScore = clamp((transientCount - 2) / 6, 0, 1);

  return roundToSixDecimals(
    clamp(0.65 * bestCandidate.score + 0.2 * separation + 0.15 * pulseScore, 0, 1),
  );
}

function roundToTwoDecimals(value: number): number {
  return Number(value.toFixed(2));
}

function roundToSixDecimals(value: number): number {
  return Number(value.toFixed(6));
}
