import { SEGMENT_WINDOW_SECONDS } from "../constants.js";
import type { AnalysisAnnotation, NormalizedAudioData } from "../types.js";
import { clamp, correlation, rms, toDecibels } from "../utils/math.js";

export function analyzeStereo(audioData: NormalizedAudioData) {
  if (audioData.channels.length < 2) {
    return {
      width: 0,
      correlation: 1,
      balance_db: 0,
      annotations: [] as AnalysisAnnotation[],
    };
  }

  const [left, right] = audioData.channels as [Float32Array, Float32Array, ...Float32Array[]];
  const leftRms = rms(left);
  const rightRms = rms(right);
  const mid = new Float32Array(audioData.frameCount);
  const side = new Float32Array(audioData.frameCount);

  for (let index = 0; index < audioData.frameCount; index += 1) {
    const leftSample = left[index] ?? 0;
    const rightSample = right[index] ?? 0;
    mid[index] = (leftSample + rightSample) * 0.5;
    side[index] = (leftSample - rightSample) * 0.5;
  }

  const annotations = buildStereoAnnotations(audioData, left, right);

  return {
    width: rms(side) / Math.max(rms(mid) + rms(side), 1e-12),
    correlation: correlation(left, right),
    balance_db: toDecibels(leftRms) - toDecibels(rightRms),
    annotations,
  };
}

function buildStereoAnnotations(
  audioData: NormalizedAudioData,
  left: Float32Array,
  right: Float32Array,
): AnalysisAnnotation[] {
  const windowSize = Math.max(32, Math.round(audioData.sampleRateHz * SEGMENT_WINDOW_SECONDS));
  const wideFrames: Array<{
    start: number;
    end: number;
    severity: number;
    width: number;
    correlation: number;
  }> = [];
  const ambiguousFrames: Array<{
    start: number;
    end: number;
    severity: number;
    width: number;
    correlation: number;
  }> = [];

  for (let start = 0; start < audioData.frameCount; start += windowSize) {
    const end = Math.min(start + windowSize, audioData.frameCount);
    const frameStereo = measureWindowStereo(left, right, start, end);

    if (
      frameStereo.width >= 0.33 &&
      frameStereo.correlation >= 0.15 &&
      frameStereo.correlation < 0.98
    ) {
      wideFrames.push({
        start,
        end,
        severity: clamp(
          (frameStereo.width - 0.33) / 0.25 + (frameStereo.correlation - 0.15) / 1.2,
          0,
          1,
        ),
        width: frameStereo.width,
        correlation: frameStereo.correlation,
      });
    }

    if (frameStereo.width >= 0.28 && frameStereo.correlation < 0.1) {
      ambiguousFrames.push({
        start,
        end,
        severity: clamp(
          (frameStereo.width - 0.28) / 0.24 + (0.1 - frameStereo.correlation) / 0.5,
          0,
          1,
        ),
        width: frameStereo.width,
        correlation: frameStereo.correlation,
      });
    }
  }

  return [
    ...buildMergedStereoAnnotations(
      wideFrames,
      audioData.sampleRateHz,
      "stereo_width",
      (maxWidth, minCorrelation) =>
        `stable side energy reaches width ${maxWidth.toFixed(2)} with local correlation ${minCorrelation.toFixed(2)}`,
    ),
    ...buildMergedStereoAnnotations(
      ambiguousFrames,
      audioData.sampleRateHz,
      "stereo_ambiguity",
      (maxWidth, minCorrelation) =>
        `side energy reaches width ${maxWidth.toFixed(2)} while local correlation falls to ${minCorrelation.toFixed(2)}`,
    ),
  ];
}

function measureWindowStereo(
  left: Float32Array,
  right: Float32Array,
  start: number,
  end: number,
): { width: number; correlation: number } {
  let midSquared = 0;
  let sideSquared = 0;
  let numerator = 0;
  let leftSquared = 0;
  let rightSquared = 0;

  for (let index = start; index < end; index += 1) {
    const leftSample = left[index] ?? 0;
    const rightSample = right[index] ?? 0;
    const midSample = (leftSample + rightSample) * 0.5;
    const sideSample = (leftSample - rightSample) * 0.5;

    midSquared += midSample * midSample;
    sideSquared += sideSample * sideSample;
    numerator += leftSample * rightSample;
    leftSquared += leftSample * leftSample;
    rightSquared += rightSample * rightSample;
  }

  const midRms = Math.sqrt(midSquared / Math.max(end - start, 1));
  const sideRms = Math.sqrt(sideSquared / Math.max(end - start, 1));
  const denominator = Math.sqrt(leftSquared * rightSquared);

  return {
    width: sideRms / Math.max(midRms + sideRms, 1e-12),
    correlation: denominator === 0 ? 1 : numerator / denominator,
  };
}

function buildMergedStereoAnnotations(
  frames: Array<{
    start: number;
    end: number;
    severity: number;
    width: number;
    correlation: number;
  }>,
  sampleRateHz: number,
  kind: string,
  buildEvidence: (maxWidth: number, minCorrelation: number) => string,
): AnalysisAnnotation[] {
  const annotations: AnalysisAnnotation[] = [];
  let currentStart = -1;
  let currentEnd = -1;
  let currentMaxSeverity = 0;
  let currentMaxWidth = 0;
  let currentMinCorrelation = 1;

  for (const frame of frames) {
    if (currentStart < 0) {
      currentStart = frame.start;
      currentEnd = frame.end;
      currentMaxSeverity = frame.severity;
      currentMaxWidth = frame.width;
      currentMinCorrelation = frame.correlation;
      continue;
    }

    if (frame.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, frame.end);
      currentMaxSeverity = Math.max(currentMaxSeverity, frame.severity);
      currentMaxWidth = Math.max(currentMaxWidth, frame.width);
      currentMinCorrelation = Math.min(currentMinCorrelation, frame.correlation);
      continue;
    }

    annotations.push({
      kind,
      start_seconds: currentStart / sampleRateHz,
      end_seconds: currentEnd / sampleRateHz,
      severity: currentMaxSeverity,
      evidence: buildEvidence(currentMaxWidth, currentMinCorrelation),
    });
    currentStart = frame.start;
    currentEnd = frame.end;
    currentMaxSeverity = frame.severity;
    currentMaxWidth = frame.width;
    currentMinCorrelation = frame.correlation;
  }

  if (currentStart >= 0) {
    annotations.push({
      kind,
      start_seconds: currentStart / sampleRateHz,
      end_seconds: currentEnd / sampleRateHz,
      severity: currentMaxSeverity,
      evidence: buildEvidence(currentMaxWidth, currentMinCorrelation),
    });
  }

  return annotations;
}
