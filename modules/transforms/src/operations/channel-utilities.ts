import type { AudioVersion, EditTarget, OperationBuildResult } from "../types.js";

const BALANCE_CORRECTION_MIN_DB = 0.01;
const BALANCE_CORRECTION_MAX_DB = 24;

export function buildReverseOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("reverse", target);
  assertEmptyParameters(parameters, "reverse");

  return {
    filterChain: "areverse",
    effectiveParameters: {},
    nextAudio: { ...audio },
  };
}

export function buildMonoSumOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("mono_sum", target);
  assertEmptyParameters(parameters, "mono_sum");

  const mixCoefficient = roundToSixDecimals(1 / audio.channels);
  const terms = Array.from(
    { length: audio.channels },
    (_, index) => `${formatNumber(mixCoefficient)}*c${index}`,
  );

  return {
    filterChain: `pan=mono|c0=${terms.join("+")}`,
    effectiveParameters: {},
    nextAudio: {
      ...audio,
      channels: 1,
      channel_layout: "mono",
    },
  };
}

export function buildChannelSwapOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("channel_swap", target);
  assertEmptyParameters(parameters, "channel_swap");
  assertStereoInput("channel_swap", audio);

  return {
    filterChain: "pan=stereo|c0=c1|c1=c0",
    effectiveParameters: {},
    nextAudio: {
      ...audio,
      channel_layout: audio.channel_layout ?? "stereo",
    },
  };
}

export function buildStereoBalanceCorrectionOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("stereo_balance_correction", target);
  assertStereoInput("stereo_balance_correction", audio);

  const targetChannel = readTargetChannel(parameters.target_channel);
  const correctionDb = readBoundedNumber(
    parameters.correction_db,
    "stereo_balance_correction.correction_db",
    BALANCE_CORRECTION_MIN_DB,
    BALANCE_CORRECTION_MAX_DB,
  );
  const attenuation = formatNumber(dbToAmplitude(-correctionDb));
  const leftGain = targetChannel === "left" ? attenuation : "1";
  const rightGain = targetChannel === "right" ? attenuation : "1";

  return {
    filterChain: `pan=stereo|c0=${leftGain}*c0|c1=${rightGain}*c1`,
    effectiveParameters: {
      target_channel: targetChannel,
      correction_db: correctionDb,
    },
    nextAudio: {
      ...audio,
      channel_layout: audio.channel_layout ?? "stereo",
    },
  };
}

function assertFullFileTarget(operation: string, target?: EditTarget): void {
  if (target?.scope !== undefined && target.scope !== "full_file") {
    throw new Error(`${operation} only supports full_file targets in the initial implementation.`);
  }
}

function assertEmptyParameters(parameters: Record<string, unknown>, operation: string): void {
  if (Object.keys(parameters).length > 0) {
    throw new Error(`${operation} does not accept parameters in the initial implementation.`);
  }
}

function assertStereoInput(operation: string, audio: AudioVersion["audio"]): void {
  if (audio.channels !== 2) {
    throw new Error(`${operation} requires stereo 2-channel audio in the initial implementation.`);
  }
}

function readTargetChannel(value: unknown): "left" | "right" {
  if (value !== "left" && value !== "right") {
    throw new Error('stereo_balance_correction.target_channel must be either "left" or "right".');
  }

  return value;
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

function dbToAmplitude(valueDb: number): number {
  return roundToSixDecimals(10 ** (valueDb / 20));
}

function roundToSixDecimals(value: number): number {
  return Number(value.toFixed(6));
}

function formatNumber(value: number): string {
  return roundToSixDecimals(value).toString();
}
