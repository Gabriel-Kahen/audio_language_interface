import type { AudioVersion, EditTarget, OperationBuildResult, OperationName } from "./types.js";

const EPSILON = 1e-6;

const TIME_RANGE_SUPPORTED_OPERATIONS = new Set<OperationName>([
  "gain",
  "normalize",
  "fade",
  "pitch_shift",
  "parametric_eq",
  "high_pass_filter",
  "low_pass_filter",
  "high_shelf",
  "low_shelf",
  "notch_filter",
  "tilt_eq",
  "compressor",
  "limiter",
  "transient_shaper",
  "clipper",
  "gate",
  "reverse",
  "channel_swap",
  "stereo_balance_correction",
  "mid_side_eq",
  "stereo_width",
  "denoise",
  "bitcrush",
  "distortion",
  "saturation",
  "flanger",
  "phaser",
]);

export interface ResolvedTimeRangeTarget {
  scope: "time_range";
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
}

export function supportsTimeRangeTarget(operation: OperationName): boolean {
  return TIME_RANGE_SUPPORTED_OPERATIONS.has(operation);
}

export function isTimeRangeTarget(target?: EditTarget): target is ResolvedTimeRangeTarget {
  return target?.scope === "time_range";
}

export function resolveTimeRangeTarget(
  operation: OperationName,
  audio: AudioVersion["audio"],
  target: EditTarget,
): ResolvedTimeRangeTarget {
  if (target.scope !== "time_range") {
    throw new Error(`${operation} only supports full_file targets in the current runtime.`);
  }

  const startSeconds = readNonNegativeNumber(
    target.start_seconds,
    `${operation}.target.start_seconds`,
  );
  const endSeconds = readNonNegativeNumber(target.end_seconds, `${operation}.target.end_seconds`);

  if (endSeconds <= startSeconds) {
    throw new Error(`${operation} target end_seconds must be greater than start_seconds.`);
  }

  if (endSeconds > audio.duration_seconds) {
    throw new Error(`${operation} target end_seconds must not exceed the current audio duration.`);
  }

  return {
    scope: "time_range",
    start_seconds: startSeconds,
    end_seconds: endSeconds,
    duration_seconds: roundToSixDecimals(endSeconds - startSeconds),
  };
}

export function buildTimeRangeOperation(input: {
  audio: AudioVersion["audio"];
  operation: OperationName;
  parameters: Record<string, unknown>;
  target: EditTarget;
  buildFullFileOperation: (
    audio: AudioVersion["audio"],
    operation: OperationName,
    parameters: Record<string, unknown>,
  ) => OperationBuildResult;
}): OperationBuildResult {
  if (!supportsTimeRangeTarget(input.operation)) {
    throw new Error(`${input.operation} only supports full_file targets in the current runtime.`);
  }

  const resolvedTarget = resolveTimeRangeTarget(input.operation, input.audio, input.target);
  const segmentAudio = buildSegmentAudio(input.audio, resolvedTarget.duration_seconds);
  const builtSegment = input.buildFullFileOperation(
    segmentAudio,
    input.operation,
    input.parameters,
  );

  assertTimeRangeCompatible(input.operation, input.audio, segmentAudio, builtSegment);

  return {
    filterChain: wrapFilterChainForTimeRange(
      builtSegment.filterChain,
      input.audio.duration_seconds,
      resolvedTarget,
    ),
    effectiveParameters: builtSegment.effectiveParameters,
    nextAudio: { ...input.audio },
  };
}

function buildSegmentAudio(
  audio: AudioVersion["audio"],
  durationSeconds: number,
): AudioVersion["audio"] {
  return {
    ...audio,
    duration_seconds: durationSeconds,
    frame_count: Math.round(durationSeconds * audio.sample_rate_hz),
  };
}

function assertTimeRangeCompatible(
  operation: OperationName,
  inputAudio: AudioVersion["audio"],
  segmentAudio: AudioVersion["audio"],
  builtSegment: OperationBuildResult,
): void {
  if (builtSegment.requiresOutputProbe) {
    throw new Error(
      `${operation} does not yet support time_range targets because region-scoped output probing is not implemented.`,
    );
  }

  if (builtSegment.nextAudio.sample_rate_hz !== inputAudio.sample_rate_hz) {
    throw new Error(
      `${operation} does not yet support time_range targets because it changes sample rate.`,
    );
  }

  if (builtSegment.nextAudio.channels !== inputAudio.channels) {
    throw new Error(
      `${operation} does not yet support time_range targets because it changes channel count.`,
    );
  }

  if (Math.abs(builtSegment.nextAudio.duration_seconds - segmentAudio.duration_seconds) > EPSILON) {
    throw new Error(
      `${operation} does not yet support time_range targets because it changes duration.`,
    );
  }
}

function wrapFilterChainForTimeRange(
  operationFilterChain: string,
  sourceDurationSeconds: number,
  target: ResolvedTimeRangeTarget,
): string {
  const processedRegionChain = `atrim=start=${formatNumber(target.start_seconds)}:end=${formatNumber(target.end_seconds)},asetpts=N/SR/TB,${operationFilterChain},atrim=start=0:end=${formatNumber(target.duration_seconds)},asetpts=N/SR/TB`;
  const hasPrefix = target.start_seconds > EPSILON;
  const hasSuffix = sourceDurationSeconds - target.end_seconds > EPSILON;

  if (!hasPrefix && !hasSuffix) {
    return operationFilterChain;
  }

  if (!hasPrefix) {
    return [
      "asplit=2[region][suffix]",
      `[region]${processedRegionChain}[region_out]`,
      `[suffix]atrim=start=${formatNumber(target.end_seconds)},asetpts=N/SR/TB[suffix_out]`,
      "[region_out][suffix_out]concat=n=2:v=0:a=1",
    ].join(";");
  }

  if (!hasSuffix) {
    return [
      "asplit=2[prefix][region]",
      `[prefix]atrim=start=0:end=${formatNumber(target.start_seconds)},asetpts=N/SR/TB[prefix_out]`,
      `[region]${processedRegionChain}[region_out]`,
      "[prefix_out][region_out]concat=n=2:v=0:a=1",
    ].join(";");
  }

  return [
    "asplit=3[prefix][region][suffix]",
    `[prefix]atrim=start=0:end=${formatNumber(target.start_seconds)},asetpts=N/SR/TB[prefix_out]`,
    `[region]${processedRegionChain}[region_out]`,
    `[suffix]atrim=start=${formatNumber(target.end_seconds)},asetpts=N/SR/TB[suffix_out]`,
    "[prefix_out][region_out][suffix_out]concat=n=3:v=0:a=1",
  ].join(";");
}

function readNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite number greater than or equal to 0.`);
  }

  return roundToSixDecimals(value);
}

function roundToSixDecimals(value: number): number {
  return Number(value.toFixed(6));
}

function formatNumber(value: number): string {
  return roundToSixDecimals(value).toString();
}
