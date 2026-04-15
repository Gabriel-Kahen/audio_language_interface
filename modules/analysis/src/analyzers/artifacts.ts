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
  const windowDbfsValues: number[] = [];
  for (let start = 0; start < audioData.frameCount; start += windowSize) {
    const end = Math.min(start + windowSize, audioData.frameCount);
    windowDbfsValues.push(toDecibels(rms(audioData.mono.slice(start, end))));
  }

  const sorted = [...windowDbfsValues].sort((left, right) => left - right);
  const percentileIndex = Math.max(0, Math.floor(sorted.length * 0.1) - 1);
  const noiseFloorDbfs = sorted[percentileIndex] ?? -120;

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
