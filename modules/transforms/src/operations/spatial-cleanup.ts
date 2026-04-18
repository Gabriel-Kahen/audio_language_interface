import type { AudioVersion, EditTarget, OperationBuildResult } from "../types.js";

const STEREO_WIDTH_MIN = 0;
const STEREO_WIDTH_MAX = 2;

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

function roundToSixDecimals(value: number): number {
  return Number(value.toFixed(6));
}

function formatNumber(value: number): string {
  return roundToSixDecimals(value).toString();
}
