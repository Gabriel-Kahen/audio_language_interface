import type { AudioVersion, EditTarget, OperationBuildResult } from "../types.js";

const BALANCE_CORRECTION_MIN_DB = 0.01;
const BALANCE_CORRECTION_MAX_DB = 24;
const PAN_MIN_POSITION = -1;
const PAN_MAX_POSITION = 1;
const CHANNEL_REMAP_MIN_OUTPUT_CHANNELS = 1;
const CHANNEL_REMAP_MAX_OUTPUT_CHANNELS = 8;
const CHANNEL_REMAP_MIN_GAIN = -4;
const CHANNEL_REMAP_MAX_GAIN = 4;

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

export function buildPanOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("pan", target);

  if (audio.channels !== 1 && audio.channels !== 2) {
    throw new Error("pan requires mono or stereo input in the initial implementation.");
  }

  const position = readBoundedNumber(
    parameters.position,
    "pan.position",
    PAN_MIN_POSITION,
    PAN_MAX_POSITION,
  );

  if (audio.channels === 1) {
    const leftGain = roundToSixDecimals(Math.sqrt((1 - position) / 2));
    const rightGain = roundToSixDecimals(Math.sqrt((1 + position) / 2));

    return {
      filterChain: `pan=stereo|c0=${formatNumber(leftGain)}*c0|c1=${formatNumber(rightGain)}*c0`,
      effectiveParameters: {
        position,
        resolved_mode: "mono_to_stereo",
        left_gain: leftGain,
        right_gain: rightGain,
      },
      nextAudio: {
        ...audio,
        channels: 2,
        channel_layout: "stereo",
      },
    };
  }

  const leftGain = roundToSixDecimals(position > 0 ? 1 - position : 1);
  const rightGain = roundToSixDecimals(position < 0 ? 1 + position : 1);

  return {
    filterChain: `pan=stereo|c0=${formatNumber(leftGain)}*c0|c1=${formatNumber(rightGain)}*c1`,
    effectiveParameters: {
      position,
      resolved_mode: "stereo_balance",
      left_gain: leftGain,
      right_gain: rightGain,
    },
    nextAudio: {
      ...audio,
      channel_layout: audio.channel_layout ?? "stereo",
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

export function buildChannelRemapOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("channel_remap", target);

  const outputChannels = readIntegerInRange(
    parameters.output_channels,
    "channel_remap.output_channels",
    CHANNEL_REMAP_MIN_OUTPUT_CHANNELS,
    CHANNEL_REMAP_MAX_OUTPUT_CHANNELS,
  );
  const rawRoutes = parameters.routes;

  if (!Array.isArray(rawRoutes) || rawRoutes.length === 0) {
    throw new Error("channel_remap.routes must be a non-empty array.");
  }

  const routes = rawRoutes.map((route, index) =>
    normalizeChannelRoute(route, index, audio.channels, outputChannels),
  );
  const outputExpressions = Array.from({ length: outputChannels }, (_, outputChannel) =>
    buildOutputChannelExpression(routes, outputChannel),
  );
  const channelLayout = resolveChannelLayout(outputChannels);
  const { channel_layout: _ignoredChannelLayout, ...audioWithoutChannelLayout } = audio;

  return {
    filterChain: `pan=${formatOutputLayout(outputChannels)}|${outputExpressions.join("|")}`,
    effectiveParameters: {
      output_channels: outputChannels,
      routes,
    },
    nextAudio: {
      ...audioWithoutChannelLayout,
      channels: outputChannels,
      ...(channelLayout === undefined ? {} : { channel_layout: channelLayout }),
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

export function buildMidSideEqOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("mid_side_eq", target);
  assertStereoInput("mid_side_eq", audio);

  const nyquist = audio.sample_rate_hz / 2;
  const midBands = normalizeOptionalBellBands(
    parameters.mid_bands,
    "mid_side_eq.mid_bands",
    nyquist,
  );
  const sideBands = normalizeOptionalBellBands(
    parameters.side_bands,
    "mid_side_eq.side_bands",
    nyquist,
  );

  if (midBands === undefined && sideBands === undefined) {
    throw new Error("mid_side_eq requires at least one mid_bands or side_bands entry.");
  }

  const filterParts = ["stereotools=mode=lr>ms"];

  for (const band of midBands ?? []) {
    filterParts.push(
      `equalizer=f=${formatNumber(band.frequency_hz)}:t=q:w=${formatNumber(band.q)}:g=${formatNumber(band.gain_db)}:c=FL`,
    );
  }

  for (const band of sideBands ?? []) {
    filterParts.push(
      `equalizer=f=${formatNumber(band.frequency_hz)}:t=q:w=${formatNumber(band.q)}:g=${formatNumber(band.gain_db)}:c=FR`,
    );
  }

  filterParts.push("stereotools=mode=ms>lr");

  return {
    filterChain: filterParts.join(","),
    effectiveParameters: {
      ...(midBands === undefined ? {} : { mid_bands: midBands }),
      ...(sideBands === undefined ? {} : { side_bands: sideBands }),
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

function readIntegerInRange(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }

  if (value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }

  return value;
}

function normalizeChannelRoute(
  value: unknown,
  index: number,
  inputChannels: number,
  outputChannels: number,
): {
  output_channel: number;
  input_channel: number;
  gain: number;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`channel_remap.routes[${index}] must be an object.`);
  }

  const route = value as Record<string, unknown>;
  const outputChannel = readIntegerInRange(
    route.output_channel,
    `channel_remap.routes[${index}].output_channel`,
    0,
    outputChannels - 1,
  );
  const inputChannel = readIntegerInRange(
    route.input_channel,
    `channel_remap.routes[${index}].input_channel`,
    0,
    inputChannels - 1,
  );
  const gain =
    route.gain === undefined
      ? 1
      : readBoundedNumber(
          route.gain,
          `channel_remap.routes[${index}].gain`,
          CHANNEL_REMAP_MIN_GAIN,
          CHANNEL_REMAP_MAX_GAIN,
        );

  return {
    output_channel: outputChannel,
    input_channel: inputChannel,
    gain: roundToSixDecimals(gain),
  };
}

function buildOutputChannelExpression(
  routes: Array<{ output_channel: number; input_channel: number; gain: number }>,
  outputChannel: number,
): string {
  const applicableRoutes = routes
    .filter((route) => route.output_channel === outputChannel)
    .map((route) => formatChannelGain(route.gain, route.input_channel));

  return `c${outputChannel}=${applicableRoutes.join("+") || "0*c0"}`;
}

function formatOutputLayout(outputChannels: number): string {
  if (outputChannels === 1) {
    return "mono";
  }

  if (outputChannels === 2) {
    return "stereo";
  }

  return `${outputChannels}c`;
}

function resolveChannelLayout(outputChannels: number): string | undefined {
  if (outputChannels === 1) {
    return "mono";
  }

  if (outputChannels === 2) {
    return "stereo";
  }

  return undefined;
}

function normalizeOptionalBellBands(
  value: unknown,
  label: string,
  nyquist: number,
):
  | Array<{
      type: "bell";
      frequency_hz: number;
      gain_db: number;
      q: number;
    }>
  | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array when provided.`);
  }

  return value.map((band, index) => normalizeBellBand(band, `${label}[${index}]`, nyquist));
}

function normalizeBellBand(
  value: unknown,
  label: string,
  nyquist: number,
): {
  type: "bell";
  frequency_hz: number;
  gain_db: number;
  q: number;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  const band = value as Record<string, unknown>;

  if (band.type !== "bell") {
    throw new Error(`${label}.type must be "bell".`);
  }

  const frequencyHz = readFiniteNumber(band.frequency_hz, `${label}.frequency_hz`);
  const gainDb = readFiniteNumber(band.gain_db, `${label}.gain_db`);
  const q = readFiniteNumber(band.q, `${label}.q`);

  if (frequencyHz <= 0 || frequencyHz >= nyquist) {
    throw new Error(`${label}.frequency_hz must be between 0 and Nyquist.`);
  }

  if (q <= 0) {
    throw new Error(`${label}.q must be greater than 0.`);
  }

  return {
    type: "bell",
    frequency_hz: roundToSixDecimals(frequencyHz),
    gain_db: roundToSixDecimals(gainDb),
    q: roundToSixDecimals(q),
  };
}

function readFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
}

function formatChannelGain(gain: number, inputChannel: number): string {
  if (gain === 1) {
    return `c${inputChannel}`;
  }

  return `${formatNumber(gain)}*c${inputChannel}`;
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
