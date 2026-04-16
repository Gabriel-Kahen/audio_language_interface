import { createHash } from "node:crypto";

import {
  ANALYZER_NAME,
  ANALYZER_VERSION,
  TRANSIENT_HOP_SECONDS,
  TRANSIENT_MIN_CREST_DB,
  TRANSIENT_MIN_EVENT_SEPARATION_SECONDS,
  TRANSIENT_MIN_LOCAL_CONTRAST_DB,
  TRANSIENT_MIN_RMS_DBFS,
  TRANSIENT_WINDOW_SECONDS,
} from "../constants.js";
import type {
  AudioVersion,
  NormalizedAudioData,
  TransientDetectionOptions,
  TransientEvent,
  TransientMap,
} from "../types.js";
import { clamp, maxAbs, rms, toDecibels } from "../utils/math.js";

interface TransientFrameMetrics {
  start: number;
  end: number;
  rmsDbfs: number;
  peakDbfs: number;
  crestDb: number;
  contrastDb: number;
  score: number;
}

/**
 * Build a deterministic transient map from normalized mono audio data.
 *
 * The detector uses short overlapping windows, a simple contrast score against
 * the immediately preceding frame, and local-maxima peak picking. This keeps
 * the output stable enough for slice derivation without overfitting to any
 * musical timeline assumptions.
 */
export function buildTransientMap(
  audioVersion: AudioVersion,
  audioData: NormalizedAudioData,
  options: TransientDetectionOptions = {},
): TransientMap {
  const windowSize = Math.max(64, Math.round(audioData.sampleRateHz * TRANSIENT_WINDOW_SECONDS));
  const hopSize = Math.max(32, Math.round(audioData.sampleRateHz * TRANSIENT_HOP_SECONDS));
  const frames = measureTransientFrames(audioData.mono, windowSize, hopSize);
  const transients = pickTransientEvents(frames, audioData.sampleRateHz);

  return {
    schema_version: "1.0.0",
    transient_map_id: createTransientMapId(audioVersion, windowSize, hopSize),
    asset_id: audioVersion.asset_id,
    version_id: audioVersion.version_id,
    generated_at: options.generatedAt ?? audioVersion.lineage.created_at,
    detector: {
      name: ANALYZER_NAME,
      version: ANALYZER_VERSION,
    },
    transients,
  };
}

function measureTransientFrames(
  mono: Float32Array,
  windowSize: number,
  hopSize: number,
): TransientFrameMetrics[] {
  if (mono.length === 0) {
    return [];
  }

  const frames: TransientFrameMetrics[] = [];
  let start = 0;

  while (start < mono.length) {
    const end = Math.min(start + windowSize, mono.length);
    if (end <= start) {
      break;
    }

    const window = mono.slice(start, end);
    const rmsDbfs = toDecibels(rms(window));
    const peakDbfs = toDecibels(maxAbs(window));
    const crestDb = peakDbfs - rmsDbfs;
    const previous = frames[frames.length - 1];
    const previousReferenceDb =
      previous === undefined ? -120 : Math.max(previous.rmsDbfs, previous.peakDbfs);
    const currentReferenceDb = Math.max(rmsDbfs, peakDbfs);
    const contrastDb = Math.max(0, currentReferenceDb - previousReferenceDb);
    const contrastScore = clamp((contrastDb - TRANSIENT_MIN_LOCAL_CONTRAST_DB) / 12, 0, 1);
    const crestScore = clamp((crestDb - TRANSIENT_MIN_CREST_DB) / 12, 0, 1);
    const activityScore = clamp((peakDbfs - TRANSIENT_MIN_RMS_DBFS) / 30, 0, 1);

    frames.push({
      start,
      end,
      rmsDbfs,
      peakDbfs,
      crestDb,
      contrastDb,
      score: clamp(0.5 * contrastScore + 0.25 * crestScore + 0.25 * activityScore, 0, 1),
    });

    start += hopSize;
  }

  return frames;
}

function pickTransientEvents(
  frames: readonly TransientFrameMetrics[],
  sampleRateHz: number,
): TransientEvent[] {
  const detected: TransientEvent[] = [];
  const minimumSeparationFrames = Math.max(
    1,
    Math.round(
      (sampleRateHz * TRANSIENT_MIN_EVENT_SEPARATION_SECONDS) /
        (sampleRateHz * TRANSIENT_HOP_SECONDS),
    ),
  );

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    if (frame === undefined) {
      continue;
    }

    const previousScore = frames[index - 1]?.score ?? 0;
    const nextScore = frames[index + 1]?.score ?? 0;
    const isLocalMaximum = frame.score >= previousScore && frame.score >= nextScore;

    if (
      !isLocalMaximum ||
      frame.score < 0.35 ||
      frame.contrastDb < TRANSIENT_MIN_LOCAL_CONTRAST_DB ||
      frame.rmsDbfs < TRANSIENT_MIN_RMS_DBFS
    ) {
      continue;
    }

    const timeSeconds = roundToSixDecimals(((frame.start + frame.end) * 0.5) / sampleRateHz);
    const strength = roundToSixDecimals(frame.score);
    const confidence = roundToSixDecimals(
      clamp(
        0.6 * frame.score +
          0.2 * clamp((frame.crestDb - TRANSIENT_MIN_CREST_DB) / 12, 0, 1) +
          0.2 * clamp((frame.peakDbfs + 18) / 24, 0, 1),
        0,
        1,
      ),
    );

    const previousTransient = detected[detected.length - 1];
    if (
      previousTransient !== undefined &&
      timeSeconds - previousTransient.time_seconds < TRANSIENT_MIN_EVENT_SEPARATION_SECONDS
    ) {
      if (strength > previousTransient.strength) {
        detected[detected.length - 1] = {
          time_seconds: timeSeconds,
          strength,
          confidence,
          kind: "transient",
        };
      }
      continue;
    }

    detected.push({
      time_seconds: timeSeconds,
      strength,
      confidence,
      kind: "transient",
    });

    index += minimumSeparationFrames - 1;
  }

  return detected;
}

function createTransientMapId(
  audioVersion: AudioVersion,
  windowSize: number,
  hopSize: number,
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
    .update(String(windowSize))
    .update("|")
    .update(String(hopSize))
    .digest("hex")
    .slice(0, 24)
    .toUpperCase();

  return `transientmap_${digest}`;
}

function roundToSixDecimals(value: number): number {
  return Number(value.toFixed(6));
}
