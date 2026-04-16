import type { AudioVersion, EditTarget, OperationBuildResult } from "../types.js";

const STRETCH_RATIO_MIN = 0.25;
const STRETCH_RATIO_MAX = 4;
const ATEMPO_MIN = 0.5;
const ATEMPO_MAX = 2;
const ROUNDING_PLACES = 6;
const EPSILON = 1e-9;

/**
 * Builds a deterministic FFmpeg time-stretch operation using `atempo`.
 *
 * The public `stretch_ratio` convention is:
 * `output_duration / input_duration`
 *
 * Values above `1` lengthen the clip and values below `1` shorten it while
 * preserving pitch.
 *
 * Callers may provide either:
 * - `stretch_ratio`
 * - `source_tempo_bpm` and `target_tempo_bpm`
 *
 * Tempo-match mode derives `stretch_ratio = source_tempo_bpm / target_tempo_bpm`
 * so slowing a 120 BPM source to 90 BPM produces `stretch_ratio = 1.333333`.
 */
export function buildTimeStretchOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("time_stretch", target);

  const normalized = normalizeTimeStretchParameters(parameters);
  const appliedTempoRatio = roundToSixDecimals(1 / normalized.stretchRatio);
  const atempoChain = buildAtempoFilterChain(appliedTempoRatio);
  const durationSeconds = roundToSixDecimals(audio.duration_seconds * normalized.stretchRatio);

  return {
    filterChain: atempoChain,
    effectiveParameters: {
      ...normalized.recordedParameters,
      applied_tempo_ratio: appliedTempoRatio,
    },
    nextAudio: {
      ...audio,
      duration_seconds: durationSeconds,
      frame_count: Math.round(durationSeconds * audio.sample_rate_hz),
    },
  };
}

function normalizeTimeStretchParameters(parameters: Record<string, unknown>): {
  stretchRatio: number;
  recordedParameters: Record<string, number>;
} {
  const hasStretchRatio = parameters.stretch_ratio !== undefined;
  const hasSourceTempo = parameters.source_tempo_bpm !== undefined;
  const hasTargetTempo = parameters.target_tempo_bpm !== undefined;

  if (hasStretchRatio && (hasSourceTempo || hasTargetTempo)) {
    throw new Error(
      "time_stretch accepts either stretch_ratio or source_tempo_bpm + target_tempo_bpm, not both.",
    );
  }

  if (hasStretchRatio) {
    const stretchRatio = readBoundedNumber(
      parameters.stretch_ratio,
      "time_stretch.stretch_ratio",
      STRETCH_RATIO_MIN,
      STRETCH_RATIO_MAX,
    );

    return {
      stretchRatio,
      recordedParameters: {
        stretch_ratio: stretchRatio,
      },
    };
  }

  if (!hasSourceTempo && !hasTargetTempo) {
    throw new Error(
      "time_stretch requires either stretch_ratio or source_tempo_bpm + target_tempo_bpm.",
    );
  }

  if (!hasSourceTempo || !hasTargetTempo) {
    throw new Error(
      "time_stretch tempo matching requires both source_tempo_bpm and target_tempo_bpm.",
    );
  }

  const sourceTempoBpm = readPositiveNumber(
    parameters.source_tempo_bpm,
    "time_stretch.source_tempo_bpm",
  );
  const targetTempoBpm = readPositiveNumber(
    parameters.target_tempo_bpm,
    "time_stretch.target_tempo_bpm",
  );
  const stretchRatio = roundToSixDecimals(sourceTempoBpm / targetTempoBpm);

  if (stretchRatio < STRETCH_RATIO_MIN || stretchRatio > STRETCH_RATIO_MAX) {
    throw new Error(
      `time_stretch derived stretch_ratio must be between ${STRETCH_RATIO_MIN} and ${STRETCH_RATIO_MAX}.`,
    );
  }

  return {
    stretchRatio,
    recordedParameters: {
      source_tempo_bpm: sourceTempoBpm,
      target_tempo_bpm: targetTempoBpm,
      stretch_ratio: stretchRatio,
    },
  };
}

function buildAtempoFilterChain(tempoRatio: number): string {
  const factors: number[] = [];
  let remaining = tempoRatio;

  while (remaining < ATEMPO_MIN - EPSILON) {
    factors.push(ATEMPO_MIN);
    remaining /= ATEMPO_MIN;
  }

  while (remaining > ATEMPO_MAX + EPSILON) {
    factors.push(ATEMPO_MAX);
    remaining /= ATEMPO_MAX;
  }

  const normalizedRemaining = roundToSixDecimals(remaining);

  if (factors.length === 0 || Math.abs(normalizedRemaining - 1) > EPSILON) {
    factors.push(normalizedRemaining);
  }

  return factors.map((factor) => `atempo=${formatNumber(factor)}`).join(",");
}

function assertFullFileTarget(operation: string, target?: EditTarget): void {
  if (target?.scope !== undefined && target.scope !== "full_file") {
    throw new Error(`${operation} only supports full_file targets in the initial implementation.`);
  }
}

function readBoundedNumber(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  if (value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }

  return roundToSixDecimals(value);
}

function readPositiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite number greater than 0.`);
  }

  return roundToSixDecimals(value);
}

function roundToSixDecimals(value: number): number {
  return Number(value.toFixed(ROUNDING_PLACES));
}

function formatNumber(value: number): string {
  return roundToSixDecimals(value).toString();
}
