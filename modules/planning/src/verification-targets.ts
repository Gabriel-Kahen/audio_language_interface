import type { PitchCenterEstimate } from "@audio-language-interface/analysis";
import type {
  AnalysisReport,
  AudioVersion,
  ParsedEditObjectives,
  SemanticProfile,
  VerificationTarget,
} from "./types.js";

export function buildVerificationTargets(
  objectives: ParsedEditObjectives,
  analysisReport: AnalysisReport,
  semanticProfile: SemanticProfile,
  pitchEstimate: PitchCenterEstimate | undefined,
  audioVersion: AudioVersion,
): VerificationTarget[] {
  const targets: VerificationTarget[] = [];
  const useControlledLoudnessTargets = shouldUseControlledLoudnessTargets(objectives);
  const harshnessAnnotation = analysisReport.annotations?.find(
    (annotation) => annotation.kind === "harshness",
  );
  const humAnnotation = findStrongestAnnotationByKinds(analysisReport, [
    "hum",
    "hum_tone",
    "mains_hum",
  ]);
  const clickAnnotation = findStrongestAnnotationByKinds(analysisReport, [
    "click",
    "clicks",
    "click_pop",
    "impulse_click",
    "pop",
    "pops",
  ]);
  const hasHumEvidence =
    hasSemanticDescriptor(semanticProfile, "hum_present", 0.6) ||
    (humAnnotation?.severity ?? 0) >= 0.4;
  const hasClickEvidence =
    hasSemanticDescriptor(semanticProfile, "clicks_present", 0.6) ||
    (clickAnnotation?.severity ?? 0) >= 0.38;
  const leadingSilenceSeconds = getLeadingSilenceSeconds(analysisReport);
  const trailingSilenceSeconds = getTrailingSilenceSeconds(analysisReport);
  const durationAfterPreStretchEdits = resolveDurationAfterPreStretchEdits(
    objectives,
    audioVersion,
    leadingSilenceSeconds,
    trailingSilenceSeconds,
  );

  if (objectives.trim_range !== undefined) {
    targets.push({
      target_id: "target_trim_explicit_duration",
      goal: "trim the file to the explicitly requested time range",
      label: "match the explicit trim range duration",
      kind: "analysis_metric",
      comparison: "within",
      metric: "derived.duration_seconds",
      threshold: Number(
        (objectives.trim_range.end_seconds - objectives.trim_range.start_seconds).toFixed(3),
      ),
      tolerance: 0.02,
      rationale:
        "Explicit trim-point requests should produce an output duration matching the requested range.",
    });
  }

  if (objectives.fade_in_seconds !== undefined) {
    targets.push({
      target_id: `target_fade_in_${Math.round(objectives.fade_in_seconds * 1000)}ms_envelope`,
      goal: "smooth file boundaries with explicit fades",
      label: "attenuate the beginning of the requested fade-in span",
      kind: "analysis_metric",
      comparison: "at_most",
      metric: "derived.fade_in_boundary_ratio",
      threshold: 0.65,
      tolerance: 0.2,
      rationale: `The requested fade-in span is ${objectives.fade_in_seconds} seconds; the beginning should be quieter than the end of that span.`,
    });
  }

  if (objectives.fade_out_seconds !== undefined) {
    targets.push({
      target_id: `target_fade_out_${Math.round(objectives.fade_out_seconds * 1000)}ms_envelope`,
      goal: "smooth file boundaries with explicit fades",
      label: "attenuate the end of the requested fade-out span",
      kind: "analysis_metric",
      comparison: "at_most",
      metric: "derived.fade_out_boundary_ratio",
      threshold: 0.65,
      tolerance: 0.2,
      rationale: `The requested fade-out span is ${objectives.fade_out_seconds} seconds; the end should be quieter than the start of that span.`,
    });
  }

  if (objectives.wants_trim_silence) {
    if (objectives.trim_leading_silence) {
      targets.push({
        target_id: "target_trim_leading_silence",
        goal: "trim leading and trailing boundary silence conservatively",
        label: "reduce leading boundary silence to a small residual window",
        kind: "analysis_metric",
        comparison: "at_most",
        metric: "derived.leading_silence_seconds",
        threshold: 0.02,
        tolerance: 0.015,
        rationale:
          "Silence trimming should leave little or no measurable silence at the start of the file.",
      });
    }

    if (objectives.trim_trailing_silence) {
      targets.push({
        target_id: "target_trim_trailing_silence",
        goal: "trim leading and trailing boundary silence conservatively",
        label: "reduce trailing boundary silence to a small residual window",
        kind: "analysis_metric",
        comparison: "at_most",
        metric: "derived.trailing_silence_seconds",
        threshold: 0.02,
        tolerance: 0.015,
        rationale:
          "Silence trimming should leave little or no measurable silence at the end of the file.",
      });
    }

    const trimmedBoundarySilence = leadingSilenceSeconds + trailingSilenceSeconds;
    if (trimmedBoundarySilence > 0.03) {
      targets.push({
        target_id: "target_trim_silence_duration_reduction",
        goal: "trim leading and trailing boundary silence conservatively",
        label: "reduce overall duration when measurable boundary silence exists",
        kind: "analysis_metric",
        comparison: "decrease_by",
        metric: "derived.duration_seconds",
        threshold: Number(Math.min(trimmedBoundarySilence * 0.5, 0.3).toFixed(3)),
        rationale:
          "When explicit edge silence is present, trimming it should shorten the file measurably without forcing an aggressive reduction target.",
      });
    }
  }

  if (objectives.wants_speed_up || objectives.wants_slow_down) {
    const stretchRatio = objectives.stretch_ratio ?? 1;
    const expectedDurationSeconds = Number(
      (durationAfterPreStretchEdits * stretchRatio).toFixed(3),
    );

    targets.push({
      target_id: "target_time_stretch_duration",
      goal: objectives.wants_speed_up
        ? "shorten the clip duration while preserving pitch"
        : "lengthen the clip duration while preserving pitch",
      label: objectives.wants_speed_up
        ? "shorten clip duration by the requested stretch ratio"
        : "lengthen clip duration by the requested stretch ratio",
      kind: "analysis_metric",
      comparison: "within",
      metric: "derived.duration_seconds",
      threshold: expectedDurationSeconds,
      tolerance: 0.02,
      rationale:
        "Time stretching should move duration toward the requested ratio within a small timing tolerance.",
    });

    if (pitchEstimate?.frequency_hz !== undefined) {
      targets.push({
        target_id: "target_time_stretch_pitch_preservation",
        goal: objectives.wants_speed_up
          ? "shorten the clip duration while preserving pitch"
          : "lengthen the clip duration while preserving pitch",
        label: "preserve the source pitch center while changing duration",
        kind: "analysis_metric",
        comparison: "within",
        metric: "derived.pitch_center_hz",
        threshold: Number(pitchEstimate.frequency_hz.toFixed(2)),
        tolerance: Number(Math.max(6, pitchEstimate.frequency_hz * 0.03).toFixed(2)),
        rationale:
          "Pitch-preserving time stretch should keep a stable pitch center close to the baseline estimate on pitched material.",
      });
    }
  }

  if (objectives.wants_pitch_shift && objectives.pitch_shift_semitones !== undefined) {
    const targetPitchHz =
      pitchEstimate?.frequency_hz === undefined
        ? undefined
        : Number(
            (pitchEstimate.frequency_hz * 2 ** (objectives.pitch_shift_semitones / 12)).toFixed(2),
          );

    if (targetPitchHz !== undefined) {
      targets.push({
        target_id: "target_pitch_shift_center",
        goal: `${objectives.pitch_shift_semitones > 0 ? "raise" : "lower"} the pitch by ${Math.abs(
          objectives.pitch_shift_semitones,
        )} semitones`,
        label: "move the pitch center toward the requested semitone shift",
        kind: "analysis_metric",
        comparison: "within",
        metric: "derived.pitch_center_hz",
        threshold: targetPitchHz,
        tolerance: Number(Math.max(8, targetPitchHz * 0.04).toFixed(2)),
        rationale:
          "Pitch-shift verification should anchor on the baseline pitch-center estimate when stable voiced evidence exists.",
      });
    }

    targets.push({
      target_id: "target_pitch_shift_duration_guard",
      goal: `${objectives.pitch_shift_semitones > 0 ? "raise" : "lower"} the pitch by ${Math.abs(
        objectives.pitch_shift_semitones,
      )} semitones`,
      label: "keep duration close to the original after pitch shifting",
      kind: "analysis_metric",
      comparison: "within",
      metric: "derived.duration_seconds",
      threshold: resolveExpectedFinalDurationSeconds(
        objectives,
        audioVersion,
        leadingSilenceSeconds,
        trailingSilenceSeconds,
      ),
      tolerance: 0.02,
      rationale:
        "The baseline pitch-shift path is intended to preserve duration closely while moving pitch.",
    });
  }

  if (objectives.wants_less_harsh) {
    if (!objectives.wants_louder) {
      targets.push({
        target_id: "target_reduce_harshness_presence_band",
        goal: "reduce upper-mid harshness",
        label: "reduce upper-presence energy in the harshness region",
        kind: "analysis_metric",
        comparison: "decrease_by",
        metric: "spectral_balance.presence_band_db",
        threshold: thresholdByIntensity(objectives.intensity, 0.4, 0.8, 1.1),
        ...(harshnessAnnotation?.bands_hz === undefined
          ? {}
          : {
              target: {
                scope: "frequency_region",
                bands_hz: harshnessAnnotation.bands_hz,
              } as const,
            }),
        rationale:
          "Harshness should show up as lower upper-presence energy after the edit when the request does not also ask for a broad loudness lift.",
      });
    }
    targets.push({
      target_id: "target_reduce_harshness_ratio",
      goal: "reduce upper-mid harshness",
      label: "reduce the harshness ratio enough to soften upper-mid emphasis",
      kind: "analysis_metric",
      comparison: "decrease_by",
      metric: "spectral_balance.harshness_ratio_db",
      threshold: thresholdByIntensity(objectives.intensity, 0.25, 0.5, 0.8),
      rationale:
        "Harshness ratio tracks concentrated upper-mid bite more directly than broad centroid movement.",
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
      threshold: thresholdByIntensity(objectives.intensity, 0.15, 0.2, 0.35),
      rationale:
        "Less muddiness should reduce low-mid or mid-band buildup; this broad metric is intentionally low-threshold because the deterministic edit is a localized low-mid bell cut.",
    });
    if (!objectives.wants_darker) {
      targets.push({
        target_id: "target_less_muddy_no_lost_air_regression",
        goal: "trim excess low-mid weight",
        label: "avoid taking too much upper openness out with the cleanup",
        kind: "regression_guard",
        comparison: "absent",
        regression_kind: "lost_air",
      });
    }
  }

  if (objectives.wants_more_warmth) {
    if (objectives.wants_quieter) {
      targets.push({
        target_id: "target_more_warmth_relative_tilt",
        goal: "add a little low-band warmth",
        label: "shift the tonal tilt warmer while reducing level",
        kind: "analysis_metric",
        comparison: "decrease_by",
        metric: "spectral_balance.brightness_tilt_db",
        threshold: thresholdByIntensity(objectives.intensity, 0.25, 0.5, 0.9),
        rationale:
          "When a warmth request is paired with a quieter level move, warmth should be verified as relative low-band emphasis rather than an absolute low-band gain increase.",
      });
    } else {
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
    }
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

  if (useControlledLoudnessTargets) {
    targets.push({
      target_id: "target_controlled_loudness_range",
      goal: "make dynamics more controlled without over-compressing",
      label: "reduce dynamic range modestly before louder output staging",
      kind: "analysis_metric",
      comparison: "decrease_by",
      metric: "dynamics.dynamic_range_db",
      threshold: thresholdByIntensity(objectives.intensity, 0.25, 0.5, 0.8),
      rationale:
        "A louder-and-more-controlled request should tighten dynamics somewhat, but not flatten the source.",
    });
    targets.push({
      target_id: "target_controlled_loudness_no_overcompression",
      goal: "make dynamics more controlled without over-compressing",
      label: "avoid over-compression side effects",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "over_compression",
    });
    targets.push({
      target_id: "target_controlled_loudness_integrated_lufs",
      goal: "increase output level conservatively",
      label: "raise integrated loudness modestly",
      kind: "analysis_metric",
      comparison: "increase_by",
      metric: "levels.integrated_lufs",
      threshold: thresholdByIntensity(objectives.intensity, 0.7, 1, 1.4),
      rationale:
        "The coupled louder-and-controlled path should raise loudness, but less aggressively than a pure louder request.",
    });
    targets.push({
      target_id: "target_controlled_loudness_peak_guard",
      goal: "increase output level conservatively",
      label: "avoid worsening peak control while raising loudness",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "peak_control_regression",
    });
    targets.push({
      target_id: "target_controlled_loudness_no_headroom_loss",
      goal: "increase output level conservatively",
      label: "avoid loudness-side headroom loss",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "loudness_headroom_loss",
    });
  } else if (objectives.wants_more_controlled_dynamics) {
    if (
      analysisReport.measurements.dynamics.dynamic_range_db === undefined ||
      analysisReport.measurements.dynamics.dynamic_range_db > 2
    ) {
      targets.push({
        target_id: "target_control_dynamics_range",
        goal: "make dynamics more controlled without over-compressing",
        label: "reduce dynamic range slightly",
        kind: "analysis_metric",
        comparison: "decrease_by",
        metric: "dynamics.dynamic_range_db",
        threshold: thresholdByIntensity(objectives.intensity, 0.15, 0.25, 0.4),
        rationale: "Controlled dynamics should trim range slightly without flattening the source.",
      });
    }
    targets.push({
      target_id: "target_control_dynamics_headroom",
      goal: "make dynamics more controlled without over-compressing",
      label: "improve peak headroom modestly",
      kind: "analysis_metric",
      comparison: "increase_by",
      metric: "levels.headroom_db",
      threshold: thresholdByIntensity(objectives.intensity, 0.2, 0.35, 0.5),
      rationale:
        "When a source is already dense, better control may show up as improved peak margin rather than a large dynamic-range swing.",
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

  if (objectives.wants_declip) {
    const clippedSampleCount = analysisReport.measurements.artifacts.clipped_sample_count ?? 0;
    const clippedFrameCount = analysisReport.measurements.artifacts.clipped_frame_count ?? 0;
    const clippedFrameRatio = analysisReport.measurements.artifacts.clipped_frame_ratio ?? 0;
    const clippedMetric =
      clippedFrameCount > 0 ? "artifacts.clipped_frame_count" : "artifacts.clipped_sample_count";
    const clippedCount = clippedFrameCount > 0 ? clippedFrameCount : clippedSampleCount;

    targets.push({
      target_id: "target_reduce_clipping_activity",
      goal: "repair clipping artifacts conservatively",
      label: "reduce direct clipped-frame or clipped-sample activity",
      kind: "analysis_metric",
      comparison: clippedCount > 0 ? "at_most" : "decrease_by",
      metric: clippedMetric,
      threshold:
        clippedCount > 0
          ? Math.max(0, clippedCount - thresholdByIntensity(objectives.intensity, 4, 8, 16))
          : thresholdByIntensity(objectives.intensity, 4, 8, 16),
      rationale:
        "Declipping should reduce directly measured full-scale clipped activity rather than only darkening or softening the tone.",
    });

    if (clippedFrameRatio > 0) {
      targets.push({
        target_id: "target_reduce_clipping_ratio",
        goal: "repair clipping artifacts conservatively",
        label: "lower the clipped-frame ratio",
        kind: "analysis_metric",
        comparison: "decrease_by",
        metric: "artifacts.clipped_frame_ratio",
        threshold: Math.min(
          clippedFrameRatio,
          thresholdByIntensity(objectives.intensity, 0.0001, 0.0002, 0.0004),
        ),
        rationale:
          "The clipped-frame ratio normalizes clipping evidence across clip lengths for request-cycle verification.",
      });
    }

    targets.push({
      target_id: "target_declip_no_new_clipping",
      goal: "repair clipping artifacts conservatively",
      label: "avoid introducing or worsening clipping during repair",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "introduced_or_worsened_clipping",
    });
  }

  if (objectives.wants_remove_clicks) {
    const clickCount = analysisReport.measurements.artifacts.click_count ?? 0;
    const clippedSampleCount = analysisReport.measurements.artifacts.clipped_sample_count ?? 0;

    if (hasClickEvidence && clickCount > 0) {
      const desiredClickReduction = thresholdByIntensity(objectives.intensity, 1, 2, 4);
      targets.push({
        target_id: "target_reduce_click_activity",
        goal: "repair short clicks and pops conservatively",
        label: "reduce detected click activity where explicit click evidence exists",
        kind: "analysis_metric",
        comparison: "at_most",
        metric: "artifacts.click_count",
        threshold: Math.max(0, clickCount - desiredClickReduction),
        rationale:
          "Explicit click evidence is present, so direct click counting is the preferred verification signal.",
      });
    } else if (clippedSampleCount > 0) {
      targets.push({
        target_id: "target_reduce_click_activity",
        goal: "repair short clicks and pops conservatively",
        label: "reduce clipped-sample spike activity when direct click evidence is unavailable",
        kind: "analysis_metric",
        comparison: "decrease_by",
        metric: "artifacts.clipped_sample_count",
        threshold: thresholdByIntensity(objectives.intensity, 4, 8, 16),
        rationale:
          "Direct click counting is unavailable or weak, so clipped-sample activity is the current conservative proxy.",
      });
    }

    targets.push({
      target_id: "target_reduce_click_no_regression",
      goal: "repair short clicks and pops conservatively",
      label: "avoid increasing impulsive spike artifacts",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "increased_click_proxy",
    });
  }

  if (objectives.wants_remove_hum) {
    const humBands = humAnnotation?.bands_hz;
    const humLevelDbfs = analysisReport.measurements.artifacts.hum_level_dbfs;
    const humThresholdReduction = thresholdByIntensity(objectives.intensity, 3, 6, 9);
    targets.push({
      target_id: "target_reduce_hum_activity",
      goal: "reduce mains hum and harmonic buzz conservatively",
      label: hasHumEvidence
        ? `reduce detected hum activity around ${objectives.hum_frequency_hz?.toFixed(0)} Hz where evidence points to mains contamination`
        : `seek a small reduction in low-frequency contamination around ${objectives.hum_frequency_hz?.toFixed(0)} Hz`,
      kind: "analysis_metric",
      comparison: hasHumEvidence && humLevelDbfs !== undefined ? "at_most" : "decrease_by",
      metric:
        hasHumEvidence && humLevelDbfs !== undefined
          ? "artifacts.hum_level_dbfs"
          : "spectral_balance.low_band_db",
      threshold:
        hasHumEvidence && humLevelDbfs !== undefined
          ? Number((humLevelDbfs - humThresholdReduction).toFixed(2))
          : thresholdByIntensity(objectives.intensity, 1.5, 2.5, 4),
      ...(humBands !== undefined
        ? {
            target: {
              scope: "frequency_region",
              bands_hz: humBands,
            } as const,
          }
        : objectives.hum_frequency_hz === undefined
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
      rationale: hasHumEvidence
        ? analysisReport.measurements.artifacts.hum_level_dbfs !== undefined
          ? "Hum-related annotation or semantic evidence is present, so direct measured hum level is the preferred verification signal."
          : "Hum-related annotation or semantic evidence is present, but low-band energy remains the fallback verification proxy when no direct hum level is available."
        : "The baseline verifier uses low-band energy as a conservative hum proxy until direct hum evidence exists.",
    });
    targets.push({
      target_id: "target_reduce_hum_no_regression",
      goal: "reduce mains hum and harmonic buzz conservatively",
      label: "avoid increasing hum-like contamination while cleaning",
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
      threshold: thresholdByIntensity(objectives.intensity, 0.02, 0.04, 0.06),
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
      threshold: thresholdByIntensity(objectives.intensity, 0.02, 0.04, 0.06),
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

  if (objectives.wants_more_centered) {
    targets.push({
      target_id: "target_center_stereo_balance",
      goal: "reduce left-right stereo imbalance conservatively",
      label: "bring absolute stereo balance closer to center",
      kind: "analysis_metric",
      comparison: "at_most",
      metric: "derived.absolute_stereo_balance_db",
      threshold: thresholdByIntensity(objectives.intensity, 1.5, 1, 0.75),
      tolerance: 0.25,
      rationale:
        "A centered stereo image should reduce the absolute left-right balance offset toward zero.",
    });
    targets.push({
      target_id: "target_center_no_balance_regression",
      goal: "reduce left-right stereo imbalance conservatively",
      label: "avoid worsening stereo imbalance while recentering",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "stereo_balance_regression",
    });
    targets.push({
      target_id: "target_center_no_collapse",
      goal: "reduce left-right stereo imbalance conservatively",
      label: "avoid collapsing stereo width while recentering",
      kind: "regression_guard",
      comparison: "absent",
      regression_kind: "stereo_collapse",
    });
  }

  if (objectives.wants_louder && !useControlledLoudnessTargets) {
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

  return applyRegionTargetToVerificationTargets(dedupeByTargetId(targets), objectives);
}

function applyRegionTargetToVerificationTargets(
  targets: VerificationTarget[],
  objectives: ParsedEditObjectives,
): VerificationTarget[] {
  if (objectives.region_target === undefined) {
    return targets;
  }

  return targets.map((target) => {
    if (target.kind !== "analysis_metric" || target.target !== undefined) {
      return target;
    }

    const localRegionTarget = {
      scope: "time_range" as const,
      start_seconds: objectives.region_target?.start_seconds ?? 0,
      end_seconds: objectives.region_target?.end_seconds ?? 0,
    };

    if (target.target_id === "target_normalize_integrated_lufs") {
      return {
        ...target,
        comparison: "increase_by",
        threshold: normalizeLocalLoudnessDeltaThreshold(objectives),
        tolerance: 0.25,
        target: localRegionTarget,
        rationale:
          "Region-scoped normalization uses local loudness movement because a whole-file LUFS target is not directly comparable to a short local window.",
      };
    }

    return {
      ...target,
      target: localRegionTarget,
    };
  });
}

function normalizeLocalLoudnessDeltaThreshold(objectives: ParsedEditObjectives): number {
  if (objectives.wants_louder) {
    return objectives.intensity === "subtle" ? 1 : objectives.intensity === "strong" ? 2 : 1.5;
  }

  return objectives.intensity === "strong" ? 1 : 0.5;
}

function getLeadingSilenceSeconds(analysisReport: AnalysisReport): number {
  const segment = analysisReport.segments?.find((candidate) => candidate.kind === "silence");
  if (!segment || segment.start_seconds > 0.02) {
    return 0;
  }

  return Number(Math.max(0, segment.end_seconds - segment.start_seconds).toFixed(3));
}

function getTrailingSilenceSeconds(analysisReport: AnalysisReport): number {
  const segments = analysisReport.segments ?? [];
  const segment = [...segments].reverse().find((candidate) => candidate.kind === "silence");
  if (!segment) {
    return 0;
  }

  const activeSegment = [...segments]
    .reverse()
    .find((candidate) => candidate.kind === "active" || candidate.kind === "loop");
  if (!activeSegment || segment.start_seconds < activeSegment.end_seconds - 0.02) {
    return 0;
  }

  return Number(Math.max(0, segment.end_seconds - segment.start_seconds).toFixed(3));
}

function resolveDurationAfterPreStretchEdits(
  objectives: ParsedEditObjectives,
  audioVersion: AudioVersion,
  leadingSilenceSeconds: number,
  trailingSilenceSeconds: number,
): number {
  let durationSeconds =
    objectives.trim_range === undefined
      ? audioVersion.audio.duration_seconds
      : objectives.trim_range.end_seconds - objectives.trim_range.start_seconds;

  if (objectives.wants_trim_silence) {
    const removableBoundarySilence =
      (objectives.trim_leading_silence ? leadingSilenceSeconds : 0) +
      (objectives.trim_trailing_silence ? trailingSilenceSeconds : 0);
    durationSeconds = Math.max(0, durationSeconds - removableBoundarySilence);
  }

  return Number(durationSeconds.toFixed(3));
}

function resolveExpectedFinalDurationSeconds(
  objectives: ParsedEditObjectives,
  audioVersion: AudioVersion,
  leadingSilenceSeconds: number,
  trailingSilenceSeconds: number,
): number {
  const durationAfterPreStretchEdits = resolveDurationAfterPreStretchEdits(
    objectives,
    audioVersion,
    leadingSilenceSeconds,
    trailingSilenceSeconds,
  );

  if (!objectives.wants_speed_up && !objectives.wants_slow_down) {
    return durationAfterPreStretchEdits;
  }

  const stretchRatio = objectives.stretch_ratio ?? 1;
  return Number((durationAfterPreStretchEdits * stretchRatio).toFixed(3));
}

function shouldUseControlledLoudnessTargets(objectives: ParsedEditObjectives): boolean {
  return (
    objectives.wants_louder &&
    objectives.wants_more_controlled_dynamics &&
    !objectives.wants_more_even_level &&
    !objectives.wants_peak_control &&
    !objectives.wants_quieter
  );
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

function hasSemanticDescriptor(
  profile: SemanticProfile,
  label: string,
  minimumConfidence: number,
): boolean {
  return profile.descriptors.some(
    (descriptor) => descriptor.label === label && descriptor.confidence >= minimumConfidence,
  );
}

function findStrongestAnnotationByKinds(
  report: AnalysisReport,
  kinds: string[],
): NonNullable<AnalysisReport["annotations"]>[number] | undefined {
  const normalizedKinds = new Set(kinds);

  return (report.annotations ?? [])
    .filter((annotation) => normalizedKinds.has(annotation.kind))
    .sort((left, right) => right.severity - left.severity)[0];
}
