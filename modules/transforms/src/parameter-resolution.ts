import path from "node:path";

import { measureLoudness, measurePeakDbfs } from "./measurements.js";
import type { AudioVersion, EditTarget, OperationName } from "./types.js";

export async function resolveExecutionParameters(input: {
  workspaceRoot: string;
  version: AudioVersion;
  operation: OperationName;
  parameters: Record<string, unknown>;
  target?: EditTarget;
  ffmpegPath?: string;
}): Promise<Record<string, unknown>> {
  if (input.operation !== "normalize") {
    return input.parameters;
  }

  const mode = input.parameters.mode ?? "peak";
  const absolutePath = path.resolve(input.workspaceRoot, input.version.audio.storage_ref);

  if (mode === "peak") {
    if (input.parameters.measured_peak_dbfs !== undefined) {
      return input.parameters;
    }

    const measuredPeakDbfs = await measurePeakDbfs(absolutePath, {
      ...(input.ffmpegPath === undefined ? {} : { ffmpegPath: input.ffmpegPath }),
      ...(input.target === undefined ? {} : { target: input.target }),
    });

    return {
      ...input.parameters,
      mode: "peak",
      measured_peak_dbfs: measuredPeakDbfs,
    };
  }

  if (mode === "integrated_lufs") {
    if (
      input.parameters.measured_integrated_lufs !== undefined &&
      (input.parameters.max_true_peak_dbtp === undefined ||
        input.parameters.measured_true_peak_dbtp !== undefined)
    ) {
      return input.parameters;
    }

    const loudness = await measureLoudness(absolutePath, {
      ...(input.ffmpegPath === undefined ? {} : { ffmpegPath: input.ffmpegPath }),
      ...(input.target === undefined ? {} : { target: input.target }),
    });

    return {
      ...input.parameters,
      mode: "integrated_lufs",
      measured_integrated_lufs: loudness.integratedLufs,
      measured_true_peak_dbtp: loudness.truePeakDbtp,
    };
  }

  return input.parameters;
}
