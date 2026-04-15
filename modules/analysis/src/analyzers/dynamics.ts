import { SEGMENT_WINDOW_SECONDS } from "../constants.js";
import type { NormalizedAudioData, SegmentAnalysisResult } from "../types.js";
import { maxAbs, percentile, rms, toDecibels } from "../utils/math.js";

export function analyzeDynamics(audioData: NormalizedAudioData, segments: SegmentAnalysisResult) {
  const mono = audioData.mono;
  const crestFactorDb = toDecibels(maxAbs(mono)) - toDecibels(rms(mono));
  const windowSize = Math.max(32, Math.round(audioData.sampleRateHz * SEGMENT_WINDOW_SECONDS));
  const windowRmsValues: number[] = [];

  for (let start = 0; start < mono.length; start += windowSize) {
    const end = Math.min(start + windowSize, mono.length);
    const window = mono.slice(start, end);
    windowRmsValues.push(toDecibels(rms(window)));
  }

  const sorted = [...windowRmsValues].sort((left, right) => left - right);

  return {
    crest_factor_db: crestFactorDb,
    transient_density_per_second: segments.transientDensityPerSecond,
    rms_short_term_dbfs: percentile(sorted, 0.5),
    dynamic_range_db: percentile(sorted, 0.95) - percentile(sorted, 0.1),
  };
}
