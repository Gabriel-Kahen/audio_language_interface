import type { AudioVersion, EditTarget, OperationBuildResult } from "../types.js";

export function buildParametricEqOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("parametric_eq", target);
  const rawBands = parameters.bands;

  if (!Array.isArray(rawBands) || rawBands.length === 0) {
    throw new Error("parametric_eq.bands must be a non-empty array.");
  }

  const nyquist = audio.sample_rate_hz / 2;
  const bands = rawBands.map((band, index) => normalizeBellBand(band, index, nyquist));
  const filterChain = bands
    .map(
      (band) =>
        `equalizer=f=${formatNumber(band.frequency_hz)}:t=q:w=${formatNumber(band.q)}:g=${formatNumber(band.gain_db)}`,
    )
    .join(",");

  return {
    filterChain,
    effectiveParameters: { bands },
    nextAudio: { ...audio },
  };
}

export function buildHighPassFilterOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("high_pass_filter", target);
  const frequencyHz = readCutoffFrequency(parameters, "high_pass_filter", audio.sample_rate_hz / 2);

  return {
    filterChain: `highpass=f=${formatNumber(frequencyHz)}`,
    effectiveParameters: { frequency_hz: frequencyHz },
    nextAudio: { ...audio },
  };
}

export function buildLowPassFilterOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("low_pass_filter", target);
  const frequencyHz = readCutoffFrequency(parameters, "low_pass_filter", audio.sample_rate_hz / 2);

  return {
    filterChain: `lowpass=f=${formatNumber(frequencyHz)}`,
    effectiveParameters: { frequency_hz: frequencyHz },
    nextAudio: { ...audio },
  };
}

function normalizeBellBand(value: unknown, index: number, nyquist: number) {
  if (typeof value !== "object" || value === null) {
    throw new Error(`parametric_eq.bands[${index}] must be an object.`);
  }

  const band = value as Record<string, unknown>;

  if (band.type !== "bell") {
    throw new Error("parametric_eq currently supports only bell bands.");
  }

  const frequencyHz = readFiniteNumber(
    band.frequency_hz,
    `parametric_eq.bands[${index}].frequency_hz`,
  );
  const gainDb = readFiniteNumber(band.gain_db, `parametric_eq.bands[${index}].gain_db`);
  const q = readFiniteNumber(band.q, `parametric_eq.bands[${index}].q`);

  if (frequencyHz <= 0 || frequencyHz >= nyquist) {
    throw new Error(`parametric_eq.bands[${index}].frequency_hz must be between 0 and Nyquist.`);
  }

  if (q <= 0) {
    throw new Error(`parametric_eq.bands[${index}].q must be greater than 0.`);
  }

  return {
    type: "bell",
    frequency_hz: frequencyHz,
    gain_db: gainDb,
    q,
  };
}

function readCutoffFrequency(
  parameters: Record<string, unknown>,
  operation: string,
  nyquist: number,
): number {
  const value = parameters.frequency_hz ?? parameters.cutoff_hz;
  const frequencyHz = readFiniteNumber(value, `${operation}.frequency_hz`);

  if (frequencyHz <= 0 || frequencyHz >= nyquist) {
    throw new Error(`${operation}.frequency_hz must be between 0 and Nyquist.`);
  }

  return frequencyHz;
}

function assertFullFileTarget(operation: string, target?: EditTarget): void {
  if (target?.scope !== undefined && target.scope !== "full_file") {
    throw new Error(`${operation} only supports full_file targets in the initial implementation.`);
  }
}

function readFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(6)).toString();
}
