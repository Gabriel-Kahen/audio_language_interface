import type {
  AnalysisReport,
  ParsedEditObjectives,
  SemanticProfile,
  VerificationTarget,
} from "./types.js";

export function buildVerificationTargets(
  objectives: ParsedEditObjectives,
  analysisReport: AnalysisReport,
  _semanticProfile: SemanticProfile,
): VerificationTarget[] {
  const targets: VerificationTarget[] = [];
  const harshnessAnnotation = analysisReport.annotations?.find(
    (annotation) => annotation.kind === "harshness",
  );

  if (objectives.wants_less_harsh) {
    targets.push({
      target_id: "target_reduce_harshness_high_band",
      goal: "reduce upper-mid harshness",
      label: "reduce high-band energy in the harshness region",
      kind: "analysis_metric",
      comparison: "decrease_by",
      metric: "spectral_balance.high_band_db",
      threshold: thresholdByIntensity(objectives.intensity, 0.4, 1, 1.4),
      ...(harshnessAnnotation?.bands_hz === undefined
        ? {}
        : {
            target: {
              scope: "frequency_region",
              bands_hz: harshnessAnnotation.bands_hz,
            } as const,
          }),
      rationale: "Harshness should show up as lower upper-mid or high-band energy after the edit.",
    });
    targets.push({
      target_id: "target_reduce_harshness_centroid",
      goal: "reduce upper-mid harshness",
      label: "reduce spectral centroid enough to soften the upper-mid emphasis",
      kind: "analysis_metric",
      comparison: "decrease_by",
      metric: "spectral_balance.spectral_centroid_hz",
      threshold: thresholdByIntensity(objectives.intensity, 30, 80, 120),
      rationale:
        "A small centroid drop helps verify the source actually moved away from harshness.",
    });
  }

  if (objectives.wants_darker) {
    targets.push({
      target_id: "target_darker_brightness_tilt",
      goal: "tilt the overall balance slightly darker",
      label: "reduce overall brightness tilt modestly",
      kind: "analysis_metric",
      comparison: "decrease_by",
      metric: "spectral_balance.brightness_tilt_db",
      threshold: thresholdByIntensity(objectives.intensity, 0.4, 0.8, 1.2),
      rationale: "A darker tonal rebalance should lower the measured high-versus-low tilt.",
    });
  }

  if (objectives.wants_brighter) {
    targets.push({
      target_id: "target_brighter_brightness_tilt",
      goal: "tilt the overall balance slightly brighter",
      label: "increase overall brightness tilt modestly",
      kind: "analysis_metric",
      comparison: "increase_by",
      metric: "spectral_balance.brightness_tilt_db",
      threshold: thresholdByIntensity(objectives.intensity, 0.4, 0.8, 1.2),
      rationale: "A brighter tonal rebalance should increase the measured high-versus-low tilt.",
    });
  }

  if (objectives.wants_more_air) {
    targets.push({
      target_id: "target_more_air_high_band",
      goal: "add a little upper-band air",
      label: "raise upper-band energy slightly",
      kind: "analysis_metric",
      comparison: "increase_by",
      metric: "spectral_balance.high_band_db",
      threshold: thresholdByIntensity(objectives.intensity, 0.3, 0.75, 1.2),
      rationale: "Air should appear as a modest increase in high-band energy.",
    });
    targets.push({
      target_id: "target_more_air_no_sibilance_regression",
      goal: "add a little upper-band air",
      label: "avoid turning added air into sibilance",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "increased_sibilance",
    });
  }

  if (objectives.wants_less_muddy) {
    targets.push({
      target_id: "target_less_muddy_mid_band",
      goal: "trim excess low-mid weight",
      label: "reduce mid-band buildup modestly",
      kind: "analysis_metric",
      comparison: "decrease_by",
      metric: "spectral_balance.mid_band_db",
      threshold: thresholdByIntensity(objectives.intensity, 0.3, 0.75, 1.2),
      rationale: "Less muddiness should reduce low-mid or mid-band buildup.",
    });
    targets.push({
      target_id: "target_less_muddy_no_lost_air_regression",
      goal: "trim excess low-mid weight",
      label: "avoid taking too much upper openness out with the cleanup",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "lost_air",
    });
  }

  if (objectives.wants_more_warmth) {
    targets.push({
      target_id: "target_more_warmth_low_band",
      goal: "add a little low-band warmth",
      label: "increase low-band weight slightly",
      kind: "analysis_metric",
      comparison: "increase_by",
      metric: "spectral_balance.low_band_db",
      threshold: thresholdByIntensity(objectives.intensity, 0.3, 0.75, 1.2),
      rationale: "Warmth should show up as a modest increase in low-band weight.",
    });
    targets.push({
      target_id: "target_more_warmth_no_added_muddiness",
      goal: "add a little low-band warmth",
      label: "avoid crossing over into muddiness",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "added_muddiness",
    });
  }

  if (objectives.wants_remove_rumble) {
    targets.push({
      target_id: "target_remove_rumble_low_band",
      goal: "reduce sub-bass rumble",
      label: "reduce sub-bass energy below the chosen cutoff",
      kind: "analysis_metric",
      comparison: "decrease_by",
      metric: "spectral_balance.low_band_db",
      threshold: thresholdByIntensity(objectives.intensity, 1, 2, 3),
      target: {
        scope: "frequency_region",
        bands_hz: [0, 120],
      },
      rationale: "Rumble reduction should be visible as a stronger low-band decrease.",
    });
  }

  if (objectives.wants_more_controlled_dynamics) {
    targets.push({
      target_id: "target_control_dynamics_range",
      goal: "make dynamics more controlled without over-compressing",
      label: "reduce dynamic range slightly",
      kind: "analysis_metric",
      comparison: "decrease_by",
      metric: "dynamics.dynamic_range_db",
      threshold: thresholdByIntensity(objectives.intensity, 0.3, 0.8, 1.2),
      rationale: "Controlled dynamics should trim range slightly without flattening the source.",
    });
    targets.push({
      target_id: "target_control_dynamics_no_overcompression",
      goal: "make dynamics more controlled without over-compressing",
      label: "avoid over-compression side effects",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "over_compression",
    });
  }

  if (objectives.wants_denoise) {
    targets.push({
      target_id: "target_reduce_noise_floor",
      goal: "reduce steady background noise conservatively",
      label: "lower the measured noise floor",
      kind: "analysis_metric",
      comparison: "decrease_by",
      metric: "artifacts.noise_floor_dbfs",
      threshold: thresholdByIntensity(objectives.intensity, 2, 4, 6),
      rationale: "Conservative denoise should reduce noise-floor measurements without artifacts.",
    });
    targets.push({
      target_id: "target_reduce_noise_no_artifacts",
      goal: "reduce steady background noise conservatively",
      label: "avoid denoise artifact regressions",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "denoise_artifacts",
    });
  }

  if (objectives.wants_tame_sibilance) {
    targets.push({
      target_id: "target_reduce_sibilance_presence",
      goal: "tame sibilant bursts conservatively",
      label: "reduce presence-band energy modestly",
      kind: "analysis_metric",
      comparison: "decrease_by",
      metric: "spectral_balance.presence_band_db",
      threshold: thresholdByIntensity(objectives.intensity, 0.4, 0.75, 1.2),
      rationale: "De-essing should reduce presence-band emphasis around sibilant bursts.",
    });
    targets.push({
      target_id: "target_reduce_sibilance_harshness_ratio",
      goal: "tame sibilant bursts conservatively",
      label: "reduce harshness ratio slightly",
      kind: "analysis_metric",
      comparison: "decrease_by",
      metric: "spectral_balance.harshness_ratio_db",
      threshold: thresholdByIntensity(objectives.intensity, 0.2, 0.5, 0.8),
      rationale: "Sibilance reduction should also lower the harshness ratio measurement.",
    });
  }

  if (objectives.wants_remove_clicks) {
    targets.push({
      target_id: "target_reduce_click_proxy",
      goal: "repair short clicks and pops conservatively",
      label: "reduce clipped-sample spike activity",
      kind: "analysis_metric",
      comparison: "decrease_by",
      metric: "artifacts.clipped_sample_count",
      threshold: thresholdByIntensity(objectives.intensity, 4, 8, 16),
      rationale:
        "Direct click counting is not available yet, so clipped-sample activity is the proxy.",
    });
    targets.push({
      target_id: "target_reduce_click_proxy_regression",
      goal: "repair short clicks and pops conservatively",
      label: "avoid increasing impulsive spike artifacts",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "increased_click_proxy",
    });
  }

  if (objectives.wants_remove_hum) {
    targets.push({
      target_id: "target_reduce_hum_low_band",
      goal: "reduce mains hum and harmonic buzz conservatively",
      label: `reduce low-frequency contamination around ${objectives.hum_frequency_hz?.toFixed(0)} Hz`,
      kind: "analysis_metric",
      comparison: "decrease_by",
      metric: "spectral_balance.low_band_db",
      threshold: thresholdByIntensity(objectives.intensity, 1.5, 2.5, 4),
      ...(objectives.hum_frequency_hz === undefined
        ? {}
        : {
            target: {
              scope: "frequency_region",
              bands_hz: [
                Math.max(0, objectives.hum_frequency_hz - 5),
                objectives.hum_frequency_hz + 5,
              ],
            } as const,
          }),
      rationale:
        "The baseline verifier uses low-band energy as a conservative hum proxy until direct hum analysis exists.",
    });
    targets.push({
      target_id: "target_reduce_hum_no_proxy_regression",
      goal: "reduce mains hum and harmonic buzz conservatively",
      label: "avoid increasing the hum proxy while cleaning",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "increased_hum_proxy",
    });
  }

  if (objectives.wants_peak_control) {
    targets.push({
      target_id: "target_peak_control_true_peak",
      goal: "control peak excursions conservatively",
      label: "keep true peak at or below -1 dBTP",
      kind: "analysis_metric",
      comparison: "at_most",
      metric: "levels.true_peak_dbtp",
      threshold: -1,
      tolerance: 0.25,
      rationale: "Peak control should keep the candidate below the agreed true-peak ceiling.",
    });
    targets.push({
      target_id: "target_peak_control_no_regression",
      goal: "control peak excursions conservatively",
      label: "avoid a peak-control regression",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "peak_control_regression",
    });
  }

  if (objectives.wants_wider) {
    targets.push({
      target_id: "target_wider_stereo_width",
      goal: "slightly increase stereo width",
      label: "increase stereo width slightly",
      kind: "analysis_metric",
      comparison: "increase_by",
      metric: "stereo.width",
      threshold: thresholdByIntensity(objectives.intensity, 0.03, 0.06, 0.1),
      rationale: "A wider image should raise the stereo width measurement modestly.",
    });
    targets.push({
      target_id: "target_wider_no_instability",
      goal: "slightly increase stereo width",
      label: "avoid stereo-instability regressions while widening",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "stereo_instability",
    });
  }

  if (objectives.wants_narrower) {
    targets.push({
      target_id: "target_narrower_stereo_width",
      goal: "slightly reduce stereo width",
      label: "reduce stereo width slightly",
      kind: "analysis_metric",
      comparison: "decrease_by",
      metric: "stereo.width",
      threshold: thresholdByIntensity(objectives.intensity, 0.03, 0.06, 0.1),
      rationale: "A narrower image should lower the stereo width measurement modestly.",
    });
    targets.push({
      target_id: "target_narrower_no_collapse",
      goal: "slightly reduce stereo width",
      label: "avoid collapsing the image too far",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "stereo_collapse",
    });
  }

  if (objectives.wants_louder) {
    targets.push({
      target_id: "target_louder_integrated_lufs",
      goal: "increase output level conservatively",
      label: "increase integrated loudness",
      kind: "analysis_metric",
      comparison: "increase_by",
      metric: "levels.integrated_lufs",
      threshold: thresholdByIntensity(objectives.intensity, 0.8, 1.5, 2.5),
      rationale: "A louder result should move integrated loudness upward.",
    });
    targets.push({
      target_id: "target_louder_no_headroom_loss",
      goal: "increase output level conservatively",
      label: "avoid loudness-side headroom loss",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "loudness_headroom_loss",
    });
  }

  if (objectives.wants_more_even_level) {
    const targetIntegratedLufs =
      analysisReport.measurements.levels.integrated_lufs +
      (objectives.wants_louder
        ? objectives.intensity === "subtle"
          ? 1
          : objectives.intensity === "strong"
            ? 2
            : 1.5
        : objectives.intensity === "strong"
          ? 1
          : 0.5);

    targets.push({
      target_id: "target_normalize_integrated_lufs",
      goal: "normalize overall loudness conservatively",
      label: "move integrated loudness toward the requested target",
      kind: "analysis_metric",
      comparison: "within",
      metric: "levels.integrated_lufs",
      threshold: Number(targetIntegratedLufs.toFixed(1)),
      tolerance: 0.5,
      rationale: "Loudness normalization is judged by proximity to the requested LUFS target.",
    });
    targets.push({
      target_id: "target_normalize_true_peak_ceiling",
      goal: "normalize overall loudness conservatively",
      label: "keep true peak at or below -1 dBTP while normalizing",
      kind: "analysis_metric",
      comparison: "at_most",
      metric: "levels.true_peak_dbtp",
      threshold: -1,
      tolerance: 0.25,
      rationale: "Normalization should preserve the explicit true-peak ceiling.",
    });
    targets.push({
      target_id: "target_normalize_no_headroom_loss",
      goal: "normalize overall loudness conservatively",
      label: "avoid loudness-normalization side effects",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "loudness_headroom_loss",
    });
  }

  if (objectives.wants_quieter) {
    targets.push({
      target_id: "target_quieter_integrated_lufs",
      goal: "reduce output level conservatively",
      label: "reduce integrated loudness modestly",
      kind: "analysis_metric",
      comparison: "decrease_by",
      metric: "levels.integrated_lufs",
      threshold: thresholdByIntensity(objectives.intensity, 0.8, 1.5, 2.5),
      rationale: "A quieter result should move integrated loudness downward.",
    });
  }

  if (objectives.preserve_punch) {
    targets.push({
      target_id: "target_preserve_punch_crest_factor",
      goal: "preserve transient impact",
      label: "keep crest factor close to the baseline",
      kind: "analysis_metric",
      comparison: "at_least",
      metric: "dynamics.crest_factor_db",
      threshold: Number((analysisReport.measurements.dynamics.crest_factor_db - 0.5).toFixed(2)),
      tolerance: 0.25,
      rationale: "Preserved punch should keep crest factor near the pre-edit baseline.",
    });
    targets.push({
      target_id: "target_preserve_punch_no_regression",
      goal: "preserve transient impact",
      label: "avoid lost-punch regressions",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "lost_punch",
    });
  }

  return dedupeByTargetId(targets);
}

function thresholdByIntensity(
  intensity: ParsedEditObjectives["intensity"],
  subtle: number,
  normal: number,
  strong: number,
): number {
  if (intensity === "subtle") {
    return subtle;
  }

  if (intensity === "strong") {
    return strong;
  }

  return normal;
}

function dedupeByTargetId(values: VerificationTarget[]): VerificationTarget[] {
  return [...new Map(values.map((value) => [value.target_id, value])).values()];
}
