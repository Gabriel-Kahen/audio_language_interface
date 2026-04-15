import { cwd } from "node:process";

import { assertValidAudioVersion } from "../../core/src/index.js";
import { analyzeArtifacts } from "./analyzers/artifacts.js";
import { analyzeDynamics } from "./analyzers/dynamics.js";
import { analyzeLevels } from "./analyzers/levels.js";
import { analyzeSegments } from "./analyzers/segments.js";
import { analyzeSourceCharacter, detectPitchedSignal } from "./analyzers/source-character.js";
import { analyzeSpectrum } from "./analyzers/spectrum.js";
import { analyzeStereo } from "./analyzers/stereo.js";
import { buildAnalysisReport } from "./report-builder.js";
import type { AnalysisReport, AnalyzeAudioOptions, AudioVersion } from "./types.js";
import { measureLoudnessWithFfmpeg } from "./utils/loudness.js";
import { assertValidAnalysisReport } from "./utils/schema.js";
import { loadNormalizedAudioData } from "./utils/wav.js";

/**
 * Analyze one contract-aligned `AudioVersion` and return an `AnalysisReport`.
 *
 * The current baseline expects `audio.storage_ref` to point to a workspace-relative
 * `.wav` file. The input and output are both schema-validated.
 */
export async function analyzeAudioVersion(
  audioVersion: AudioVersion,
  options: AnalyzeAudioOptions = {},
): Promise<AnalysisReport> {
  assertValidAudioVersion(audioVersion);

  const audioData = loadNormalizedAudioData(audioVersion, options.workspaceRoot ?? cwd());
  const loudnessMetrics = await measureLoudnessWithFfmpeg(audioData.sourcePath);
  const levels = analyzeLevels(audioData, loudnessMetrics);
  const segments = analyzeSegments(audioData);
  const dynamics = analyzeDynamics(audioData, segments);
  const spectrum = analyzeSpectrum(audioData);
  const stereo = analyzeStereo(audioData);
  const artifacts = analyzeArtifacts(audioData);
  const pitched = detectPitchedSignal(audioData.mono, audioData.sampleRateHz);
  const sourceCharacter = analyzeSourceCharacter({
    transientDensityPerSecond: dynamics.transient_density_per_second,
    spectralCentroidHz: spectrum.spectral_centroid_hz,
    stereoWidth: stereo.width,
    activeFrameRatio: segments.activeFrameRatio,
    pitched,
  });

  const report = buildAnalysisReport({
    audioVersion,
    generatedAt: options.generatedAt ?? audioVersion.lineage.created_at,
    measurements: {
      levels,
      dynamics,
      spectral_balance: {
        low_band_db: spectrum.low_band_db,
        mid_band_db: spectrum.mid_band_db,
        high_band_db: spectrum.high_band_db,
        spectral_centroid_hz: spectrum.spectral_centroid_hz,
        brightness_tilt_db: spectrum.brightness_tilt_db,
        presence_band_db: spectrum.presence_band_db,
        harshness_ratio_db: spectrum.harshness_ratio_db,
      },
      stereo,
      artifacts,
    },
    annotations: [
      ...spectrum.annotations,
      ...dynamics.annotations,
      ...stereo.annotations,
      ...artifacts.annotations,
    ],
    segments: segments.segments,
    sourceCharacter,
  });

  assertValidAnalysisReport(report);
  return report;
}
