import type { AudioVersion, EditTarget, OperationBuildResult } from "../types.js";

export function buildGainOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("gain", target);
  const gainDb = readFiniteNumber(parameters.gain_db, "gain.gain_db");

  return {
    filterChain: `volume=${formatNumber(gainDb)}dB`,
    effectiveParameters: { gain_db: gainDb },
    nextAudio: { ...audio },
  };
}

export function buildNormalizeOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("normalize", target);
  const mode = parameters.mode ?? "peak";

  if (mode !== "peak") {
    throw new Error("normalize.mode must be 'peak' in the initial transforms implementation.");
  }

  const targetPeakDbfs = readFiniteNumber(
    parameters.target_peak_dbfs,
    "normalize.target_peak_dbfs",
  );
  const measuredPeakDbfs = readFiniteNumber(
    parameters.measured_peak_dbfs,
    "normalize.measured_peak_dbfs",
  );

  if (targetPeakDbfs > 0 || measuredPeakDbfs > 0) {
    throw new Error("normalize peak values must be less than or equal to 0 dBFS.");
  }

  const appliedGainDb = targetPeakDbfs - measuredPeakDbfs;

  return {
    filterChain: `volume=${formatNumber(appliedGainDb)}dB`,
    effectiveParameters: {
      mode: "peak",
      target_peak_dbfs: targetPeakDbfs,
      measured_peak_dbfs: measuredPeakDbfs,
      applied_gain_db: appliedGainDb,
    },
    nextAudio: { ...audio },
  };
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
