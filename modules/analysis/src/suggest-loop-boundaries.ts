import { createHash } from "node:crypto";
import { cwd } from "node:process";

import { assertValidAudioVersion } from "@audio-language-interface/core";
import { buildTransientMap } from "./analyzers/transients.js";
import {
  ANALYZER_NAME,
  ANALYZER_VERSION,
  LOOP_BOUNDARY_ALIGNMENT_WINDOW_SECONDS,
  LOOP_SUGGESTION_MAX_TRANSIENT_ANCHORS,
  LOOP_SUGGESTION_MIN_CONFIDENCE,
  LOOP_SUGGESTION_MIN_DURATION_SECONDS,
  LOOP_SUGGESTION_MIN_REPEAT_SIMILARITY,
  SCHEMA_VERSION,
} from "./constants.js";
import type {
  AudioVersion,
  LoopBoundarySuggestion,
  LoopBoundarySuggestionOptions,
  LoopBoundarySuggestionSet,
  NormalizedAudioData,
} from "./types.js";
import { clamp, correlation, rms } from "./utils/math.js";
import { loadNormalizedAudioData } from "./utils/wav.js";

interface CandidateMetrics {
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  bestSimilarity: number;
  repeatCount: number;
  anchorSupportScore: number;
  confidence: number;
}

interface RepeatMetrics {
  similarity: number;
}

interface BoundaryAnchor {
  frame: number;
  strength: number;
}

const MAX_COMPARISON_SAMPLES = 2048;

/**
 * Suggest loop boundary ranges from one materialized `AudioVersion`.
 *
 * The detector stays fully in the analysis layer: it searches for repeated
 * time ranges, scores them with transient-alignment and adjacent-similarity
 * heuristics, and returns explicit seconds-based boundary suggestions without
 * any beat-grid or DAW timeline assumptions.
 */
export function suggestLoopBoundaries(
  audioVersion: AudioVersion,
  options: LoopBoundarySuggestionOptions = {},
): LoopBoundarySuggestionSet {
  assertValidAudioVersion(audioVersion);

  const audioData = loadNormalizedAudioData(audioVersion, options.workspaceRoot ?? cwd());
  const transientMap = buildTransientMap(audioVersion, audioData, {
    ...(options.generatedAt === undefined ? {} : { generatedAt: options.generatedAt }),
    ...(options.workspaceRoot === undefined ? {} : { workspaceRoot: options.workspaceRoot }),
  });
  const suggestions = buildLoopSuggestions(audioData, transientMap.transients, options);

  return {
    schema_version: SCHEMA_VERSION,
    loop_boundary_suggestion_id: createLoopBoundarySuggestionId(audioVersion, options),
    asset_id: audioVersion.asset_id,
    version_id: audioVersion.version_id,
    generated_at: options.generatedAt ?? audioVersion.lineage.created_at,
    detector: {
      name: ANALYZER_NAME,
      version: ANALYZER_VERSION,
    },
    suggestions,
  };
}

function buildLoopSuggestions(
  audioData: NormalizedAudioData,
  transients: readonly { time_seconds: number; strength: number }[],
  options: LoopBoundarySuggestionOptions,
): LoopBoundarySuggestion[] {
  const minDurationSeconds = options.minDurationSeconds ?? LOOP_SUGGESTION_MIN_DURATION_SECONDS;
  const maxDurationSeconds = options.maxDurationSeconds ?? audioData.durationSeconds;
  const maxSuggestions = options.maxSuggestions ?? 3;
  const boundaryAnchors = buildCandidateBoundaryAnchors(audioData, transients);
  const candidates: CandidateMetrics[] = [];

  for (let startIndex = 0; startIndex < boundaryAnchors.length; startIndex += 1) {
    const startFrame = boundaryAnchors[startIndex]?.frame;
    if (startFrame === undefined) {
      continue;
    }

    for (let endIndex = startIndex + 1; endIndex < boundaryAnchors.length; endIndex += 1) {
      const endFrame = boundaryAnchors[endIndex]?.frame;
      if (endFrame === undefined) {
        continue;
      }

      const durationFrames = endFrame - startFrame;
      if (durationFrames <= 0) {
        continue;
      }

      const durationSeconds = durationFrames / audioData.sampleRateHz;
      if (durationSeconds < minDurationSeconds || durationSeconds > maxDurationSeconds) {
        continue;
      }

      const metrics = measureCandidate(
        audioData,
        boundaryAnchors,
        startFrame,
        endFrame,
        durationFrames,
      );
      if (
        metrics.bestSimilarity < LOOP_SUGGESTION_MIN_REPEAT_SIMILARITY ||
        metrics.confidence < LOOP_SUGGESTION_MIN_CONFIDENCE
      ) {
        continue;
      }

      candidates.push(metrics);
    }
  }

  const uniqueCandidates = dedupeCandidates(candidates);
  uniqueCandidates.sort((left, right) => {
    const confidenceDelta = right.confidence - left.confidence;
    if (Math.abs(confidenceDelta) > 0.02) {
      return right.confidence - left.confidence;
    }

    if (right.repeatCount !== left.repeatCount) {
      return right.repeatCount - left.repeatCount;
    }

    if (left.durationFrames !== right.durationFrames) {
      return left.durationFrames - right.durationFrames;
    }

    return left.startFrame - right.startFrame;
  });

  return uniqueCandidates.slice(0, maxSuggestions).map((candidate, index, array) => {
    const competingSuggestion = array.find((other, otherIndex) => {
      if (otherIndex === index) {
        return false;
      }

      const isNested =
        other.startFrame === candidate.startFrame &&
        other.endFrame > candidate.endFrame &&
        other.durationFrames % candidate.durationFrames === 0;

      return isNested;
    });

    const durationSeconds = roundToSixDecimals(candidate.durationFrames / audioData.sampleRateHz);
    const suggestion: LoopBoundarySuggestion = {
      start_seconds: roundToSixDecimals(candidate.startFrame / audioData.sampleRateHz),
      end_seconds: roundToSixDecimals(candidate.endFrame / audioData.sampleRateHz),
      duration_seconds: durationSeconds,
      confidence: roundToSixDecimals(candidate.confidence),
      rationale: formatRationale(candidate, audioData, competingSuggestion),
    };

    return suggestion;
  });
}

function buildCandidateBoundaryAnchors(
  audioData: NormalizedAudioData,
  transients: readonly { time_seconds: number; strength: number }[],
): BoundaryAnchor[] {
  const rankedAnchors = [...transients]
    .sort((left, right) => {
      if (right.strength !== left.strength) {
        return right.strength - left.strength;
      }

      return left.time_seconds - right.time_seconds;
    })
    .slice(0, LOOP_SUGGESTION_MAX_TRANSIENT_ANCHORS)
    .map((transient) => ({
      frame: clampFrame(
        Math.round(transient.time_seconds * audioData.sampleRateHz),
        audioData.frameCount,
      ),
      strength: transient.strength,
    }));

  const byFrame = new Map<number, number>([
    [0, 1],
    [audioData.frameCount, 1],
  ]);
  for (const anchor of rankedAnchors) {
    const existingStrength = byFrame.get(anchor.frame) ?? 0;
    byFrame.set(anchor.frame, Math.max(existingStrength, anchor.strength));
  }

  return [...byFrame.entries()]
    .map(([frame, strength]) => ({ frame, strength }))
    .sort((left, right) => left.frame - right.frame);
}

function measureCandidate(
  audioData: NormalizedAudioData,
  boundaryAnchors: readonly BoundaryAnchor[],
  startFrame: number,
  endFrame: number,
  durationFrames: number,
): CandidateMetrics {
  const adjacentRepeats: RepeatMetrics[] = [];
  const followingRepeat = measureAdjacentRepeat(
    audioData.mono,
    startFrame,
    endFrame,
    endFrame,
    endFrame + durationFrames,
  );
  if (followingRepeat !== null) {
    adjacentRepeats.push(followingRepeat);
  }

  const precedingRepeat = measureAdjacentRepeat(
    audioData.mono,
    startFrame,
    endFrame,
    startFrame - durationFrames,
    startFrame,
  );
  if (precedingRepeat !== null) {
    adjacentRepeats.push(precedingRepeat);
  }

  const bestSimilarity = adjacentRepeats.reduce(
    (best, repeat) => Math.max(best, repeat.similarity),
    0,
  );
  const repeatCount = countAdjacentRepeats(audioData.mono, startFrame, durationFrames);
  const anchorSupportScore = measureAnchorSupport(
    startFrame,
    endFrame,
    boundaryAnchors,
    audioData.sampleRateHz,
  );
  const repeatSupportScore = clamp((repeatCount - 1) / 3, 0, 1);
  const confidence = clamp(
    0.75 * bestSimilarity + 0.15 * anchorSupportScore + 0.1 * repeatSupportScore,
    0,
    1,
  );

  return {
    startFrame,
    endFrame,
    durationFrames,
    bestSimilarity,
    repeatCount,
    anchorSupportScore,
    confidence,
  };
}

function dedupeCandidates(candidates: readonly CandidateMetrics[]): CandidateMetrics[] {
  const seen = new Set<string>();
  const unique: CandidateMetrics[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.startFrame}:${candidate.endFrame}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(candidate);
  }

  return unique;
}

function measureAdjacentRepeat(
  mono: Float32Array,
  firstStartFrame: number,
  firstEndFrame: number,
  secondStartFrame: number,
  secondEndFrame: number,
): RepeatMetrics | null {
  if (secondStartFrame < 0 || secondEndFrame > mono.length) {
    return null;
  }

  const firstDurationFrames = firstEndFrame - firstStartFrame;
  const secondDurationFrames = secondEndFrame - secondStartFrame;
  if (firstDurationFrames <= 0 || secondDurationFrames !== firstDurationFrames) {
    return null;
  }

  return {
    similarity: measureRegionSimilarity(
      mono,
      firstStartFrame,
      firstEndFrame,
      secondStartFrame,
      secondEndFrame,
    ),
  };
}

function measureRegionSimilarity(
  mono: Float32Array,
  firstStartFrame: number,
  firstEndFrame: number,
  secondStartFrame: number,
  secondEndFrame: number,
): number {
  const firstDurationFrames = firstEndFrame - firstStartFrame;
  const secondDurationFrames = secondEndFrame - secondStartFrame;
  const comparisonFrames = Math.min(firstDurationFrames, secondDurationFrames);
  if (comparisonFrames <= 1) {
    return 0;
  }

  const sampleCount = Math.min(MAX_COMPARISON_SAMPLES, comparisonFrames);
  const firstSamples = new Float32Array(sampleCount);
  const secondSamples = new Float32Array(sampleCount);
  const firstAbsSamples = new Float32Array(sampleCount);
  const secondAbsSamples = new Float32Array(sampleCount);
  const step = comparisonFrames / sampleCount;

  let squaredErrorSum = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const firstIndex = clampFrame(firstStartFrame + Math.floor(index * step), mono.length - 1);
    const secondIndex = clampFrame(secondStartFrame + Math.floor(index * step), mono.length - 1);
    const firstSample = mono[firstIndex] ?? 0;
    const secondSample = mono[secondIndex] ?? 0;

    firstSamples[index] = firstSample;
    secondSamples[index] = secondSample;
    firstAbsSamples[index] = Math.abs(firstSample);
    secondAbsSamples[index] = Math.abs(secondSample);

    const delta = firstSample - secondSample;
    squaredErrorSum += delta * delta;
  }

  const rawCorrelation = Math.abs(correlation(firstSamples, secondSamples));
  const envelopeCorrelation = clamp(
    (correlation(firstAbsSamples, secondAbsSamples) + 1) * 0.5,
    0,
    1,
  );
  const normalization = Math.max(rms(firstSamples), rms(secondSamples), 1e-6);
  const normalizedRmse = Math.sqrt(squaredErrorSum / sampleCount) / normalization;
  const errorScore = clamp(1 - normalizedRmse, 0, 1);

  return clamp(0.45 * rawCorrelation + 0.35 * envelopeCorrelation + 0.2 * errorScore, 0, 1);
}

function countAdjacentRepeats(
  mono: Float32Array,
  startFrame: number,
  durationFrames: number,
): number {
  let repeatCount = 1;
  let regionStartFrame = startFrame;
  let regionEndFrame = startFrame + durationFrames;

  while (regionEndFrame + durationFrames <= mono.length) {
    const nextSimilarity = measureRegionSimilarity(
      mono,
      regionStartFrame,
      regionEndFrame,
      regionEndFrame,
      regionEndFrame + durationFrames,
    );
    if (nextSimilarity < LOOP_SUGGESTION_MIN_REPEAT_SIMILARITY) {
      break;
    }

    repeatCount += 1;
    regionStartFrame = regionEndFrame;
    regionEndFrame += durationFrames;
  }

  regionStartFrame = startFrame;
  while (regionStartFrame - durationFrames >= 0) {
    const previousSimilarity = measureRegionSimilarity(
      mono,
      regionStartFrame,
      regionStartFrame + durationFrames,
      regionStartFrame - durationFrames,
      regionStartFrame,
    );
    if (previousSimilarity < LOOP_SUGGESTION_MIN_REPEAT_SIMILARITY) {
      break;
    }

    repeatCount += 1;
    regionStartFrame -= durationFrames;
  }

  return repeatCount;
}

function measureAnchorSupport(
  startFrame: number,
  endFrame: number,
  boundaryAnchors: readonly BoundaryAnchor[],
  sampleRateHz: number,
): number {
  const maxDistanceFrames = Math.max(
    1,
    Math.round(sampleRateHz * LOOP_BOUNDARY_ALIGNMENT_WINDOW_SECONDS),
  );

  const startSupport = nearestAnchorSupport(startFrame, boundaryAnchors, maxDistanceFrames);
  const endSupport = nearestAnchorSupport(endFrame, boundaryAnchors, maxDistanceFrames);
  return roundToSixDecimals((startSupport + endSupport) * 0.5);
}

function nearestAnchorSupport(
  targetFrame: number,
  boundaryAnchors: readonly BoundaryAnchor[],
  maxDistanceFrames: number,
): number {
  let bestScore = 0;

  for (const anchor of boundaryAnchors) {
    const distance = Math.abs(anchor.frame - targetFrame);
    if (distance > maxDistanceFrames) {
      continue;
    }

    const distanceScore = clamp(1 - distance / maxDistanceFrames, 0, 1);
    bestScore = Math.max(bestScore, distanceScore * anchor.strength);
  }

  return bestScore;
}

function formatRationale(
  candidate: CandidateMetrics,
  audioData: NormalizedAudioData,
  competingSuggestion?: CandidateMetrics,
): string {
  const durationSeconds = roundToSixDecimals(candidate.durationFrames / audioData.sampleRateHz);
  const base = `Detected a ${durationSeconds}s region that repeats in adjacent audio with ${Math.round(candidate.bestSimilarity * 100)}% similarity and anchor support score ${Math.round(candidate.anchorSupportScore * 100)}%.`;
  const repeatSupport =
    candidate.repeatCount > 1
      ? ` The same span appears ${candidate.repeatCount} times consecutively in the file.`
      : "";
  const ambiguity =
    competingSuggestion === undefined
      ? ""
      : ` A longer nearby alternative also scored similarly, so treat this as a preferred boundary rather than a unique ground truth.`;

  return `${base}${repeatSupport}${ambiguity}`;
}

function createLoopBoundarySuggestionId(
  audioVersion: AudioVersion,
  options: LoopBoundarySuggestionOptions,
): string {
  const digest = createHash("sha256")
    .update(audioVersion.version_id)
    .update("|")
    .update(audioVersion.audio.storage_ref)
    .update("|")
    .update(ANALYZER_NAME)
    .update("|")
    .update(ANALYZER_VERSION)
    .update("|")
    .update(String(options.minDurationSeconds ?? LOOP_SUGGESTION_MIN_DURATION_SECONDS))
    .update("|")
    .update(String(options.maxDurationSeconds ?? audioVersion.audio.duration_seconds))
    .update("|")
    .update(String(options.maxSuggestions ?? 3))
    .digest("hex")
    .slice(0, 24)
    .toUpperCase();

  return `loopbounds_${digest}`;
}

function clampFrame(frame: number, maxFrame: number): number {
  return Math.max(0, Math.min(frame, maxFrame));
}

function roundToSixDecimals(value: number): number {
  return Number(value.toFixed(6));
}
