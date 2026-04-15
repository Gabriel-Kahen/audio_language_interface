import type { ParsedEditObjectives } from "./types.js";

const MAX_TOTAL_FADE_COVERAGE_RATIO = 0.5;

export function resolveEqGainDb(
  objectives: ParsedEditObjectives,
  direction: "cut" | "boost",
): number {
  const magnitude =
    objectives.intensity === "subtle" ? 1.5 : objectives.intensity === "strong" ? 3 : 2;

  return direction === "cut" ? -magnitude : magnitude;
}

export function resolveGainStepDb(
  objectives: ParsedEditObjectives,
  availableHeadroomDb: number,
): number {
  const requestedGain =
    objectives.intensity === "subtle" ? 1 : objectives.intensity === "strong" ? 3 : 2;

  return Number(Math.max(0, Math.min(requestedGain, availableHeadroomDb, 3)).toFixed(2));
}

export function buildEqSafetyLimits(objectives: ParsedEditObjectives): string[] {
  const maxBandAdjustment = objectives.preserve_punch || objectives.intensity !== "strong" ? 3 : 4;

  return [
    `do not exceed ${maxBandAdjustment} dB adjustment in a single EQ band`,
    "keep the edit broad and reversible rather than surgical",
  ];
}

export function buildGainSafetyLimits(): string[] {
  return [
    "do not increase output above -1 dB true peak based on available analysis headroom",
    "avoid large loudness jumps in a single step",
  ];
}

export function buildTrimSafetyLimits(): string[] {
  return [
    "preserve only the explicitly requested time range",
    "do not infer additional cut points beyond the user request",
  ];
}

export function buildFadeSafetyLimits(): string[] {
  return [
    "keep fades limited to the explicitly requested duration",
    `keep total fade coverage at or below ${MAX_TOTAL_FADE_COVERAGE_RATIO * 100}% of the available duration`,
    "do not introduce crossfades or envelope shaping beyond simple boundary fades",
  ];
}

export function assertValidFadeSpans(
  fadeInSeconds: number | undefined,
  fadeOutSeconds: number | undefined,
  availableDurationSeconds: number,
): void {
  const totalFadeSeconds = (fadeInSeconds ?? 0) + (fadeOutSeconds ?? 0);

  if (totalFadeSeconds > availableDurationSeconds) {
    throw new Error(
      "Requested fade durations must not overlap within the available AudioVersion duration.",
    );
  }

  if (totalFadeSeconds > availableDurationSeconds * MAX_TOTAL_FADE_COVERAGE_RATIO) {
    throw new Error(
      "Requested fade durations are too aggressive for the available AudioVersion duration.",
    );
  }
}

export function buildFilterSafetyLimits(): string[] {
  return [
    "keep cutoff conservative to avoid obvious tonal loss",
    "apply only to the full file in the initial baseline planner",
  ];
}
