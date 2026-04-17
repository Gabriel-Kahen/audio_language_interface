import type { AudioVersion, EditTarget, OperationBuildResult } from "../types.js";

const STEREO_WIDTH_MIN = 0;
const STEREO_WIDTH_MAX = 2;

const DENOISE_REDUCTION_MIN_DB = 0.01;
const DENOISE_REDUCTION_MAX_DB = 24;
const DENOISE_NOISE_FLOOR_MIN_DBFS = -80;
const DENOISE_NOISE_FLOOR_MAX_DBFS = -20;
const DEFAULT_DENOISE_NOISE_FLOOR_DBFS = -50;

export function buildStereoWidthOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("stereo_width", target);

  if (audio.channels !== 2) {
    throw new Error("stereo_width requires stereo 2-channel audio.");
  }

  const widthMultiplier = readBoundedNumber(
    parameters.width_multiplier,
    "stereo_width.width_multiplier",
    STEREO_WIDTH_MIN,
    STEREO_WIDTH_MAX,
  );

  return {
    filterChain: `extrastereo=m=${formatNumber(widthMultiplier)}:c=false`,
    effectiveParameters: {
      width_multiplier: widthMultiplier,
    },
    nextAudio: {
      ...audio,
      channel_layout: audio.channel_layout ?? "stereo",
    },
  };
}

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

function roundToSixDecimals(value: number): number {
  return Number(value.toFixed(6));
}

function formatNumber(value: number): string {
  return roundToSixDecimals(value).toString();
}
