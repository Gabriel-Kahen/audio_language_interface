import type { AnalysisReport, ParsedEditObjectives, SemanticProfile } from "./types.js";

export function buildVerificationTargets(
  objectives: ParsedEditObjectives,
  analysisReport: AnalysisReport,
  semanticProfile: SemanticProfile,
): string[] {
  const targets: string[] = [];
  const harshnessAnnotation = analysisReport.annotations?.find(
    (annotation) => annotation.kind === "harshness",
  );
  const brightDescriptor = semanticProfile.descriptors.find(
    (descriptor) => descriptor.label === "bright",
  );

  if (objectives.wants_less_harsh && harshnessAnnotation?.bands_hz) {
    targets.push(
      `reduced energy in the ${formatBand(harshnessAnnotation.bands_hz[0])} to ${formatBand(harshnessAnnotation.bands_hz[1])} region`,
    );
  }

  if (objectives.wants_darker || (objectives.wants_less_harsh && brightDescriptor)) {
    targets.push("slightly reduced perceived brightness without obvious dulling");
  }

  if (objectives.wants_brighter) {
    targets.push("slightly increased upper-band presence without introducing harshness");
  }

  if (objectives.wants_less_muddy) {
    targets.push("reduced low-mid buildup around 200 Hz to 400 Hz");
  }

  if (objectives.wants_more_warmth) {
    targets.push("slightly increased low-band weight without masking clarity");
  }

  if (objectives.wants_remove_rumble) {
    targets.push("reduced sub-bass energy below the chosen high-pass cutoff");
  }

  if (objectives.wants_louder) {
    targets.push("higher output level while staying within available peak headroom");
  }

  if (objectives.wants_quieter) {
    targets.push("lower output level without changing tonal balance");
  }

  if (objectives.preserve_punch) {
    targets.push(
      `no material loss of crest factor from ${analysisReport.measurements.dynamics.crest_factor_db.toFixed(1)} dB baseline`,
    );
  }

  return dedupe(targets);
}

function formatBand(valueHz: number): string {
  return valueHz >= 1000
    ? `${Number((valueHz / 1000).toFixed(1))} kHz`
    : `${Math.round(valueHz)} Hz`;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
