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
