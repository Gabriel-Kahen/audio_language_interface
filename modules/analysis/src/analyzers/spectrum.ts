import { SPECTRUM_MAX_FRAMES, SPECTRUM_WINDOW_SIZE } from "../constants.js";
import type { AnalysisAnnotation, NormalizedAudioData } from "../types.js";
import { clamp, createHannWindow, toDecibels } from "../utils/math.js";

interface SpectralBalanceResult {
  low_band_db: number;
  mid_band_db: number;
  high_band_db: number;
  spectral_centroid_hz: number;
  brightness_tilt_db: number;
  presence_band_db: number;
  harshness_ratio_db: number;
  annotations: AnalysisAnnotation[];
}

export function analyzeSpectrum(audioData: NormalizedAudioData): SpectralBalanceResult {
  const mono = audioData.mono;
  const sampleRateHz = audioData.sampleRateHz;
  const windowSize = Math.min(SPECTRUM_WINDOW_SIZE, mono.length);
  const analysisFrames = Math.max(
    1,
    Math.min(SPECTRUM_MAX_FRAMES, Math.ceil(mono.length / windowSize)),
  );
  const hopSize =
    mono.length <= windowSize
      ? windowSize
      : Math.max(1, Math.floor((mono.length - windowSize) / analysisFrames));
  const hannWindow = createHannWindow(windowSize);

  let frameCount = 0;
  let lowEnergy = 0;
  let midEnergy = 0;
  let highEnergy = 0;
  let lowMidEnergy = 0;
  let presenceEnergy = 0;
  let centroidWeightedSum = 0;
  let centroidMagnitudeSum = 0;
  const brightnessFrames: Array<{ start: number; end: number; severity: number; tiltDb: number }> =
    [];
  const harshnessFrames: Array<{ start: number; end: number; severity: number; ratioDb: number }> =
    [];

  for (let start = 0; start + windowSize <= mono.length; start += hopSize) {
    frameCount += 1;
    let frameLowEnergy = 0;
    let frameHighEnergy = 0;
    let frameLowMidEnergy = 0;
    let framePresenceEnergy = 0;
    let frameCentroidWeightedSum = 0;
    let frameCentroidMagnitudeSum = 0;

    for (let bin = 0; bin <= windowSize / 2; bin += 1) {
      let real = 0;
      let imaginary = 0;
      for (let sampleIndex = 0; sampleIndex < windowSize; sampleIndex += 1) {
        const windowed = (mono[start + sampleIndex] ?? 0) * (hannWindow[sampleIndex] ?? 0);
        const phase = (2 * Math.PI * bin * sampleIndex) / windowSize;
        real += windowed * Math.cos(phase);
        imaginary -= windowed * Math.sin(phase);
      }

      const magnitude = Math.sqrt(real * real + imaginary * imaginary);
      const frequencyHz = (bin * sampleRateHz) / windowSize;

      if (frequencyHz < 250) {
        lowEnergy += magnitude;
        frameLowEnergy += magnitude;
      } else if (frequencyHz < 4000) {
        midEnergy += magnitude;
      } else {
        highEnergy += magnitude;
        frameHighEnergy += magnitude;
      }

      if (frequencyHz >= 250 && frequencyHz < 2000) {
        lowMidEnergy += magnitude;
        frameLowMidEnergy += magnitude;
      } else if (frequencyHz >= 2500 && frequencyHz < 6000) {
        presenceEnergy += magnitude;
        framePresenceEnergy += magnitude;
      }

      centroidWeightedSum += magnitude * frequencyHz;
      centroidMagnitudeSum += magnitude;
      frameCentroidWeightedSum += magnitude * frequencyHz;
      frameCentroidMagnitudeSum += magnitude;
    }

    const frameBrightnessTiltDb = toDecibels(frameHighEnergy) - toDecibels(frameLowEnergy);
    const frameHarshnessRatioDb = toDecibels(framePresenceEnergy) - toDecibels(frameLowMidEnergy);
    const frameCentroidHz =
      frameCentroidMagnitudeSum === 0 ? 0 : frameCentroidWeightedSum / frameCentroidMagnitudeSum;

    const brightnessSeverity = clamp((frameBrightnessTiltDb - 8) / 10, 0, 1);
    if (brightnessSeverity > 0.2 && frameCentroidHz >= 2200) {
      brightnessFrames.push({
        start,
        end: start + windowSize,
        severity: brightnessSeverity,
        tiltDb: frameBrightnessTiltDb,
      });
    }

    const harshnessSeverity = clamp((frameHarshnessRatioDb - 4) / 8, 0, 1);
    if (harshnessSeverity > 0.2 && frameCentroidHz >= 1800) {
      harshnessFrames.push({
        start,
        end: start + windowSize,
        severity: harshnessSeverity,
        ratioDb: frameHarshnessRatioDb,
      });
    }

    if (frameCount >= SPECTRUM_MAX_FRAMES) {
      break;
    }
  }

  if (frameCount === 0) {
    return {
      low_band_db: -120,
      mid_band_db: -120,
      high_band_db: -120,
      spectral_centroid_hz: 0,
      brightness_tilt_db: 0,
      presence_band_db: -120,
      harshness_ratio_db: 0,
      annotations: [],
    };
  }

  const lowBandDb = toDecibels(lowEnergy / frameCount);
  const midBandDb = toDecibels(midEnergy / frameCount);
  const highBandDb = toDecibels(highEnergy / frameCount);
  const lowMidBandDb = toDecibels(lowMidEnergy / frameCount);
  const presenceBandDb = toDecibels(presenceEnergy / frameCount);
  const spectralCentroidHz =
    centroidMagnitudeSum === 0 ? 0 : centroidWeightedSum / centroidMagnitudeSum;
  const brightnessTiltDb = highBandDb - lowBandDb;
  const harshnessRatioDb = presenceBandDb - lowMidBandDb;
  const annotations: AnalysisAnnotation[] = [];

  annotations.push(
    ...buildSpectralAnnotations(
      brightnessFrames,
      audioData.sampleRateHz,
      "brightness",
      [4000, 12000],
      (peakValue) => `local high-minus-low tilt peaks at ${peakValue.toFixed(1)} dB`,
      "tiltDb",
    ),
  );
  annotations.push(
    ...buildSpectralAnnotations(
      harshnessFrames,
      audioData.sampleRateHz,
      "harshness",
      [2500, 6000],
      (peakValue) => `presence-band energy exceeds low-mid support by ${peakValue.toFixed(1)} dB`,
      "ratioDb",
    ),
  );

  return {
    low_band_db: lowBandDb,
    mid_band_db: midBandDb,
    high_band_db: highBandDb,
    spectral_centroid_hz: spectralCentroidHz,
    brightness_tilt_db: brightnessTiltDb,
    presence_band_db: presenceBandDb,
    harshness_ratio_db: harshnessRatioDb,
    annotations,
  };
}

function buildSpectralAnnotations(
  frames: Array<{
    start: number;
    end: number;
    severity: number;
    tiltDb?: number;
    ratioDb?: number;
  }>,
  sampleRateHz: number,
  kind: string,
  bandsHz: [number, number],
  buildEvidence: (peakValue: number) => string,
  metricKey: "tiltDb" | "ratioDb",
): AnalysisAnnotation[] {
  const annotations: AnalysisAnnotation[] = [];
  let currentStart = -1;
  let currentEnd = -1;
  let currentMaxSeverity = 0;
  let currentPeakValue = 0;

  for (const frame of frames) {
    if (currentStart < 0) {
      currentStart = frame.start;
      currentEnd = frame.end;
      currentMaxSeverity = frame.severity;
      currentPeakValue = frame[metricKey] ?? 0;
      continue;
    }

    if (frame.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, frame.end);
      currentMaxSeverity = Math.max(currentMaxSeverity, frame.severity);
      currentPeakValue = Math.max(currentPeakValue, frame[metricKey] ?? 0);
      continue;
    }

    annotations.push({
      kind,
      start_seconds: currentStart / sampleRateHz,
      end_seconds: currentEnd / sampleRateHz,
      bands_hz: bandsHz,
      severity: currentMaxSeverity,
      evidence: buildEvidence(currentPeakValue),
    });
    currentStart = frame.start;
    currentEnd = frame.end;
    currentMaxSeverity = frame.severity;
    currentPeakValue = frame[metricKey] ?? 0;
  }

  if (currentStart >= 0) {
    annotations.push({
      kind,
      start_seconds: currentStart / sampleRateHz,
      end_seconds: currentEnd / sampleRateHz,
      bands_hz: bandsHz,
      severity: currentMaxSeverity,
      evidence: buildEvidence(currentPeakValue),
    });
  }

  return annotations;
}
