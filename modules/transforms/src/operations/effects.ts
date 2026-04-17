import type { AudioVersion, EditTarget, OperationBuildResult } from "../types.js";

const REVERB_PRE_DELAY_MIN_MS = 1;
const REVERB_PRE_DELAY_MAX_MS = 250;
const REVERB_REFLECTION_SPACING_MIN_MS = 1;
const REVERB_REFLECTION_SPACING_MAX_MS = 250;
const REVERB_TAIL_TAPS_MIN = 2;
const REVERB_TAIL_TAPS_MAX = 8;
const REVERB_DECAY_MIN = 0.01;
const REVERB_DECAY_MAX = 0.95;

const DELAY_MIN_MS = 1;
const DELAY_MAX_MS = 5000;

const ECHO_DECAY_MIN = 0.01;
const ECHO_DECAY_MAX = 0.95;

const MIX_MIN = 0;
const MIX_MAX = 1;

const BIT_DEPTH_MIN = 1;
const BIT_DEPTH_MAX = 24;
const SAMPLE_HOLD_MIN = 1;
const SAMPLE_HOLD_MAX = 250;

const DRIVE_MIN_DB = 0;
const DISTORTION_DRIVE_MAX_DB = 36;
const SATURATION_DRIVE_MAX_DB = 24;
const OUTPUT_GAIN_MIN_DB = -24;
const OUTPUT_GAIN_MAX_DB = 24;
const DISTORTION_THRESHOLD_MIN = 0.01;
const DISTORTION_THRESHOLD_MAX = 1;
const OVERSAMPLE_MIN = 1;
const OVERSAMPLE_MAX = 8;

const FLANGER_DELAY_MIN_MS = 0;
const FLANGER_DELAY_MAX_MS = 30;
const FLANGER_DEPTH_MIN_MS = 0;
const FLANGER_DEPTH_MAX_MS = 10;
const FLANGER_FEEDBACK_MIN_PERCENT = -95;
const FLANGER_FEEDBACK_MAX_PERCENT = 95;
const FLANGER_MIX_MIN_PERCENT = 0;
const FLANGER_MIX_MAX_PERCENT = 100;
const FLANGER_RATE_MIN_HZ = 0.1;
const FLANGER_RATE_MAX_HZ = 10;

const PHASER_INPUT_GAIN_MIN_DB = -60;
const PHASER_INPUT_GAIN_MAX_DB = 0;
const PHASER_OUTPUT_GAIN_MIN_DB = -60;
const PHASER_OUTPUT_GAIN_MAX_DB = 24;
const PHASER_DELAY_MIN_MS = 0;
const PHASER_DELAY_MAX_MS = 5;
const PHASER_DECAY_MIN = 0;
const PHASER_DECAY_MAX = 0.99;
const PHASER_RATE_MIN_HZ = 0.1;
const PHASER_RATE_MAX_HZ = 2;

type CrusherMode = "lin" | "log";
type SoftClipCurve = "tanh" | "atan" | "cubic";
type LfoWaveform = "sinusoidal" | "triangular";

export function buildReverbOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("reverb", target);
  const preDelayMs = readBoundedNumber(
    parameters.pre_delay_ms,
    "reverb.pre_delay_ms",
    REVERB_PRE_DELAY_MIN_MS,
    REVERB_PRE_DELAY_MAX_MS,
  );
  const reflectionSpacingMs = readBoundedNumber(
    parameters.reflection_spacing_ms,
    "reverb.reflection_spacing_ms",
    REVERB_REFLECTION_SPACING_MIN_MS,
    REVERB_REFLECTION_SPACING_MAX_MS,
  );
  const tailTaps = readBoundedInteger(
    parameters.tail_taps,
    "reverb.tail_taps",
    REVERB_TAIL_TAPS_MIN,
    REVERB_TAIL_TAPS_MAX,
  );
  const decay = readBoundedNumber(
    parameters.decay,
    "reverb.decay",
    REVERB_DECAY_MIN,
    REVERB_DECAY_MAX,
  );
  const dryMix = readOptionalBoundedNumber(parameters.dry_mix, "reverb.dry_mix", MIX_MIN, MIX_MAX);
  const wetMix = readOptionalBoundedNumber(parameters.wet_mix, "reverb.wet_mix", MIX_MIN, MIX_MAX);
  const normalizedDryMix = dryMix ?? 0.82;
  const normalizedWetMix = wetMix ?? 0.35;
  const tapDelaysMs = Array.from({ length: tailTaps }, (_, index) =>
    roundToSixDecimals(preDelayMs + reflectionSpacingMs * index),
  );
  const tapDecays = tapDelaysMs.map((_, index) =>
    roundToSixDecimals(Math.max(0.001, decay * 0.72 ** index)),
  );

  return {
    filterChain: buildClipPreservingFilterChain(
      audio,
      `aecho=${formatNumber(normalizedDryMix)}:${formatNumber(normalizedWetMix)}:${tapDelaysMs.map(formatNumber).join("|")}:${tapDecays.map(formatNumber).join("|")}`,
    ),
    effectiveParameters: {
      pre_delay_ms: preDelayMs,
      reflection_spacing_ms: reflectionSpacingMs,
      tail_taps: tailTaps,
      decay,
      dry_mix: normalizedDryMix,
      wet_mix: normalizedWetMix,
      tap_delays_ms: tapDelaysMs,
      tap_decays: tapDecays,
    },
    nextAudio: { ...audio },
  };
}

export function buildDelayOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("delay", target);
  const delayMs = readBoundedNumber(
    parameters.delay_ms,
    "delay.delay_ms",
    DELAY_MIN_MS,
    DELAY_MAX_MS,
  );
  const dryMix = readOptionalBoundedNumber(parameters.dry_mix, "delay.dry_mix", MIX_MIN, MIX_MAX);
  const wetMix = readOptionalBoundedNumber(parameters.wet_mix, "delay.wet_mix", MIX_MIN, MIX_MAX);
  const normalizedDryMix = dryMix ?? 0.85;
  const normalizedWetMix = wetMix ?? 0.35;

  return {
    filterChain: buildClipPreservingFilterChain(
      audio,
      `asplit=2[dry][wet];[wet]adelay=delays=${formatNumber(delayMs)}:all=1,volume=${formatNumber(normalizedWetMix)}[wetmix];[dry]volume=${formatNumber(normalizedDryMix)}[drymix];[drymix][wetmix]amix=inputs=2:normalize=0`,
    ),
    effectiveParameters: {
      delay_ms: delayMs,
      dry_mix: normalizedDryMix,
      wet_mix: normalizedWetMix,
    },
    nextAudio: { ...audio },
  };
}

export function buildEchoOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("echo", target);
  const delayMs = readBoundedNumber(
    parameters.delay_ms,
    "echo.delay_ms",
    DELAY_MIN_MS,
    DELAY_MAX_MS,
  );
  const decay = readBoundedNumber(parameters.decay, "echo.decay", ECHO_DECAY_MIN, ECHO_DECAY_MAX);
  const dryMix = readOptionalBoundedNumber(parameters.dry_mix, "echo.dry_mix", MIX_MIN, MIX_MAX);
  const wetMix = readOptionalBoundedNumber(parameters.wet_mix, "echo.wet_mix", MIX_MIN, MIX_MAX);
  const normalizedDryMix = dryMix ?? 0.8;
  const normalizedWetMix = wetMix ?? 0.4;

  return {
    filterChain: buildClipPreservingFilterChain(
      audio,
      `aecho=${formatNumber(normalizedDryMix)}:${formatNumber(normalizedWetMix)}:${formatNumber(delayMs)}:${formatNumber(decay)}`,
    ),
    effectiveParameters: {
      delay_ms: delayMs,
      decay,
      dry_mix: normalizedDryMix,
      wet_mix: normalizedWetMix,
    },
    nextAudio: { ...audio },
  };
}

export function buildBitcrushOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("bitcrush", target);
  const bitDepth = readBoundedInteger(
    parameters.bit_depth,
    "bitcrush.bit_depth",
    BIT_DEPTH_MIN,
    BIT_DEPTH_MAX,
  );
  const sampleHoldSamples = readBoundedInteger(
    parameters.sample_hold_samples,
    "bitcrush.sample_hold_samples",
    SAMPLE_HOLD_MIN,
    SAMPLE_HOLD_MAX,
  );
  const mix = readOptionalBoundedNumber(parameters.mix, "bitcrush.mix", MIX_MIN, MIX_MAX) ?? 1;
  const mode = readEnum<CrusherMode>(parameters.mode, "bitcrush.mode", ["lin", "log"]) ?? "lin";

  return {
    filterChain: `acrusher=bits=${bitDepth}:samples=${sampleHoldSamples}:mix=${formatNumber(mix)}:mode=${mode}:aa=1`,
    effectiveParameters: {
      bit_depth: bitDepth,
      sample_hold_samples: sampleHoldSamples,
      mix,
      mode,
    },
    nextAudio: { ...audio },
  };
}

export function buildDistortionOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("distortion", target);
  const driveDb = readBoundedNumber(
    parameters.drive_db,
    "distortion.drive_db",
    DRIVE_MIN_DB,
    DISTORTION_DRIVE_MAX_DB,
  );
  const threshold = readBoundedNumber(
    parameters.threshold,
    "distortion.threshold",
    DISTORTION_THRESHOLD_MIN,
    DISTORTION_THRESHOLD_MAX,
  );
  const outputGainDb =
    readOptionalBoundedNumber(
      parameters.output_gain_db,
      "distortion.output_gain_db",
      OUTPUT_GAIN_MIN_DB,
      OUTPUT_GAIN_MAX_DB,
    ) ?? 0;
  const oversampleFactor =
    readOptionalBoundedInteger(
      parameters.oversample_factor,
      "distortion.oversample_factor",
      OVERSAMPLE_MIN,
      OVERSAMPLE_MAX,
    ) ?? 2;

  return {
    filterChain: `volume=${formatNumber(driveDb)}dB,asoftclip=type=hard:threshold=${formatNumber(threshold)}:output=${formatNumber(dbToLinear(outputGainDb))}:param=1:oversample=${oversampleFactor}`,
    effectiveParameters: {
      drive_db: driveDb,
      threshold,
      output_gain_db: outputGainDb,
      oversample_factor: oversampleFactor,
      clip_mode: "hard",
    },
    nextAudio: { ...audio },
  };
}

export function buildSaturationOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("saturation", target);
  const driveDb = readBoundedNumber(
    parameters.drive_db,
    "saturation.drive_db",
    DRIVE_MIN_DB,
    SATURATION_DRIVE_MAX_DB,
  );
  const curve =
    readEnum<SoftClipCurve>(parameters.curve, "saturation.curve", ["tanh", "atan", "cubic"]) ??
    "tanh";
  const outputGainDb =
    readOptionalBoundedNumber(
      parameters.output_gain_db,
      "saturation.output_gain_db",
      OUTPUT_GAIN_MIN_DB,
      OUTPUT_GAIN_MAX_DB,
    ) ?? 0;
  const oversampleFactor =
    readOptionalBoundedInteger(
      parameters.oversample_factor,
      "saturation.oversample_factor",
      OVERSAMPLE_MIN,
      OVERSAMPLE_MAX,
    ) ?? 2;

  return {
    filterChain: `volume=${formatNumber(driveDb)}dB,asoftclip=type=${curve}:threshold=1:output=${formatNumber(dbToLinear(outputGainDb))}:param=1:oversample=${oversampleFactor}`,
    effectiveParameters: {
      drive_db: driveDb,
      curve,
      output_gain_db: outputGainDb,
      oversample_factor: oversampleFactor,
    },
    nextAudio: { ...audio },
  };
}

export function buildFlangerOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("flanger", target);
  const delayMs = readBoundedNumber(
    parameters.delay_ms,
    "flanger.delay_ms",
    FLANGER_DELAY_MIN_MS,
    FLANGER_DELAY_MAX_MS,
  );
  const depthMs = readBoundedNumber(
    parameters.depth_ms,
    "flanger.depth_ms",
    FLANGER_DEPTH_MIN_MS,
    FLANGER_DEPTH_MAX_MS,
  );
  const feedbackPercent = readBoundedNumber(
    parameters.feedback_percent,
    "flanger.feedback_percent",
    FLANGER_FEEDBACK_MIN_PERCENT,
    FLANGER_FEEDBACK_MAX_PERCENT,
  );
  const mixPercent = readBoundedNumber(
    parameters.mix_percent,
    "flanger.mix_percent",
    FLANGER_MIX_MIN_PERCENT,
    FLANGER_MIX_MAX_PERCENT,
  );
  const rateHz = readBoundedNumber(
    parameters.rate_hz,
    "flanger.rate_hz",
    FLANGER_RATE_MIN_HZ,
    FLANGER_RATE_MAX_HZ,
  );
  const waveform =
    readEnum<LfoWaveform>(parameters.waveform, "flanger.waveform", ["sinusoidal", "triangular"]) ??
    "sinusoidal";

  return {
    filterChain: `flanger=delay=${formatNumber(delayMs)}:depth=${formatNumber(depthMs)}:regen=${formatNumber(feedbackPercent)}:width=${formatNumber(mixPercent)}:speed=${formatNumber(rateHz)}:shape=${waveform}:phase=25:interp=linear`,
    effectiveParameters: {
      delay_ms: delayMs,
      depth_ms: depthMs,
      feedback_percent: feedbackPercent,
      mix_percent: mixPercent,
      rate_hz: rateHz,
      waveform,
    },
    nextAudio: { ...audio },
  };
}

export function buildPhaserOperation(
  audio: AudioVersion["audio"],
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  assertFullFileTarget("phaser", target);
  const inputGainDb =
    readOptionalBoundedNumber(
      parameters.input_gain_db,
      "phaser.input_gain_db",
      PHASER_INPUT_GAIN_MIN_DB,
      PHASER_INPUT_GAIN_MAX_DB,
    ) ?? -8;
  const outputGainDb =
    readOptionalBoundedNumber(
      parameters.output_gain_db,
      "phaser.output_gain_db",
      PHASER_OUTPUT_GAIN_MIN_DB,
      PHASER_OUTPUT_GAIN_MAX_DB,
    ) ?? -2;
  const delayMs = readBoundedNumber(
    parameters.delay_ms,
    "phaser.delay_ms",
    PHASER_DELAY_MIN_MS,
    PHASER_DELAY_MAX_MS,
  );
  const decay = readBoundedNumber(
    parameters.decay,
    "phaser.decay",
    PHASER_DECAY_MIN,
    PHASER_DECAY_MAX,
  );
  const rateHz = readBoundedNumber(
    parameters.rate_hz,
    "phaser.rate_hz",
    PHASER_RATE_MIN_HZ,
    PHASER_RATE_MAX_HZ,
  );
  const waveform =
    readEnum<LfoWaveform>(parameters.waveform, "phaser.waveform", ["sinusoidal", "triangular"]) ??
    "sinusoidal";

  return {
    filterChain: `aphaser=in_gain=${formatNumber(dbToLinear(inputGainDb))}:out_gain=${formatNumber(dbToLinear(outputGainDb))}:delay=${formatNumber(delayMs)}:decay=${formatNumber(decay)}:speed=${formatNumber(rateHz)}:type=${waveform}`,
    effectiveParameters: {
      input_gain_db: inputGainDb,
      output_gain_db: outputGainDb,
      delay_ms: delayMs,
      decay,
      rate_hz: rateHz,
      waveform,
    },
    nextAudio: { ...audio },
  };
}

function assertFullFileTarget(operation: string, target?: EditTarget): void {
  if (target?.scope !== undefined && target.scope !== "full_file") {
    throw new Error(`${operation} only supports full_file targets in the current runtime.`);
  }
}

function buildClipPreservingFilterChain(audio: AudioVersion["audio"], effectChain: string): string {
  return `${effectChain},atrim=end=${formatNumber(audio.duration_seconds)},asetpts=N/SR/TB`;
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

function readBoundedInteger(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }

  const integerValue = value as number;

  if (integerValue < min || integerValue > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }

  return integerValue;
}

function readOptionalBoundedInteger(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return readBoundedInteger(value, label, min, max);
}

function readEnum<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[],
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
  }

  return value as T;
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
