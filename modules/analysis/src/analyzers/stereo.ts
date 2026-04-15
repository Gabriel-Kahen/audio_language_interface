import type { NormalizedAudioData } from "../types.js";
import { correlation, rms, toDecibels } from "../utils/math.js";

export function analyzeStereo(audioData: NormalizedAudioData) {
  if (audioData.channels.length < 2) {
    return {
      width: 0,
      correlation: 1,
      balance_db: 0,
    };
  }

  const [left, right] = audioData.channels as [Float32Array, Float32Array, ...Float32Array[]];
  const leftRms = rms(left);
  const rightRms = rms(right);
  const mid = new Float32Array(audioData.frameCount);
  const side = new Float32Array(audioData.frameCount);

  for (let index = 0; index < audioData.frameCount; index += 1) {
    const leftSample = left[index] ?? 0;
    const rightSample = right[index] ?? 0;
    mid[index] = (leftSample + rightSample) * 0.5;
    side[index] = (leftSample - rightSample) * 0.5;
  }

  return {
    width: rms(side) / Math.max(rms(mid) + rms(side), 1e-12),
    correlation: correlation(left, right),
    balance_db: toDecibels(leftRms) - toDecibels(rightRms),
  };
}
