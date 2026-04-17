import type { AudioVersion, EditTarget, OperationBuildResult } from "../types.js";

const COMPRESSOR_THRESHOLD_MIN_DBFS = -60;
const COMPRESSOR_THRESHOLD_MAX_DBFS = 0;
const COMPRESSOR_RATIO_MIN = 1;
const COMPRESSOR_RATIO_MAX = 20;
const COMPRESSOR_KNEE_MIN_DB = 0;
const COMPRESSOR_KNEE_MAX_DB = 24;
const COMPRESSOR_ATTACK_MIN_MS = 0.01;
const COMPRESSOR_ATTACK_MAX_MS = 2000;
const COMPRESSOR_RELEASE_MIN_MS = 0.01;
const COMPRESSOR_RELEASE_MAX_MS = 9000;
const COMPRESSOR_MAKEUP_GAIN_MIN_DB = 0;
const COMPRESSOR_MAKEUP_GAIN_MAX_DB = 20;

const LIMITER_CEILING_MIN_DBTP = -24;
const LIMITER_CEILING_MAX_DBTP = 0;
const LIMITER_LOOKAHEAD_MIN_MS = 0.1;
const LIMITER_LOOKAHEAD_MAX_MS = 80;
const LIMITER_RELEASE_MIN_MS = 1;
const LIMITER_RELEASE_MAX_MS = 8000;
const LIMITER_INPUT_GAIN_MIN_DB = -24;
const LIMITER_INPUT_GAIN_MAX_DB = 24;

export function buildCompressorOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("compressor", target);
  const thresholdDb = readBoundedNumber(
    parameters.threshold_db,
    "compressor.threshold_db",
    COMPRESSOR_THRESHOLD_MIN_DBFS,
    COMPRESSOR_THRESHOLD_MAX_DBFS,
  );
  const ratio = readBoundedNumber(
    parameters.ratio,
    "compressor.ratio",
    COMPRESSOR_RATIO_MIN,
    COMPRESSOR_RATIO_MAX,
  );
  const attackMs = readBoundedNumber(
    parameters.attack_ms,
    "compressor.attack_ms",
    COMPRESSOR_ATTACK_MIN_MS,
    COMPRESSOR_ATTACK_MAX_MS,
  );
  const releaseMs = readBoundedNumber(
    parameters.release_ms,
    "compressor.release_ms",
    COMPRESSOR_RELEASE_MIN_MS,
    COMPRESSOR_RELEASE_MAX_MS,
  );
  const kneeDb = readOptionalBoundedNumber(
    parameters.knee_db,
    "compressor.knee_db",
    COMPRESSOR_KNEE_MIN_DB,
    COMPRESSOR_KNEE_MAX_DB,
  );
  const makeupGainDb = readOptionalBoundedNumber(
    parameters.makeup_gain_db,
    "compressor.makeup_gain_db",
    COMPRESSOR_MAKEUP_GAIN_MIN_DB,
    COMPRESSOR_MAKEUP_GAIN_MAX_DB,
  );
  const normalizedKneeDb = kneeDb ?? 3;
  const normalizedMakeupGainDb = makeupGainDb ?? 0;
  const thresholdLinear = dbToLinear(thresholdDb);
  const kneeLinear = dbToLinear(normalizedKneeDb);
  const makeupLinear = dbToLinear(normalizedMakeupGainDb);

  return {
    filterChain: `acompressor=level_in=1:mode=downward:threshold=${formatNumber(thresholdLinear)}:ratio=${formatNumber(ratio)}:attack=${formatNumber(attackMs)}:release=${formatNumber(releaseMs)}:makeup=${formatNumber(makeupLinear)}:knee=${formatNumber(kneeLinear)}:link=maximum:detection=rms:mix=1`,
    effectiveParameters: {
      threshold_db: thresholdDb,
      ratio,
      attack_ms: attackMs,
      release_ms: releaseMs,
      knee_db: normalizedKneeDb,
      makeup_gain_db: normalizedMakeupGainDb,
    },
    nextAudio: { ...audio },
  };
}

export function buildLimiterOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("limiter", target);
  const ceilingDbtp = readBoundedNumber(
    parameters.ceiling_dbtp,
    "limiter.ceiling_dbtp",
    LIMITER_CEILING_MIN_DBTP,
    LIMITER_CEILING_MAX_DBTP,
  );
  const lookaheadMs = readOptionalBoundedNumber(
    parameters.lookahead_ms,
    "limiter.lookahead_ms",
    LIMITER_LOOKAHEAD_MIN_MS,
    LIMITER_LOOKAHEAD_MAX_MS,
  );
  const releaseMs = readBoundedNumber(
    parameters.release_ms ?? 80,
    "limiter.release_ms",
    LIMITER_RELEASE_MIN_MS,
    LIMITER_RELEASE_MAX_MS,
  );
  const inputGainDb = readOptionalBoundedNumber(
    parameters.input_gain_db,
    "limiter.input_gain_db",
    LIMITER_INPUT_GAIN_MIN_DB,
    LIMITER_INPUT_GAIN_MAX_DB,
  );
  const normalizedLookaheadMs = lookaheadMs ?? 5;
  const normalizedInputGainDb = inputGainDb ?? 0;
  const limitLinear = dbToLinear(ceilingDbtp);
  const inputGainLinear = dbToLinear(normalizedInputGainDb);

  return {
    filterChain: `alimiter=level_in=${formatNumber(inputGainLinear)}:level_out=1:limit=${formatNumber(limitLinear)}:attack=${formatNumber(normalizedLookaheadMs)}:release=${formatNumber(releaseMs)}:asc=false:asc_level=0.5:level=false:latency=true`,
    effectiveParameters: {
      ceiling_dbtp: ceilingDbtp,
      lookahead_ms: normalizedLookaheadMs,
      release_ms: releaseMs,
      input_gain_db: normalizedInputGainDb,
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

function dbToLinear(value: number): number {
  return 10 ** (value / 20);
}

function roundToSixDecimals(value: number): number {
  return Number(value.toFixed(6));
}

function formatNumber(value: number): string {
  return roundToSixDecimals(value).toString();
}
