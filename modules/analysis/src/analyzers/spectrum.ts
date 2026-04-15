import { SPECTRUM_MAX_FRAMES, SPECTRUM_WINDOW_SIZE } from "../constants.js";
import type { AnalysisAnnotation, NormalizedAudioData } from "../types.js";
import { clamp, createHannWindow, toDecibels } from "../utils/math.js";

interface SpectralBalanceResult {
  low_band_db: number;
  mid_band_db: number;
  high_band_db: number;
  spectral_centroid_hz: number;
  annotations: AnalysisAnnotation[];
}

export function analyzeSpectrum(audioData: NormalizedAudioData): SpectralBalanceResult {
  const mono = audioData.mono;
  const sampleRateHz = audioData.sampleRateHz;
  const windowSize = Math.min(SPECTRUM_WINDOW_SIZE, mono.length);
  const hopSize = Math.max(windowSize, Math.floor(mono.length / Math.max(SPECTRUM_MAX_FRAMES, 1)));
  const hannWindow = createHannWindow(windowSize);

  let frameCount = 0;
  let lowEnergy = 0;
  let midEnergy = 0;
  let highEnergy = 0;
  let centroidWeightedSum = 0;
  let centroidMagnitudeSum = 0;

  for (let start = 0; start + windowSize <= mono.length; start += hopSize) {
    frameCount += 1;

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
      } else if (frequencyHz < 4000) {
        midEnergy += magnitude;
      } else {
        highEnergy += magnitude;
      }

      centroidWeightedSum += magnitude * frequencyHz;
      centroidMagnitudeSum += magnitude;
    }
  }

  if (frameCount === 0) {
    return {
      low_band_db: -120,
      mid_band_db: -120,
      high_band_db: -120,
      spectral_centroid_hz: 0,
      annotations: [],
    };
  }

  const lowBandDb = toDecibels(lowEnergy / frameCount);
  const midBandDb = toDecibels(midEnergy / frameCount);
  const highBandDb = toDecibels(highEnergy / frameCount);
  const spectralCentroidHz =
    centroidMagnitudeSum === 0 ? 0 : centroidWeightedSum / centroidMagnitudeSum;
  const annotations: AnalysisAnnotation[] = [];

  const harshnessSeverity = clamp((highBandDb - midBandDb - 3) / 12, 0, 1);
  if (harshnessSeverity > 0.2) {
    annotations.push({
      kind: "harshness",
      start_seconds: 0,
      end_seconds: audioData.durationSeconds,
      bands_hz: [3000, 4500],
      severity: harshnessSeverity,
      evidence: "persistent upper-mid/high-band energy bias",
    });
  }

  return {
    low_band_db: lowBandDb,
    mid_band_db: midBandDb,
    high_band_db: highBandDb,
    spectral_centroid_hz: spectralCentroidHz,
    annotations,
  };
}
