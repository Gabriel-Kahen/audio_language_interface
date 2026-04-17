import {
  buildChannelSwapOperation,
  buildMonoSumOperation,
  buildReverseOperation,
  buildStereoBalanceCorrectionOperation,
} from "./operations/channel-utilities.js";
import { buildCompressorOperation, buildLimiterOperation } from "./operations/dynamics.js";
import {
  buildHighPassFilterOperation,
  buildLowPassFilterOperation,
  buildParametricEqOperation,
} from "./operations/eq.js";
import { buildGainOperation, buildNormalizeOperation } from "./operations/gain.js";
import { buildPitchShiftOperation } from "./operations/pitch.js";
import { buildDenoiseOperation, buildStereoWidthOperation } from "./operations/spatial-cleanup.js";
import { buildTimeStretchOperation } from "./operations/time-stretch.js";
import { buildFadeOperation, buildTrimOperation } from "./operations/trim-fade.js";
import type { AudioVersion, EditTarget, OperationBuildResult, OperationName } from "./types.js";

/**
 * Validates and normalizes one supported transform into an inspectable FFmpeg
 * filter chain plus updated output audio metadata.
 */
export function buildOperation(
  audio: AudioVersion["audio"],
  operation: OperationName,
  parameters: Record<string, unknown>,
  target?: EditTarget,
): OperationBuildResult {
  switch (operation) {
    case "gain":
      return buildGainOperation(audio, parameters, target);
    case "normalize":
      return buildNormalizeOperation(audio, parameters, target);
    case "trim":
      return buildTrimOperation(audio, parameters, target);
    case "fade":
      return buildFadeOperation(audio, parameters, target);
    case "pitch_shift":
      return buildPitchShiftOperation(audio, parameters, target);
    case "parametric_eq":
      return buildParametricEqOperation(audio, parameters, target);
    case "high_pass_filter":
      return buildHighPassFilterOperation(audio, parameters, target);
    case "low_pass_filter":
      return buildLowPassFilterOperation(audio, parameters, target);
    case "compressor":
      return buildCompressorOperation(audio, parameters, target);
    case "limiter":
      return buildLimiterOperation(audio, parameters, target);
    case "time_stretch":
      return buildTimeStretchOperation(audio, parameters, target);
    case "reverse":
      return buildReverseOperation(audio, parameters, target);
    case "mono_sum":
      return buildMonoSumOperation(audio, parameters, target);
    case "channel_swap":
      return buildChannelSwapOperation(audio, parameters, target);
    case "stereo_balance_correction":
      return buildStereoBalanceCorrectionOperation(audio, parameters, target);
    case "stereo_width":
      return buildStereoWidthOperation(audio, parameters, target);
    case "denoise":
      return buildDenoiseOperation(audio, parameters, target);
    default:
      throw new Error(`Unsupported transform operation: ${operation satisfies never}`);
  }
}
