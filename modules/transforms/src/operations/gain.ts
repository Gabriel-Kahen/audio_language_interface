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

  if (mode === "peak") {
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

    const appliedGainDb = roundToSixDecimals(targetPeakDbfs - measuredPeakDbfs);

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

  if (mode !== "integrated_lufs") {
    throw new Error("normalize.mode must be 'peak' or 'integrated_lufs'.");
  }

  const targetIntegratedLufs = readFiniteNumber(
    parameters.target_integrated_lufs,
    "normalize.target_integrated_lufs",
  );
  const measuredIntegratedLufs = readFiniteNumber(
    parameters.measured_integrated_lufs,
    "normalize.measured_integrated_lufs",
  );
  const measuredTruePeakDbtp = readOptionalFiniteNumber(
    parameters.measured_true_peak_dbtp,
    "normalize.measured_true_peak_dbtp",
  );
  const maxTruePeakDbtp =
    readOptionalFiniteNumber(parameters.max_true_peak_dbtp, "normalize.max_true_peak_dbtp") ?? -1;

  if (maxTruePeakDbtp > 0 || (measuredTruePeakDbtp !== undefined && measuredTruePeakDbtp > 0)) {
    throw new Error("normalize true-peak values must be less than or equal to 0 dBTP.");
  }

  const desiredGainDb = roundToSixDecimals(targetIntegratedLufs - measuredIntegratedLufs);
  const limitedGainDb =
    measuredTruePeakDbtp === undefined
      ? desiredGainDb
      : roundToSixDecimals(Math.min(desiredGainDb, maxTruePeakDbtp - measuredTruePeakDbtp));

  if (!Number.isFinite(limitedGainDb)) {
    throw new Error("normalize could not derive a finite loudness gain.");
  }

  const estimatedIntegratedLufs = roundToSixDecimals(measuredIntegratedLufs + limitedGainDb);
  const estimatedTruePeakDbtp =
    measuredTruePeakDbtp === undefined
      ? undefined
      : roundToSixDecimals(measuredTruePeakDbtp + limitedGainDb);

  return {
    filterChain: `volume=${formatNumber(limitedGainDb)}dB`,
    effectiveParameters: {
      mode: "integrated_lufs",
      target_integrated_lufs: targetIntegratedLufs,
      measured_integrated_lufs: measuredIntegratedLufs,
      max_true_peak_dbtp: maxTruePeakDbtp,
      ...(measuredTruePeakDbtp === undefined
        ? {}
        : { measured_true_peak_dbtp: measuredTruePeakDbtp }),
      applied_gain_db: limitedGainDb,
      estimated_integrated_lufs: estimatedIntegratedLufs,
      ...(estimatedTruePeakDbtp === undefined
        ? {}
        : { estimated_true_peak_dbtp: estimatedTruePeakDbtp }),
      gain_limited_by_true_peak: limitedGainDb < desiredGainDb,
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

  return roundToSixDecimals(value);
}

function readOptionalFiniteNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return readFiniteNumber(value, label);
}

function roundToSixDecimals(value: number): number {
  return Number(value.toFixed(6));
}

function formatNumber(value: number): string {
  return roundToSixDecimals(value).toString();
}
