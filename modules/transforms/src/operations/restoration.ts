import type { AudioVersion, EditTarget, OperationBuildResult } from "../types.js";

const DENOISE_REDUCTION_MIN_DB = 0.01;
const DENOISE_REDUCTION_MAX_DB = 24;
const DENOISE_NOISE_FLOOR_MIN_DBFS = -80;
const DENOISE_NOISE_FLOOR_MAX_DBFS = -20;
const DEFAULT_DENOISE_NOISE_FLOOR_DBFS = -50;

const DEESSER_INTENSITY_MIN = 0;
const DEESSER_INTENSITY_MAX = 1;
const DEESSER_MAX_REDUCTION_MIN = 0;
const DEESSER_MAX_REDUCTION_MAX = 1;
const DEESSER_FREQUENCY_MIN_HZ = 1000;
const DEESSER_DEFAULT_FREQUENCY_HZ = 5500;

const DECLICK_WINDOW_MIN_MS = 10;
const DECLICK_WINDOW_MAX_MS = 100;
const DECLICK_OVERLAP_MIN_PERCENT = 50;
const DECLICK_OVERLAP_MAX_PERCENT = 95;
const DECLICK_AR_ORDER_MIN = 0;
const DECLICK_AR_ORDER_MAX = 25;
const DECLICK_THRESHOLD_MIN = 1;
const DECLICK_THRESHOLD_MAX = 100;
const DECLICK_BURST_MIN = 0;
const DECLICK_BURST_MAX = 10;

const DEHUM_FUNDAMENTAL_MIN_HZ = 40;
const DEHUM_FUNDAMENTAL_MAX_HZ = 120;
const DEHUM_HARMONICS_MIN = 1;
const DEHUM_HARMONICS_MAX = 10;
const DEHUM_Q_MIN = 0.1;
const DEHUM_Q_MAX = 100;

export function buildDenoiseOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("denoise", target);
  const reductionDb = readBoundedNumber(
    parameters.reduction_db,
    "denoise.reduction_db",
    DENOISE_REDUCTION_MIN_DB,
    DENOISE_REDUCTION_MAX_DB,
  );
  const noiseFloorDbfs =
    readOptionalBoundedNumber(
      parameters.noise_floor_dbfs,
      "denoise.noise_floor_dbfs",
      DENOISE_NOISE_FLOOR_MIN_DBFS,
      DENOISE_NOISE_FLOOR_MAX_DBFS,
    ) ?? DEFAULT_DENOISE_NOISE_FLOOR_DBFS;

  return {
    filterChain: `afftdn=nr=${formatNumber(reductionDb)}:nf=${formatNumber(noiseFloorDbfs)}:tn=0:tr=0:ad=0.5:fo=1:nl=min:om=o`,
    effectiveParameters: {
      reduction_db: reductionDb,
      noise_floor_dbfs: noiseFloorDbfs,
    },
    nextAudio: { ...audio },
  };
}

export function buildDeEsserOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("de_esser", target);
  const intensity = readBoundedNumber(
    parameters.intensity,
    "de_esser.intensity",
    DEESSER_INTENSITY_MIN,
    DEESSER_INTENSITY_MAX,
  );
  const maxReduction =
    readOptionalBoundedNumber(
      parameters.max_reduction,
      "de_esser.max_reduction",
      DEESSER_MAX_REDUCTION_MIN,
      DEESSER_MAX_REDUCTION_MAX,
    ) ?? 0.5;
  const frequencyHz =
    readOptionalBoundedNumber(
      parameters.frequency_hz,
      "de_esser.frequency_hz",
      DEESSER_FREQUENCY_MIN_HZ,
      audio.sample_rate_hz / 2,
    ) ?? DEESSER_DEFAULT_FREQUENCY_HZ;

  return {
    filterChain: `deesser=i=${formatNumber(intensity)}:m=${formatNumber(maxReduction)}:f=${formatNumber(frequencyHz / (audio.sample_rate_hz / 2))}:s=o`,
    effectiveParameters: {
      intensity,
      max_reduction: maxReduction,
      frequency_hz: frequencyHz,
      normalized_frequency: roundToSixDecimals(frequencyHz / (audio.sample_rate_hz / 2)),
    },
    nextAudio: { ...audio },
  };
}

export function buildDeclickOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("declick", target);
  const windowMs = readBoundedNumber(
    parameters.window_ms,
    "declick.window_ms",
    DECLICK_WINDOW_MIN_MS,
    DECLICK_WINDOW_MAX_MS,
  );
  const overlapPercent =
    readOptionalBoundedNumber(
      parameters.overlap_percent,
      "declick.overlap_percent",
      DECLICK_OVERLAP_MIN_PERCENT,
      DECLICK_OVERLAP_MAX_PERCENT,
    ) ?? 75;
  const arOrder =
    readOptionalInteger(
      parameters.ar_order,
      "declick.ar_order",
      DECLICK_AR_ORDER_MIN,
      DECLICK_AR_ORDER_MAX,
    ) ?? 2;
  const threshold =
    readOptionalBoundedNumber(
      parameters.threshold,
      "declick.threshold",
      DECLICK_THRESHOLD_MIN,
      DECLICK_THRESHOLD_MAX,
    ) ?? 2;
  const burstFusion =
    readOptionalBoundedNumber(
      parameters.burst_fusion,
      "declick.burst_fusion",
      DECLICK_BURST_MIN,
      DECLICK_BURST_MAX,
    ) ?? 2;
  const method = readMethod(parameters.method, "declick.method") ?? "add";

  return {
    filterChain: `adeclick=w=${formatNumber(windowMs)}:o=${formatNumber(overlapPercent)}:a=${arOrder}:t=${formatNumber(threshold)}:b=${formatNumber(burstFusion)}:m=${method}`,
    effectiveParameters: {
      window_ms: windowMs,
      overlap_percent: overlapPercent,
      ar_order: arOrder,
      threshold,
      burst_fusion: burstFusion,
      method,
    },
    nextAudio: { ...audio },
  };
}

export function buildDehumOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("dehum", target);
  const fundamentalHz = readBoundedNumber(
    parameters.fundamental_hz,
    "dehum.fundamental_hz",
    DEHUM_FUNDAMENTAL_MIN_HZ,
    DEHUM_FUNDAMENTAL_MAX_HZ,
  );
  const harmonics =
    readOptionalInteger(
      parameters.harmonics,
      "dehum.harmonics",
      DEHUM_HARMONICS_MIN,
      DEHUM_HARMONICS_MAX,
    ) ?? 4;
  const q = readOptionalBoundedNumber(parameters.q, "dehum.q", DEHUM_Q_MIN, DEHUM_Q_MAX) ?? 18;
  const mix = readOptionalBoundedNumber(parameters.mix, "dehum.mix", 0, 1) ?? 1;
  const appliedFrequenciesHz = deriveHumFrequencies(
    audio.sample_rate_hz / 2,
    fundamentalHz,
    harmonics,
  );

  if (appliedFrequenciesHz.length === 0) {
    throw new Error("dehum could not derive any notch frequencies below Nyquist.");
  }

  const notchChain = appliedFrequenciesHz
    .map((frequencyHz) => `bandreject=f=${formatNumber(frequencyHz)}:t=q:w=${formatNumber(q)}`)
    .join(",");

  return {
    filterChain:
      mix === 1
        ? notchChain
        : `asplit=2[dry][wet];[wet]${notchChain},volume=${formatNumber(mix)}[wetmix];[dry]volume=${formatNumber(1 - mix)}[drymix];[drymix][wetmix]amix=inputs=2:normalize=0`,
    effectiveParameters: {
      fundamental_hz: fundamentalHz,
      harmonics,
      q,
      mix,
      applied_frequencies_hz: appliedFrequenciesHz,
    },
    nextAudio: { ...audio },
  };
}

function deriveHumFrequencies(
  nyquistHz: number,
  fundamentalHz: number,
  harmonics: number,
): number[] {
  const frequencies: number[] = [];

  for (let harmonic = 1; harmonic <= harmonics; harmonic += 1) {
    const frequencyHz = roundToSixDecimals(fundamentalHz * harmonic);
    if (frequencyHz >= nyquistHz) {
      break;
    }

    frequencies.push(frequencyHz);
  }

  return frequencies;
}

function readMethod(value: unknown, label: string): "add" | "save" | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "add" && value !== "save") {
    throw new Error(`${label} must be 'add' or 'save'.`);
  }

  return value;
}

function assertFullFileTarget(operation: string, target?: EditTarget): void {
  if (target?.scope !== undefined && target.scope !== "full_file") {
    throw new Error(`${operation} only supports full_file targets in the current runtime.`);
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

function readOptionalBoundedNumber(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return readBoundedNumber(value, label, min, max);
}

function readOptionalInteger(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }

  return readBoundedNumber(value, label, min, max);
}

function roundToSixDecimals(value: number): number {
  return Number(value.toFixed(6));
}

function formatNumber(value: number): string {
  return roundToSixDecimals(value).toString();
}
