export const DESCRIPTOR_TAXONOMY = {
  tonalBalance: ["bright", "dark", "balanced", "slightly_harsh"],
  space: ["mono", "narrow", "wide"],
  dynamics: ["punchy"],
  artifacts: ["clipped", "noisy"],
} as const;

export const SUPPORTED_DESCRIPTOR_LABELS = Object.values(DESCRIPTOR_TAXONOMY).flat();
