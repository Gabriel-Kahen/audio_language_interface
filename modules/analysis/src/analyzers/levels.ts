import type { NormalizedAudioData } from "../types.js";
import { maxAbs, rms, toDecibels } from "../utils/math.js";

export interface LevelMetrics {
  integratedLufs: number;
  truePeakDbtp: number;
}

export function analyzeLevels(audioData: NormalizedAudioData, levelMetrics: LevelMetrics) {
  const signalRms = rms(audioData.mono);
  const samplePeak = maxAbs(audioData.mono);
  const rmsDbfs = toDecibels(signalRms);
  const peakDbfs = toDecibels(samplePeak);

  return {
    integrated_lufs: levelMetrics.integratedLufs,
    true_peak_dbtp: levelMetrics.truePeakDbtp,
    rms_dbfs: rmsDbfs,
    sample_peak_dbfs: peakDbfs,
    headroom_db: -peakDbfs,
  };
}
