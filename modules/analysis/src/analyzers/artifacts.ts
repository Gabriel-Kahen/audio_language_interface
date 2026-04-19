import {
  CLICK_BASELINE_RADIUS_SECONDS,
  CLICK_EVENT_FUSION_SECONDS,
  CLICK_MAX_EVENT_DURATION_SECONDS,
  HUM_CANDIDATE_FUNDAMENTALS_HZ,
  HUM_MAX_HARMONICS,
  HUM_MIN_DURATION_SECONDS,
  HUM_MIN_PROMINENCE_DB,
  SEGMENT_WINDOW_SECONDS,
} from "../constants.js";
import type { AnalysisAnnotation, NormalizedAudioData } from "../types.js";
import { clamp, rms, toDecibels } from "../utils/math.js";

interface ArtifactAnalysisResult {
  clipping_detected: boolean;
  noise_floor_dbfs: number;
  clipped_sample_count: number;
  hum_detected: boolean;
  hum_fundamental_hz?: number;
  hum_harmonic_count: number;
  hum_level_dbfs?: number;
  click_detected: boolean;
  click_count: number;
  click_rate_per_second: number;
  annotations: AnalysisAnnotation[];
}

interface WindowMetric {
  start: number;
  end: number;
  rmsDbfs: number;
  crestDb: number;
  zeroCrossingRatio: number;
}

interface HumWindowCandidate {
  fundamentalHz: number;
  hasFundamental: boolean;
  harmonicCount: number;
  humLevelDbfs: number;
  prominenceDb: number;
  severity: number;
}

interface HumDetectionResult {
  detected: boolean;
  fundamentalHz?: number;
  harmonicCount: number;
  humLevelDbfs?: number;
  annotations: AnalysisAnnotation[];
}

interface HumCoverageWindow {
  start: number;
  end: number;
}

interface ClickEvent {
  startFrame: number;
  endFrame: number;
  peakResidual: number;
  spikeCount: number;
  channelCount: number;
}

interface ClickDetectionResult {
  clickCount: number;
  clickRatePerSecond: number;
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

  const windowMetrics = buildWindowMetrics(audioData);
  const sorted = windowMetrics.map((window) => window.rmsDbfs).sort((left, right) => left - right);
  const percentileIndex = Math.max(0, Math.floor(sorted.length * 0.1) - 1);
  const noiseFloorDbfs = sorted[percentileIndex] ?? -120;
  const humDetection = detectHum(audioData);
  const clickDetection = detectClicks(audioData);

  annotations.push(...buildNoiseAnnotations(windowMetrics, audioData.sampleRateHz, noiseFloorDbfs));
  annotations.push(...humDetection.annotations);

  if (clippedSampleCount > 0 && firstClippedFrame >= 0) {
    annotations.push({
      kind: "clipping",
      start_seconds: firstClippedFrame / audioData.sampleRateHz,
      end_seconds: (lastClippedFrame + 1) / audioData.sampleRateHz,
      severity: clamp(clippedFrameCount / Math.max(audioData.frameCount * 0.01, 1), 0, 1),
      evidence: `${clippedSampleCount} clipped samples across ${clippedFrameCount} frames at or above 0.999 full scale`,
    });
  }

  annotations.push(...clickDetection.annotations);

  return {
    clipping_detected: clippedSampleCount > 0,
    noise_floor_dbfs: noiseFloorDbfs,
    clipped_sample_count: clippedSampleCount,
    hum_detected: humDetection.detected,
    hum_harmonic_count: humDetection.harmonicCount,
    click_detected: clickDetection.clickCount > 0,
    click_count: clickDetection.clickCount,
    click_rate_per_second: clickDetection.clickRatePerSecond,
    ...(humDetection.fundamentalHz === undefined
      ? {}
      : { hum_fundamental_hz: humDetection.fundamentalHz }),
    ...(humDetection.humLevelDbfs === undefined
      ? {}
      : { hum_level_dbfs: humDetection.humLevelDbfs }),
    annotations,
  };
}

function buildWindowMetrics(audioData: NormalizedAudioData): WindowMetric[] {
  const windowSize = Math.max(32, Math.round(audioData.sampleRateHz * SEGMENT_WINDOW_SECONDS));
  const windowMetrics: WindowMetric[] = [];

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

  return windowMetrics;
}

function detectHum(audioData: NormalizedAudioData): HumDetectionResult {
  let bestCandidate: HumWindowCandidate | null = null;

  for (const fundamentalHz of HUM_CANDIDATE_FUNDAMENTALS_HZ) {
    const candidate = scoreHumCandidate(audioData.mono, audioData.sampleRateHz, fundamentalHz);
    if (bestCandidate === null || candidate.severity > bestCandidate.severity) {
      bestCandidate = candidate;
    }
  }

  if (
    bestCandidate === null ||
    audioData.durationSeconds < HUM_MIN_DURATION_SECONDS ||
    !bestCandidate.hasFundamental ||
    bestCandidate.harmonicCount < 2 ||
    bestCandidate.prominenceDb < 8 ||
    bestCandidate.humLevelDbfs < -48 ||
    bestCandidate.severity < 0.3
  ) {
    return {
      detected: false,
      harmonicCount: 0,
      annotations: [],
    };
  }

  const humCoverage = measureHumCoverage(audioData, bestCandidate.fundamentalHz);
  if (humCoverage.coverageRatio < 0.6) {
    return {
      detected: false,
      harmonicCount: 0,
      annotations: [],
    };
  }

  return {
    detected: true,
    fundamentalHz: bestCandidate.fundamentalHz,
    harmonicCount: bestCandidate.harmonicCount,
    humLevelDbfs: bestCandidate.humLevelDbfs,
    annotations: [
      {
        kind: "hum",
        start_seconds: humCoverage.startFrame / audioData.sampleRateHz,
        end_seconds: humCoverage.endFrame / audioData.sampleRateHz,
        bands_hz: [
          Math.max(0, bestCandidate.fundamentalHz - 4),
          bestCandidate.fundamentalHz * Math.max(bestCandidate.harmonicCount, 1) + 4,
        ],
        severity: bestCandidate.severity,
        evidence: `steady ${bestCandidate.fundamentalHz.toFixed(0)} Hz line-noise pattern resolves ${bestCandidate.harmonicCount} harmonics, reaches ${bestCandidate.humLevelDbfs.toFixed(1)} dBFS, and peaks at ${bestCandidate.prominenceDb.toFixed(1)} dB harmonic prominence`,
      },
    ],
  };
}

function scoreHumCandidate(
  samples: Float32Array,
  sampleRateHz: number,
  fundamentalHz: number,
): HumWindowCandidate {
  const maxHarmonics = Math.max(
    1,
    Math.min(HUM_MAX_HARMONICS, Math.floor((sampleRateHz / 2 - 8) / fundamentalHz)),
  );
  const probeOffsetHz = Math.min(6, Math.max(3, fundamentalHz * 0.08));
  let weightedProminenceDb = 0;
  let prominenceWeight = 0;
  let harmonicCount = 0;
  let humEnergySquared = 0;
  let hasFundamental = false;

  for (let harmonicIndex = 1; harmonicIndex <= maxHarmonics; harmonicIndex += 1) {
    const harmonicHz = fundamentalHz * harmonicIndex;
    const targetAmplitude = estimateToneAmplitude(samples, sampleRateHz, harmonicHz);
    const lowerAmplitude = estimateToneAmplitude(
      samples,
      sampleRateHz,
      Math.max(10, harmonicHz - probeOffsetHz),
    );
    const upperAmplitude = estimateToneAmplitude(
      samples,
      sampleRateHz,
      Math.min(sampleRateHz / 2 - 2, harmonicHz + probeOffsetHz),
    );
    const targetRms = targetAmplitude / Math.SQRT2;
    const targetDbfs = toDecibels(targetRms);
    const offToneDbfs = toDecibels((lowerAmplitude + upperAmplitude) / 2 / Math.SQRT2);
    const prominenceDb = targetDbfs - offToneDbfs;
    const weight = 1 / harmonicIndex;

    if (prominenceDb >= HUM_MIN_PROMINENCE_DB && targetDbfs >= -60) {
      harmonicCount += 1;
      humEnergySquared += targetRms * targetRms;
      weightedProminenceDb += prominenceDb * weight;
      prominenceWeight += weight;
      hasFundamental = hasFundamental || harmonicIndex === 1;
    }
  }

  const averageProminenceDb = prominenceWeight === 0 ? 0 : weightedProminenceDb / prominenceWeight;
  const humLevelDbfs = humEnergySquared === 0 ? -120 : toDecibels(Math.sqrt(humEnergySquared));
  const severity =
    clamp((averageProminenceDb - 8) / 12, 0, 1) * 0.65 +
    clamp((humLevelDbfs + 48) / 24, 0, 1) * 0.35;

  return {
    fundamentalHz,
    hasFundamental,
    harmonicCount,
    humLevelDbfs,
    prominenceDb: averageProminenceDb,
    severity: clamp(severity, 0, 1),
  };
}

function estimateToneAmplitude(
  samples: Float32Array,
  sampleRateHz: number,
  frequencyHz: number,
): number {
  if (samples.length === 0 || frequencyHz <= 0 || frequencyHz >= sampleRateHz / 2) {
    return 0;
  }

  let real = 0;
  let imaginary = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    const phase = (2 * Math.PI * frequencyHz * index) / sampleRateHz;
    real += sample * Math.cos(phase);
    imaginary -= sample * Math.sin(phase);
  }

  return (2 / samples.length) * Math.sqrt(real * real + imaginary * imaginary);
}

function measureHumCoverage(
  audioData: NormalizedAudioData,
  fundamentalHz: number,
): {
  coverageRatio: number;
  startFrame: number;
  endFrame: number;
} {
  const windowSize = Math.max(
    Math.round(audioData.sampleRateHz * 0.2),
    Math.round(audioData.sampleRateHz * HUM_MIN_DURATION_SECONDS),
  );
  const hopSize = Math.max(1, Math.round(windowSize / 2));
  const supportedWindows: HumCoverageWindow[] = [];
  let totalWindows = 0;

  for (let start = 0; start + windowSize <= audioData.frameCount; start += hopSize) {
    totalWindows += 1;
    const window = audioData.mono.slice(start, start + windowSize);
    const candidate = scoreHumCandidate(window, audioData.sampleRateHz, fundamentalHz);
    const isSupported =
      candidate.hasFundamental &&
      candidate.harmonicCount >= 2 &&
      candidate.prominenceDb >= 6 &&
      candidate.humLevelDbfs >= -52;

    if (isSupported) {
      supportedWindows.push({
        start,
        end: start + windowSize,
      });
    }
  }

  if (supportedWindows.length === 0 || totalWindows === 0) {
    return {
      coverageRatio: 0,
      startFrame: 0,
      endFrame: audioData.frameCount,
    };
  }

  return {
    coverageRatio: supportedWindows.length / totalWindows,
    startFrame: supportedWindows[0]?.start ?? 0,
    endFrame: supportedWindows[supportedWindows.length - 1]?.end ?? audioData.frameCount,
  };
}

function detectClicks(audioData: NormalizedAudioData): ClickDetectionResult {
  const channelEvents = audioData.channels.flatMap((channel) =>
    detectClickEventsInChannel(channel, audioData.sampleRateHz),
  );
  const mergedEvents = mergeClickEvents(channelEvents, audioData.sampleRateHz);

  return {
    clickCount: mergedEvents.length,
    clickRatePerSecond:
      audioData.durationSeconds <= 0 ? 0 : mergedEvents.length / audioData.durationSeconds,
    annotations: mergedEvents.map((event) => ({
      kind: "click",
      start_seconds: Math.max(0, (event.startFrame - 1) / audioData.sampleRateHz),
      end_seconds: (event.endFrame + 1) / audioData.sampleRateHz,
      severity: clamp((event.peakResidual - 0.16) / 0.5, 0, 1),
      evidence: `${event.spikeCount} impulsive spike${event.spikeCount === 1 ? "" : "s"} across ${event.channelCount} channel${event.channelCount === 1 ? "" : "s"} peak ${event.peakResidual.toFixed(2)} full-scale amplitude above the local baseline`,
    })),
  };
}

function detectClickEventsInChannel(channel: Float32Array, sampleRateHz: number): ClickEvent[] {
  if (channel.length === 0) {
    return [];
  }

  const baselineRadius = Math.max(2, Math.round(sampleRateHz * CLICK_BASELINE_RADIUS_SECONDS));
  const prefixSums = new Float64Array(channel.length + 1);
  const prefixSquares = new Float64Array(channel.length + 1);

  for (let index = 0; index < channel.length; index += 1) {
    const value = channel[index] ?? 0;
    prefixSums[index + 1] = (prefixSums[index] ?? 0) + value;
    prefixSquares[index + 1] = (prefixSquares[index] ?? 0) + value * value;
  }

  const events: ClickEvent[] = [];
  let currentStart = -1;
  let currentEnd = -1;
  let currentPeakResidual = 0;
  let currentSpikeCount = 0;
  const maxGapFrames = Math.max(1, Math.round(sampleRateHz * CLICK_EVENT_FUSION_SECONDS));

  const flush = (): void => {
    if (currentStart < 0 || currentEnd < currentStart) {
      return;
    }

    const durationSeconds = (currentEnd - currentStart + 1) / sampleRateHz;
    if (durationSeconds <= CLICK_MAX_EVENT_DURATION_SECONDS && currentPeakResidual >= 0.16) {
      events.push({
        startFrame: currentStart,
        endFrame: currentEnd,
        peakResidual: currentPeakResidual,
        spikeCount: currentSpikeCount,
        channelCount: 1,
      });
    }
  };

  for (
    let frameIndex = baselineRadius + 2;
    frameIndex < channel.length - baselineRadius - 2;
    frameIndex += 1
  ) {
    const windowStart = frameIndex - baselineRadius;
    const windowEnd = frameIndex + baselineRadius + 1;
    const totalCount = windowEnd - windowStart;
    const totalSum = (prefixSums[windowEnd] ?? 0) - (prefixSums[windowStart] ?? 0);
    const totalEnergy = (prefixSquares[windowEnd] ?? 0) - (prefixSquares[windowStart] ?? 0);
    const localRms = Math.sqrt(totalEnergy / totalCount);
    const coreStart = frameIndex - 1;
    const coreEnd = frameIndex + 2;
    const coreCount = coreEnd - coreStart;
    const coreSum = (prefixSums[coreEnd] ?? 0) - (prefixSums[coreStart] ?? 0);
    const baseline = totalCount <= coreCount ? 0 : (totalSum - coreSum) / (totalCount - coreCount);
    const sample = channel[frameIndex] ?? 0;
    const residual = Math.abs(sample - baseline);
    const shoulderResidual = Math.max(
      Math.abs((channel[frameIndex - 1] ?? 0) - baseline),
      Math.abs((channel[frameIndex + 1] ?? 0) - baseline),
      Math.abs((channel[frameIndex - 2] ?? 0) - baseline),
      Math.abs((channel[frameIndex + 2] ?? 0) - baseline),
    );
    const isClickCandidate =
      residual >= Math.max(0.14, localRms * 4.5) &&
      Math.abs(sample) >= Math.max(0.12, localRms * 2.5) &&
      shoulderResidual <= residual * 0.55;

    if (!isClickCandidate) {
      flush();
      currentStart = -1;
      currentEnd = -1;
      currentPeakResidual = 0;
      currentSpikeCount = 0;
      continue;
    }

    if (currentStart < 0 || frameIndex > currentEnd + maxGapFrames) {
      flush();
      currentStart = frameIndex;
      currentEnd = frameIndex;
      currentPeakResidual = residual;
      currentSpikeCount = 1;
      continue;
    }

    currentEnd = frameIndex;
    currentPeakResidual = Math.max(currentPeakResidual, residual);
    currentSpikeCount += 1;
  }

  flush();

  return events;
}

function mergeClickEvents(events: ClickEvent[], sampleRateHz: number): ClickEvent[] {
  const sortedEvents = [...events].sort(
    (left, right) => left.startFrame - right.startFrame || left.endFrame - right.endFrame,
  );
  const maxGapFrames = Math.max(1, Math.round(sampleRateHz * CLICK_EVENT_FUSION_SECONDS));
  const mergedEvents: ClickEvent[] = [];

  for (const event of sortedEvents) {
    const previous = mergedEvents[mergedEvents.length - 1];
    if (previous !== undefined && event.startFrame <= previous.endFrame + maxGapFrames) {
      previous.endFrame = Math.max(previous.endFrame, event.endFrame);
      previous.peakResidual = Math.max(previous.peakResidual, event.peakResidual);
      previous.spikeCount += event.spikeCount;
      previous.channelCount += event.channelCount;
      continue;
    }

    mergedEvents.push({ ...event });
  }

  return mergedEvents;
}

function buildNoiseAnnotations(
  windows: WindowMetric[],
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
  let currentMaxFloorOffsetDb = 0;

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
        currentMaxFloorOffsetDb = window.rmsDbfs - noiseFloorDbfs;
      }
      currentEnd = window.end;
      currentMaxSeverity = Math.max(currentMaxSeverity, noiseSeverity);
      currentMaxRmsDbfs = Math.max(currentMaxRmsDbfs, window.rmsDbfs);
      currentMinCrestDb = Math.min(currentMinCrestDb, window.crestDb);
      currentMaxZeroCrossingRatio = Math.max(currentMaxZeroCrossingRatio, window.zeroCrossingRatio);
      currentMaxFloorOffsetDb = Math.max(currentMaxFloorOffsetDb, window.rmsDbfs - noiseFloorDbfs);
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
      currentMaxFloorOffsetDb,
      sampleRateHz,
    });
    currentStart = -1;
    currentEnd = -1;
    currentMaxSeverity = 0;
    currentMaxRmsDbfs = -120;
    currentMinCrestDb = Number.POSITIVE_INFINITY;
    currentMaxZeroCrossingRatio = 0;
    currentMaxFloorOffsetDb = 0;
  }

  pushNoiseAnnotationIfSustained({
    annotations,
    currentStart,
    currentEnd,
    currentMaxSeverity,
    currentMaxRmsDbfs,
    currentMinCrestDb,
    currentMaxZeroCrossingRatio,
    currentMaxFloorOffsetDb,
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
  currentMaxFloorOffsetDb: number;
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
    evidence: `sustained low-level broadband activity lasts ${durationSeconds.toFixed(2)} seconds, peaks at ${input.currentMaxRmsDbfs.toFixed(1)} dBFS, sits up to ${input.currentMaxFloorOffsetDb.toFixed(1)} dB above the estimated floor, and reaches ${input.currentMaxZeroCrossingRatio.toFixed(2)} zero-crossing ratio with ${input.currentMinCrestDb.toFixed(1)} dB crest`,
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
