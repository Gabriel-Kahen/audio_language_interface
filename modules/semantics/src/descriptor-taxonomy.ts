export const DESCRIPTOR_TAXONOMY = {
  tonalBalance: [
    "bright",
    "dark",
    "balanced",
    "slightly_harsh",
    "muddy",
    "warm",
    "airy",
    "sibilant",
  ],
  space: ["mono", "narrow", "wide"],
  dynamics: ["punchy", "controlled", "level_unstable"],
  level: ["loud", "quiet"],
  artifacts: ["clipped", "noisy", "hum_present", "clicks_present"],
} as const;

export const SUPPORTED_DESCRIPTOR_LABELS = Object.values(DESCRIPTOR_TAXONOMY).flat();

export const DESCRIPTOR_CATEGORY_BY_LABEL = Object.fromEntries(
  Object.entries(DESCRIPTOR_TAXONOMY).flatMap(([category, labels]) =>
    labels.map((label) => [label, category]),
  ),
) as Record<(typeof SUPPORTED_DESCRIPTOR_LABELS)[number], keyof typeof DESCRIPTOR_TAXONOMY>;
