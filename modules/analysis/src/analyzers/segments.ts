import { SEGMENT_WINDOW_SECONDS } from "../constants.js";
import type { AnalysisSegment, NormalizedAudioData, SegmentAnalysisResult } from "../types.js";
import { rms, toDecibels } from "../utils/math.js";

export function analyzeSegments(audioData: NormalizedAudioData): SegmentAnalysisResult {
  const windowSize = Math.max(64, Math.round(audioData.sampleRateHz * SEGMENT_WINDOW_SECONDS));
  const segments: AnalysisSegment[] = [];
  let activeWindowCount = 0;
  let transientCount = 0;
  let currentKind: "active" | "silence" | null = null;
  let currentSegmentStartFrame = 0;
  let previousWindowDbfs = -120;

  for (let start = 0; start < audioData.frameCount; start += windowSize) {
    const end = Math.min(start + windowSize, audioData.frameCount);
    const windowDbfs = toDecibels(rms(audioData.mono.slice(start, end)));
    const isActive = windowDbfs > -50;
    const nextKind = isActive ? "active" : "silence";

    if (isActive) {
      activeWindowCount += 1;
    }

    if (windowDbfs - previousWindowDbfs > 6 && windowDbfs > -24) {
      transientCount += 1;
    }
    previousWindowDbfs = windowDbfs;

    if (currentKind === null) {
      currentKind = nextKind;
      currentSegmentStartFrame = start;
      continue;
    }

    if (currentKind !== nextKind) {
      segments.push({
        kind: currentKind,
        start_seconds: currentSegmentStartFrame / audioData.sampleRateHz,
        end_seconds: start / audioData.sampleRateHz,
      });
      currentKind = nextKind;
      currentSegmentStartFrame = start;
    }
  }

  if (currentKind !== null) {
    segments.push({
      kind: currentKind,
      start_seconds: currentSegmentStartFrame / audioData.sampleRateHz,
      end_seconds: audioData.durationSeconds,
    });
  }

  const structuralSegments =
    segments.length === 1 && segments[0]?.kind === "active"
      ? [{ kind: "loop", start_seconds: 0, end_seconds: audioData.durationSeconds }]
      : segments;

  return {
    segments: structuralSegments,
    transientDensityPerSecond:
      audioData.durationSeconds === 0 ? 0 : transientCount / audioData.durationSeconds,
    activeFrameRatio:
      segments.length === 0
        ? 0
        : activeWindowCount / Math.max(1, Math.ceil(audioData.frameCount / windowSize)),
  };
}
