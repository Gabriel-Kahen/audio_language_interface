import type { AudioVersion, EditTarget, OperationBuildResult } from "../types.js";

export function buildTrimOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertTrimTarget(target);
  const startSeconds = resolveStartSeconds(parameters, target);
  const endSeconds = resolveEndSeconds(parameters, target, audio.duration_seconds);

  if (endSeconds <= startSeconds) {
    throw new Error("trim end_seconds must be greater than start_seconds.");
  }

  if (endSeconds > audio.duration_seconds) {
    throw new Error("trim end_seconds must not exceed the current audio duration.");
  }

  const durationSeconds = Number((endSeconds - startSeconds).toFixed(6));

  return {
    filterChain: `atrim=start=${formatNumber(startSeconds)}:end=${formatNumber(endSeconds)},asetpts=N/SR/TB`,
    effectiveParameters: {
      start_seconds: startSeconds,
      end_seconds: endSeconds,
      duration_seconds: durationSeconds,
    },
    nextAudio: {
      ...audio,
      duration_seconds: durationSeconds,
      frame_count: Math.round(durationSeconds * audio.sample_rate_hz),
    },
  };
}

export function buildFadeOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  if (target?.scope !== undefined && target.scope !== "full_file") {
    throw new Error("fade only supports full_file targets in the initial implementation.");
  }

  const fadeInSeconds = readOptionalNonNegativeNumber(
    parameters.fade_in_seconds,
    "fade.fade_in_seconds",
  );
  const fadeOutSeconds = readOptionalNonNegativeNumber(
    parameters.fade_out_seconds,
    "fade.fade_out_seconds",
  );

  if (fadeInSeconds === undefined && fadeOutSeconds === undefined) {
    throw new Error("fade requires fade_in_seconds, fade_out_seconds, or both.");
  }

  if (fadeInSeconds !== undefined && fadeInSeconds > audio.duration_seconds) {
    throw new Error("fade.fade_in_seconds must not exceed the current audio duration.");
  }

  if (
    fadeInSeconds !== undefined &&
    fadeOutSeconds !== undefined &&
    fadeInSeconds + fadeOutSeconds > audio.duration_seconds
  ) {
    throw new Error(
      "fade fade_in_seconds and fade_out_seconds must fit within the current audio duration.",
    );
  }

  const filters: string[] = [];
  const effectiveParameters: Record<string, unknown> = {};

  if (fadeInSeconds !== undefined) {
    filters.push(`afade=t=in:st=0:d=${formatNumber(fadeInSeconds)}`);
    effectiveParameters.fade_in_seconds = fadeInSeconds;
  }

  if (fadeOutSeconds !== undefined) {
    if (fadeOutSeconds > audio.duration_seconds) {
      throw new Error("fade.fade_out_seconds must not exceed the current audio duration.");
    }

    const fadeOutStartSeconds = Number((audio.duration_seconds - fadeOutSeconds).toFixed(6));
    filters.push(
      `afade=t=out:st=${formatNumber(fadeOutStartSeconds)}:d=${formatNumber(fadeOutSeconds)}`,
    );
    effectiveParameters.fade_out_seconds = fadeOutSeconds;
    effectiveParameters.fade_out_start_seconds = fadeOutStartSeconds;
  }

  return {
    filterChain: filters.join(","),
    effectiveParameters,
    nextAudio: { ...audio },
  };
}

function assertTrimTarget(target?: EditTarget): void {
  if (
    target?.scope === undefined ||
    target.scope === "full_file" ||
    target.scope === "time_range"
  ) {
    return;
  }

  throw new Error(
    "trim only supports full_file or time_range targets in the initial implementation.",
  );
}

function resolveStartSeconds(parameters: Record<string, unknown>, target?: EditTarget): number {
  if (target?.scope === "time_range") {
    return readNonNegativeNumber(target.start_seconds, "trim.target.start_seconds");
  }

  return readNonNegativeNumber(parameters.start_seconds ?? 0, "trim.start_seconds");
}

function resolveEndSeconds(
  parameters: Record<string, unknown>,
  target: EditTarget | undefined,
  durationSeconds: number,
): number {
  if (target?.scope === "time_range") {
    return readNonNegativeNumber(target.end_seconds, "trim.target.end_seconds");
  }

  return readNonNegativeNumber(parameters.end_seconds ?? durationSeconds, "trim.end_seconds");
}

function readNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite number greater than or equal to 0.`);
  }

  return value;
}

function readOptionalNonNegativeNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return readNonNegativeNumber(value, label);
}

function formatNumber(value: number): string {
  return Number(value.toFixed(6)).toString();
}
