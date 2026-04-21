import type { AudioVersion, EditTarget, OperationBuildResult } from "../types.js";

const PITCH_SHIFT_MIN_SEMITONES = -24;
const PITCH_SHIFT_MAX_SEMITONES = 24;
const ATEMPO_MIN = 0.5;
const ATEMPO_MAX = 2;

export function buildPitchShiftOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("pitch_shift", target);
  const semitones = readBoundedNumber(
    parameters.semitones,
    "pitch_shift.semitones",
    PITCH_SHIFT_MIN_SEMITONES,
    PITCH_SHIFT_MAX_SEMITONES,
  );
  const requestedPitchRatio = 2 ** (semitones / 12);
  const asetrateHz = Math.max(1, Math.round(audio.sample_rate_hz * requestedPitchRatio));
  const pitchRatio = roundToSixDecimals(asetrateHz / audio.sample_rate_hz);
  const tempoRatio = roundToSixDecimals(1 / pitchRatio);
  const atempoFactors = buildAtempoFactors(tempoRatio);

  return {
    filterChain:
      semitones === 0
        ? "anull"
        : [
            `asetrate=${asetrateHz}`,
            `aresample=${audio.sample_rate_hz}`,
            ...atempoFactors.map((factor) => `atempo=${formatNumber(factor)}`),
          ].join(","),
    effectiveParameters: {
      semitones,
      pitch_ratio: pitchRatio,
      asetrate_hz: asetrateHz,
      tempo_ratio: tempoRatio,
      atempo_factors: atempoFactors,
    },
    nextAudio: { ...audio },
    requiresOutputProbe: true,
  };
}

function assertFullFileTarget(operation: string, target?: EditTarget): void {
  if (target?.scope !== undefined && target.scope !== "full_file") {
    throw new Error(`${operation} only supports full_file targets in the initial implementation.`);
  }
}

function buildAtempoFactors(tempoRatio: number): number[] {
  const factors: number[] = [];
  let remaining = tempoRatio;

  while (remaining < ATEMPO_MIN) {
    factors.push(ATEMPO_MIN);
    remaining /= ATEMPO_MIN;
  }

  while (remaining > ATEMPO_MAX) {
    factors.push(ATEMPO_MAX);
    remaining /= ATEMPO_MAX;
  }

  factors.push(roundToSixDecimals(remaining));

  return factors;
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

function roundToSixDecimals(value: number): number {
  return Number(value.toFixed(6));
}

function formatNumber(value: number): string {
  return roundToSixDecimals(value).toString();
}
