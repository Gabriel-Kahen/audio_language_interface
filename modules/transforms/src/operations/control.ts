import type { AudioVersion, EditTarget, OperationBuildResult } from "../types.js";

const TRANSIENT_ATTACK_AMOUNT_MIN_DB = -12;
const TRANSIENT_ATTACK_AMOUNT_MAX_DB = 12;
const TRANSIENT_THRESHOLD_MIN_DB = -60;
const TRANSIENT_THRESHOLD_MAX_DB = 0;
const TRANSIENT_ATTACK_MIN_MS = 0.1;
const TRANSIENT_ATTACK_MAX_MS = 50;
const TRANSIENT_RELEASE_MIN_MS = 1;
const TRANSIENT_RELEASE_MAX_MS = 500;

const CLIPPER_CEILING_MIN_DBFS = -24;
const CLIPPER_CEILING_MAX_DBFS = 0;
const CLIPPER_GAIN_MIN_DB = -24;
const CLIPPER_GAIN_MAX_DB = 24;
const CLIPPER_OVERSAMPLE_MIN = 1;
const CLIPPER_OVERSAMPLE_MAX = 8;

const GATE_THRESHOLD_MIN_DB = -80;
const GATE_THRESHOLD_MAX_DB = 0;
const GATE_RANGE_MIN_DB = 0;
const GATE_RANGE_MAX_DB = 96;
const GATE_RATIO_MIN = 1.01;
const GATE_RATIO_MAX = 20;
const GATE_ATTACK_MIN_MS = 0.01;
const GATE_ATTACK_MAX_MS = 2000;
const GATE_RELEASE_MIN_MS = 0.01;
const GATE_RELEASE_MAX_MS = 9000;

export function buildTransientShaperOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("transient_shaper", target);
  const attackAmountDb = readBoundedNumber(
    parameters.attack_amount_db,
    "transient_shaper.attack_amount_db",
    TRANSIENT_ATTACK_AMOUNT_MIN_DB,
    TRANSIENT_ATTACK_AMOUNT_MAX_DB,
  );
  const thresholdDb = readBoundedNumber(
    parameters.threshold_db,
    "transient_shaper.threshold_db",
    TRANSIENT_THRESHOLD_MIN_DB,
    TRANSIENT_THRESHOLD_MAX_DB,
  );
  const attackMs =
    readOptionalBoundedNumber(
      parameters.attack_ms,
      "transient_shaper.attack_ms",
      TRANSIENT_ATTACK_MIN_MS,
      TRANSIENT_ATTACK_MAX_MS,
    ) ?? 5;
  const releaseMs =
    readOptionalBoundedNumber(
      parameters.release_ms,
      "transient_shaper.release_ms",
      TRANSIENT_RELEASE_MIN_MS,
      TRANSIENT_RELEASE_MAX_MS,
    ) ?? 80;
  const attackSeconds = roundToSixDecimals(attackMs / 1000);
  const releaseSeconds = roundToSixDecimals(releaseMs / 1000);
  const outputAtZeroDb = roundToSixDecimals(attackAmountDb);

  return {
    filterChain: `compand=attacks=${formatNumber(attackSeconds)}:decays=${formatNumber(releaseSeconds)}:points=-90/-90|${formatDbPoint(thresholdDb)}/${formatDbPoint(thresholdDb)}|0/${formatDbPoint(outputAtZeroDb)}:soft-knee=1:gain=0:volume=0:delay=${formatNumber(attackSeconds)}`,
    effectiveParameters: {
      attack_amount_db: attackAmountDb,
      threshold_db: thresholdDb,
      attack_ms: attackMs,
      release_ms: releaseMs,
    },
    nextAudio: { ...audio },
  };
}

export function buildClipperOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("clipper", target);
  const ceilingDbfs = readBoundedNumber(
    parameters.ceiling_dbfs,
    "clipper.ceiling_dbfs",
    CLIPPER_CEILING_MIN_DBFS,
    CLIPPER_CEILING_MAX_DBFS,
  );
  const inputGainDb =
    readOptionalBoundedNumber(
      parameters.input_gain_db,
      "clipper.input_gain_db",
      CLIPPER_GAIN_MIN_DB,
      CLIPPER_GAIN_MAX_DB,
    ) ?? 0;
  const outputGainDb =
    readOptionalBoundedNumber(
      parameters.output_gain_db,
      "clipper.output_gain_db",
      CLIPPER_GAIN_MIN_DB,
      CLIPPER_GAIN_MAX_DB,
    ) ?? 0;
  const oversampleFactor =
    readOptionalBoundedInteger(
      parameters.oversample_factor,
      "clipper.oversample_factor",
      CLIPPER_OVERSAMPLE_MIN,
      CLIPPER_OVERSAMPLE_MAX,
    ) ?? 2;

  return {
    filterChain: `volume=${formatNumber(inputGainDb)}dB,asoftclip=type=hard:threshold=1:output=1:param=1:oversample=${oversampleFactor},volume=${formatNumber(ceilingDbfs + outputGainDb)}dB`,
    effectiveParameters: {
      ceiling_dbfs: ceilingDbfs,
      input_gain_db: inputGainDb,
      output_gain_db: outputGainDb,
      oversample_factor: oversampleFactor,
    },
    nextAudio: { ...audio },
  };
}

export function buildGateOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("gate", target);
  const thresholdDb = readBoundedNumber(
    parameters.threshold_db,
    "gate.threshold_db",
    GATE_THRESHOLD_MIN_DB,
    GATE_THRESHOLD_MAX_DB,
  );
  const rangeDb =
    readOptionalBoundedNumber(
      parameters.range_db,
      "gate.range_db",
      GATE_RANGE_MIN_DB,
      GATE_RANGE_MAX_DB,
    ) ?? 60;
  const ratio =
    readOptionalBoundedNumber(parameters.ratio, "gate.ratio", GATE_RATIO_MIN, GATE_RATIO_MAX) ?? 8;
  const attackMs =
    readOptionalBoundedNumber(
      parameters.attack_ms,
      "gate.attack_ms",
      GATE_ATTACK_MIN_MS,
      GATE_ATTACK_MAX_MS,
    ) ?? 5;
  const releaseMs =
    readOptionalBoundedNumber(
      parameters.release_ms,
      "gate.release_ms",
      GATE_RELEASE_MIN_MS,
      GATE_RELEASE_MAX_MS,
    ) ?? 80;

  return {
    filterChain: `agate=level_in=1:mode=downward:range=${formatNumber(dbToLinear(-rangeDb))}:threshold=${formatNumber(dbToLinear(thresholdDb))}:ratio=${formatNumber(ratio)}:attack=${formatNumber(attackMs)}:release=${formatNumber(releaseMs)}:makeup=1:knee=1:detection=rms:link=maximum`,
    effectiveParameters: {
      threshold_db: thresholdDb,
      range_db: rangeDb,
      ratio,
      attack_ms: attackMs,
      release_ms: releaseMs,
    },
    nextAudio: { ...audio },
  };
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

function readOptionalBoundedInteger(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }

  return readBoundedNumber(value, label, min, max);
}

function dbToLinear(value: number): number {
  return 10 ** (value / 20);
}

function roundToSixDecimals(value: number): number {
  return Number(value.toFixed(6));
}

function formatNumber(value: number): string {
  return roundToSixDecimals(value).toString();
}

function formatDbPoint(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : formatNumber(value);
}
