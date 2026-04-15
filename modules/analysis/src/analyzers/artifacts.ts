import { SEGMENT_WINDOW_SECONDS } from "../constants.js";
import type { AnalysisAnnotation, NormalizedAudioData } from "../types.js";
import { clamp, rms, toDecibels } from "../utils/math.js";

interface ArtifactAnalysisResult {
  clipping_detected: boolean;
  noise_floor_dbfs: number;
  clipped_sample_count: number;
  annotations: AnalysisAnnotation[];
}

export function analyzeArtifacts(audioData: NormalizedAudioData): ArtifactAnalysisResult {
  const annotations: AnalysisAnnotation[] = [];
  let clippedSampleCount = 0;
  let clippedFrameCount = 0;
  let firstClippedFrame = -1;
  let lastClippedFrame = -1;

  for (let frameIndex = 0; frameIndex < audioData.frameCount; frameIndex += 1) {
    let clippedFrame = false;

    for (const channel of audioData.channels) {
      if (Math.abs(channel[frameIndex] ?? 0) >= 0.999) {
        clippedSampleCount += 1;
        clippedFrame = true;
      }
    }

    if (clippedFrame) {
      clippedFrameCount += 1;
      if (firstClippedFrame === -1) {
        firstClippedFrame = frameIndex;
      }
      lastClippedFrame = frameIndex;
    }
  }

  const windowSize = Math.max(32, Math.round(audioData.sampleRateHz * SEGMENT_WINDOW_SECONDS));
  const windowMetrics: Array<{
    start: number;
    end: number;
    rmsDbfs: number;
    crestDb: number;
    zeroCrossingRatio: number;
  }> = [];
  for (let start = 0; start < audioData.frameCount; start += windowSize) {
    const end = Math.min(start + windowSize, audioData.frameCount);
    const window = audioData.mono.slice(start, end);
    const windowRmsDbfs = toDecibels(rms(window));
    let samplePeak = 0;
    for (let index = 0; index < window.length; index += 1) {
      samplePeak = Math.max(samplePeak, Math.abs(window[index] ?? 0));
    }

    windowMetrics.push({
      start,
      end,
      rmsDbfs: windowRmsDbfs,
      crestDb: toDecibels(samplePeak) - windowRmsDbfs,
      zeroCrossingRatio: computeZeroCrossingRatio(window),
    });
  }

  const sorted = windowMetrics.map((window) => window.rmsDbfs).sort((left, right) => left - right);
  const percentileIndex = Math.max(0, Math.floor(sorted.length * 0.1) - 1);
  const noiseFloorDbfs = sorted[percentileIndex] ?? -120;

  annotations.push(...buildNoiseAnnotations(windowMetrics, audioData.sampleRateHz, noiseFloorDbfs));

  if (clippedSampleCount > 0 && firstClippedFrame >= 0) {
    annotations.push({
      kind: "clipping",
      start_seconds: firstClippedFrame / audioData.sampleRateHz,
      end_seconds: (lastClippedFrame + 1) / audioData.sampleRateHz,
      severity: clamp(clippedFrameCount / Math.max(audioData.frameCount * 0.01, 1), 0, 1),
      evidence: `${clippedSampleCount} clipped samples across ${clippedFrameCount} frames at or above 0.999 full scale`,
    });
  }

  return {
    clipping_detected: clippedSampleCount > 0,
    noise_floor_dbfs: noiseFloorDbfs,
    clipped_sample_count: clippedSampleCount,
    annotations,
  };
}

function buildNoiseAnnotations(
  windows: Array<{
    start: number;
    end: number;
    rmsDbfs: number;
    crestDb: number;
    zeroCrossingRatio: number;
  }>,
  sampleRateHz: number,
  noiseFloorDbfs: number,
): AnalysisAnnotation[] {
  const annotations: AnalysisAnnotation[] = [];
  let currentStart = -1;
  let currentEnd = -1;
  let currentMaxSeverity = 0;
  let currentMaxRmsDbfs = -120;
  let currentMinCrestDb = Number.POSITIVE_INFINITY;
  let currentMaxZeroCrossingRatio = 0;

  for (const window of windows) {
    const noiseSeverity = estimateNoiseSeverity(window, noiseFloorDbfs);
    const isNoiseWindow =
      noiseSeverity >= 0.25 &&
      window.rmsDbfs >= -72 &&
      window.rmsDbfs <= noiseFloorDbfs + 8 &&
      window.crestDb <= 6 &&
      window.zeroCrossingRatio >= 0.12;

    if (isNoiseWindow) {
      if (currentStart < 0) {
        currentStart = window.start;
        currentMaxSeverity = noiseSeverity;
        currentMaxRmsDbfs = window.rmsDbfs;
        currentMinCrestDb = window.crestDb;
        currentMaxZeroCrossingRatio = window.zeroCrossingRatio;
      }
      currentEnd = window.end;
      currentMaxSeverity = Math.max(currentMaxSeverity, noiseSeverity);
      currentMaxRmsDbfs = Math.max(currentMaxRmsDbfs, window.rmsDbfs);
      currentMinCrestDb = Math.min(currentMinCrestDb, window.crestDb);
      currentMaxZeroCrossingRatio = Math.max(currentMaxZeroCrossingRatio, window.zeroCrossingRatio);
      continue;
    }

    pushNoiseAnnotationIfSustained({
      annotations,
      currentStart,
      currentEnd,
      currentMaxSeverity,
      currentMaxRmsDbfs,
      currentMinCrestDb,
      currentMaxZeroCrossingRatio,
      sampleRateHz,
    });
    currentStart = -1;
    currentEnd = -1;
    currentMaxSeverity = 0;
    currentMaxRmsDbfs = -120;
    currentMinCrestDb = Number.POSITIVE_INFINITY;
    currentMaxZeroCrossingRatio = 0;
  }

  pushNoiseAnnotationIfSustained({
    annotations,
    currentStart,
    currentEnd,
    currentMaxSeverity,
    currentMaxRmsDbfs,
    currentMinCrestDb,
    currentMaxZeroCrossingRatio,
    sampleRateHz,
  });

  return annotations;
}

function pushNoiseAnnotationIfSustained(input: {
  annotations: AnalysisAnnotation[];
  currentStart: number;
  currentEnd: number;
  currentMaxSeverity: number;
  currentMaxRmsDbfs: number;
  currentMinCrestDb: number;
  currentMaxZeroCrossingRatio: number;
  sampleRateHz: number;
}): void {
  if (input.currentStart < 0 || input.currentEnd <= input.currentStart) {
    return;
  }

  const durationSeconds = (input.currentEnd - input.currentStart) / input.sampleRateHz;
  if (durationSeconds < 0.12) {
    return;
  }

  input.annotations.push({
    kind: "noise",
    start_seconds: input.currentStart / input.sampleRateHz,
    end_seconds: input.currentEnd / input.sampleRateHz,
    bands_hz: [2000, 12000],
    severity: input.currentMaxSeverity,
    evidence: `sustained low-level broadband activity peaks at ${input.currentMaxRmsDbfs.toFixed(1)} dBFS with ${input.currentMinCrestDb.toFixed(1)} dB crest and ${input.currentMaxZeroCrossingRatio.toFixed(2)} zero-crossing ratio`,
  });
}

function estimateNoiseSeverity(
  window: {
    rmsDbfs: number;
    crestDb: number;
    zeroCrossingRatio: number;
  },
  noiseFloorDbfs: number,
): number {
  const floorTerm = clamp((window.rmsDbfs - Math.max(noiseFloorDbfs - 2, -60)) / 12, 0, 1);
  const crestTerm = clamp((6 - window.crestDb) / 4, 0, 1);
  const crossingTerm = clamp((window.zeroCrossingRatio - 0.12) / 0.3, 0, 1);

  return clamp(0.45 * floorTerm + 0.25 * crestTerm + 0.3 * crossingTerm, 0, 1);
}

function computeZeroCrossingRatio(samples: Float32Array): number {
  if (samples.length <= 1) {
    return 0;
  }

  let crossings = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1] ?? 0;
    const current = samples[index] ?? 0;
    if ((previous >= 0 && current < 0) || (previous < 0 && current >= 0)) {
      crossings += 1;
    }
  }

  return crossings / (samples.length - 1);
}
