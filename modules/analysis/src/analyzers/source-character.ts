import type { SourceCharacter } from "../types.js";

interface SourceCharacterInputs {
  transientDensityPerSecond: number;
  spectralCentroidHz: number;
  stereoWidth: number;
  activeFrameRatio: number;
  pitched: boolean;
}

export function analyzeSourceCharacter(inputs: SourceCharacterInputs): SourceCharacter {
  if (inputs.transientDensityPerSecond >= 1.5 && !inputs.pitched) {
    return {
      primary_class: "drum_loop",
      pitched: false,
      confidence: 0.85,
    };
  }

  if (inputs.pitched && inputs.transientDensityPerSecond < 1) {
    return {
      primary_class: "tonal_phrase",
      pitched: true,
      confidence: 0.78,
    };
  }

  if (
    inputs.activeFrameRatio < 0.5 &&
    inputs.spectralCentroidHz < 1500 &&
    inputs.stereoWidth > 0.2
  ) {
    return {
      primary_class: "ambience",
      pitched: false,
      confidence: 0.7,
    };
  }

  return {
    primary_class: "mixed_program",
    pitched: inputs.pitched,
    confidence: 0.55,
  };
}

export function detectPitchedSignal(samples: Float32Array, sampleRateHz: number): boolean {
  const minimumLag = Math.floor(sampleRateHz / 1000);
  const maximumLag = Math.floor(sampleRateHz / 80);
  const window = samples.slice(0, Math.min(samples.length, 4096));

  let bestScore = 0;
  for (let lag = minimumLag; lag <= maximumLag && lag < window.length / 2; lag += 1) {
    let numerator = 0;
    let denominatorA = 0;
    let denominatorB = 0;

    for (let index = 0; index + lag < window.length; index += 1) {
      const a = window[index] ?? 0;
      const b = window[index + lag] ?? 0;
      numerator += a * b;
      denominatorA += a * a;
      denominatorB += b * b;
    }

    const denominator = Math.sqrt(denominatorA * denominatorB);
    if (denominator === 0) {
      continue;
    }

    const score = numerator / denominator;
    if (score > bestScore) {
      bestScore = score;
    }
  }

  return bestScore > 0.65;
}
