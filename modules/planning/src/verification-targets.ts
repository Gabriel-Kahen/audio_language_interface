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
    targets.push("a modestly brighter high-vs-low spectral balance");
  }

  if (objectives.wants_more_air) {
    targets.push("slightly higher upper-band energy without brittle peaks");
  }

  if (objectives.wants_less_muddy) {
    targets.push("less low-mid buildup below roughly 250 Hz");
  }

  if (objectives.wants_more_warmth) {
    targets.push("slightly increased low-band weight without masking clarity");
  }

  if (objectives.wants_remove_rumble) {
    targets.push("reduced sub-bass energy below the chosen high-pass cutoff");
  }

  if (objectives.wants_more_controlled_dynamics) {
    targets.push("slightly reduced dynamic range without obvious pumping");
  }

  if (objectives.wants_denoise) {
    targets.push("lower measured noise floor without obvious denoise artifacts");
  }

  if (objectives.wants_tame_sibilance) {
    targets.push("less aggressive sibilant bursts around the upper-presence band");
  }

  if (objectives.wants_remove_clicks) {
    targets.push("fewer short impulsive clicks without softened transients");
  }

  if (objectives.wants_remove_hum) {
    if (objectives.hum_frequency_hz !== undefined) {
      targets.push(
        `lower narrowband energy around ${objectives.hum_frequency_hz.toFixed(0)} Hz and its harmonics`,
      );
    }
  }

  if (objectives.wants_peak_control) {
    targets.push("lower peak excursions while keeping the output ceiling near -1 dB true peak");
  }

  if (objectives.wants_wider) {
    targets.push("small increase in stereo width without poorer mono compatibility");
  }

  if (objectives.wants_narrower) {
    targets.push("small decrease in stereo width while keeping the image balanced");
  }

  if (objectives.wants_louder) {
    targets.push("higher output level while staying within available peak headroom");
  }

  if (objectives.wants_more_even_level) {
    targets.push(
      "integrated loudness moved toward the requested target while keeping true peak at or below -1 dBTP",
    );
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
