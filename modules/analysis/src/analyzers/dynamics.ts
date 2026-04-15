import { SEGMENT_WINDOW_SECONDS } from "../constants.js";
import type { AnalysisAnnotation, NormalizedAudioData, SegmentAnalysisResult } from "../types.js";
import { clamp, maxAbs, percentile, rms, toDecibels } from "../utils/math.js";

export function analyzeDynamics(audioData: NormalizedAudioData, segments: SegmentAnalysisResult) {
  const mono = audioData.mono;
  const crestFactorDb = toDecibels(maxAbs(mono)) - toDecibels(rms(mono));
  const windowSize = Math.max(32, Math.round(audioData.sampleRateHz * SEGMENT_WINDOW_SECONDS));
  const windowRmsValues: number[] = [];
  const activeWindowCrestValues: number[] = [];
  const annotations: AnalysisAnnotation[] = [];
  let activeWindowCount = 0;
  let punchWindowCount = 0;
  let currentPunchStart = -1;
  let currentPunchEnd = -1;
  let currentPunchMaxCrestDb = 0;
  let currentPunchMaxRmsDbfs = -120;

  for (let start = 0; start < mono.length; start += windowSize) {
    const end = Math.min(start + windowSize, mono.length);
    const window = mono.slice(start, end);
    const windowRmsDbfs = toDecibels(rms(window));
    const windowPeakDbfs = toDecibels(maxAbs(window));
    const windowCrestDb = windowPeakDbfs - windowRmsDbfs;
    const isActive = windowRmsDbfs > -36;
    const isPunchWindow = windowRmsDbfs > -30 && windowCrestDb >= 9;

    windowRmsValues.push(windowRmsDbfs);

    if (isActive) {
      activeWindowCount += 1;
      activeWindowCrestValues.push(windowCrestDb);
    }

    if (isPunchWindow) {
      punchWindowCount += 1;
      if (currentPunchStart < 0) {
        currentPunchStart = start;
        currentPunchMaxCrestDb = windowCrestDb;
        currentPunchMaxRmsDbfs = windowRmsDbfs;
      }
      currentPunchEnd = end;
      currentPunchMaxCrestDb = Math.max(currentPunchMaxCrestDb, windowCrestDb);
      currentPunchMaxRmsDbfs = Math.max(currentPunchMaxRmsDbfs, windowRmsDbfs);
      continue;
    }

    if (currentPunchStart >= 0) {
      annotations.push({
        kind: "transient_impact",
        start_seconds: currentPunchStart / audioData.sampleRateHz,
        end_seconds: currentPunchEnd / audioData.sampleRateHz,
        bands_hz: [60, 4000],
        severity: clamp((currentPunchMaxCrestDb - 9) / 9, 0, 1),
        evidence: `window crest ${currentPunchMaxCrestDb.toFixed(1)} dB at ${currentPunchMaxRmsDbfs.toFixed(1)} dBFS short-term level`,
      });
      currentPunchStart = -1;
      currentPunchEnd = -1;
      currentPunchMaxCrestDb = 0;
      currentPunchMaxRmsDbfs = -120;
    }
  }

  if (currentPunchStart >= 0) {
    annotations.push({
      kind: "transient_impact",
      start_seconds: currentPunchStart / audioData.sampleRateHz,
      end_seconds: currentPunchEnd / audioData.sampleRateHz,
      bands_hz: [60, 4000],
      severity: clamp((currentPunchMaxCrestDb - 9) / 9, 0, 1),
      evidence: `window crest ${currentPunchMaxCrestDb.toFixed(1)} dB at ${currentPunchMaxRmsDbfs.toFixed(1)} dBFS short-term level`,
    });
  }

  const sorted = [...windowRmsValues].sort((left, right) => left - right);
  const sortedCrests = [...activeWindowCrestValues].sort((left, right) => left - right);

  return {
    crest_factor_db: crestFactorDb,
    transient_density_per_second: segments.transientDensityPerSecond,
    rms_short_term_dbfs: percentile(sorted, 0.5),
    dynamic_range_db: percentile(sorted, 0.95) - percentile(sorted, 0.1),
    transient_crest_db: percentile(sortedCrests, 0.9),
    punch_window_ratio: activeWindowCount === 0 ? 0 : punchWindowCount / activeWindowCount,
    annotations,
  };
}
