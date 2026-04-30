import path from "node:path";

import { assertValidAudioVersion, createRenderId } from "@audio-language-interface/core";

import { measureRenderLoudness } from "./loudness.js";
import { resolveSourceAudioPath } from "./path-policy.js";
import { renderPreviewWithFilter } from "./render-preview.js";
import type {
  ComparisonPreviewOptions,
  ComparisonPreviewResult,
  LoudnessMatchMetadata,
  PreviewLoudnessMetrics,
  RenderArtifact,
  RenderResult,
} from "./types.js";

const DEFAULT_MAX_TRUE_PEAK_DBTP = -1;
const DEFAULT_MATCH_TOLERANCE_LUFS = 0.75;

/**
 * Renders fair before/after preview artifacts plus loudness-matched A/B previews.
 *
 * Matching uses integrated LUFS with a true-peak cap. By default the target is
 * the quieter source loudness so the comparison does not win by getting louder.
 */
export async function renderComparisonPreview(
  options: ComparisonPreviewOptions,
): Promise<ComparisonPreviewResult> {
  assertValidAudioVersion(options.originalVersion);
  assertValidAudioVersion(options.editedVersion);

  if (options.originalVersion.asset_id !== options.editedVersion.asset_id) {
    throw new Error(
      "Comparison previews require original and edited versions from the same asset.",
    );
  }

  const outputDir = options.outputDir ?? "renders/comparison-previews";
  const createdAt = options.createdAt ?? new Date();
  const originalInputPath = resolveSourceAudioPath(
    options.workspaceRoot,
    options.originalVersion.audio.storage_ref,
  );
  const editedInputPath = resolveSourceAudioPath(
    options.workspaceRoot,
    options.editedVersion.audio.storage_ref,
  );
  const originalInputLoudness =
    options.originalLoudness ??
    (await measureRenderLoudness(originalInputPath, {
      ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
      ...(options.loudnessProbeExecutor === undefined
        ? {}
        : { executor: options.loudnessProbeExecutor }),
    }));
  const editedInputLoudness =
    options.editedLoudness ??
    (await measureRenderLoudness(editedInputPath, {
      ...(options.ffmpegPath === undefined ? {} : { ffmpegPath: options.ffmpegPath }),
      ...(options.loudnessProbeExecutor === undefined
        ? {}
        : { executor: options.loudnessProbeExecutor }),
    }));

  assertFiniteLoudness(originalInputLoudness, "originalLoudness");
  assertFiniteLoudness(editedInputLoudness, "editedLoudness");

  const matchPlan = buildLoudnessMatchPlan({
    original: originalInputLoudness,
    edited: editedInputLoudness,
    targetIntegratedLufs: options.targetIntegratedLufs,
    maxTruePeakDbtp: options.maxTruePeakDbtp ?? DEFAULT_MAX_TRUE_PEAK_DBTP,
    toleranceLufs: options.matchToleranceLufs ?? DEFAULT_MATCH_TOLERANCE_LUFS,
  });

  const [originalPreview, editedPreview] = await Promise.all([
    renderMeasuredPreview({
      options,
      version: options.originalVersion,
      outputDir,
      renderId: options.renderIds?.originalPreview,
      createdAt,
    }),
    renderMeasuredPreview({
      options,
      version: options.editedVersion,
      outputDir,
      renderId: options.renderIds?.editedPreview,
      createdAt,
    }),
  ]);

  const [loudnessMatchedOriginalPreview, loudnessMatchedEditedPreview] = await Promise.all([
    renderMeasuredPreview({
      options,
      version: options.originalVersion,
      outputDir,
      renderId: options.renderIds?.loudnessMatchedOriginalPreview,
      createdAt,
      audioFilterChain: buildMatchFilterChain(
        matchPlan.original.gain_db,
        matchPlan.maxTruePeakDbtp,
      ),
    }),
    renderMeasuredPreview({
      options,
      version: options.editedVersion,
      outputDir,
      renderId: options.renderIds?.loudnessMatchedEditedPreview,
      createdAt,
      audioFilterChain: buildMatchFilterChain(matchPlan.edited.gain_db, matchPlan.maxTruePeakDbtp),
    }),
  ]);

  const metadata = finalizeMatchMetadata({
    matchPlan,
    originalMatchedLoudness: readArtifactLoudness(
      loudnessMatchedOriginalPreview.artifact,
      "loudnessMatchedOriginalPreview",
    ),
    editedMatchedLoudness: readArtifactLoudness(
      loudnessMatchedEditedPreview.artifact,
      "loudnessMatchedEditedPreview",
    ),
  });

  return {
    originalPreview,
    editedPreview,
    loudnessMatchedOriginalPreview: {
      ...loudnessMatchedOriginalPreview,
      artifact: addWarnings(loudnessMatchedOriginalPreview.artifact, metadata.warnings),
    },
    loudnessMatchedEditedPreview: {
      ...loudnessMatchedEditedPreview,
      artifact: addWarnings(loudnessMatchedEditedPreview.artifact, metadata.warnings),
    },
    metadata,
  };
}

interface RenderMeasuredPreviewInput {
  options: ComparisonPreviewOptions;
  version: ComparisonPreviewOptions["originalVersion"];
  outputDir: string;
  renderId: string | undefined;
  createdAt: Date;
  audioFilterChain?: string | undefined;
}

async function renderMeasuredPreview(input: RenderMeasuredPreviewInput): Promise<RenderResult> {
  const result = await renderPreviewWithFilter(
    {
      workspaceRoot: input.options.workspaceRoot,
      version: input.version,
      outputDir: input.outputDir,
      renderId: input.renderId ?? createRenderId(),
      createdAt: input.createdAt,
      ...(input.options.ffmpegPath === undefined ? {} : { ffmpegPath: input.options.ffmpegPath }),
      ...(input.options.ffprobePath === undefined
        ? {}
        : { ffprobePath: input.options.ffprobePath }),
      ...(input.options.executor === undefined ? {} : { executor: input.options.executor }),
      ...(input.options.probeExecutor === undefined
        ? {}
        : { probeExecutor: input.options.probeExecutor }),
      ...(input.options.sampleRateHz === undefined
        ? {}
        : { sampleRateHz: input.options.sampleRateHz }),
      ...(input.options.channels === undefined ? {} : { channels: input.options.channels }),
      ...(input.options.bitrate === undefined ? {} : { bitrate: input.options.bitrate }),
    },
    input.audioFilterChain === undefined ? {} : { audioFilterChain: input.audioFilterChain },
  );
  const outputPath = path.resolve(input.options.workspaceRoot, result.artifact.output.path);
  const loudness = await measureRenderLoudness(outputPath, {
    ...(input.options.ffmpegPath === undefined ? {} : { ffmpegPath: input.options.ffmpegPath }),
    ...(input.options.loudnessProbeExecutor === undefined
      ? {}
      : { executor: input.options.loudnessProbeExecutor }),
  });

  return {
    ...result,
    artifact: {
      ...result.artifact,
      loudness_summary: { ...loudness },
    },
  };
}

interface MatchPlanInput {
  original: PreviewLoudnessMetrics;
  edited: PreviewLoudnessMetrics;
  targetIntegratedLufs: number | undefined;
  maxTruePeakDbtp: number;
  toleranceLufs: number;
}

interface MatchPlan {
  method: LoudnessMatchMetadata["method"];
  targetIntegratedLufs: number;
  requestedTargetIntegratedLufs: number;
  maxTruePeakDbtp: number;
  toleranceLufs: number;
  original: {
    input_loudness: PreviewLoudnessMetrics;
    gain_db: number;
    estimated_true_peak_dbtp: number;
  };
  edited: {
    input_loudness: PreviewLoudnessMetrics;
    gain_db: number;
    estimated_true_peak_dbtp: number;
  };
}

function buildLoudnessMatchPlan(input: MatchPlanInput): MatchPlan {
  if (!Number.isFinite(input.maxTruePeakDbtp) || input.maxTruePeakDbtp > 0) {
    throw new Error("maxTruePeakDbtp must be a finite dBTP value less than or equal to 0.");
  }

  if (!Number.isFinite(input.toleranceLufs) || input.toleranceLufs <= 0) {
    throw new Error("matchToleranceLufs must be a finite positive number.");
  }

  if (input.targetIntegratedLufs !== undefined && !Number.isFinite(input.targetIntegratedLufs)) {
    throw new Error("targetIntegratedLufs must be finite when provided.");
  }

  const requestedTarget =
    input.targetIntegratedLufs ??
    Math.min(input.original.integrated_lufs, input.edited.integrated_lufs);
  const originalSafeTarget =
    input.original.integrated_lufs + (input.maxTruePeakDbtp - input.original.true_peak_dbtp);
  const editedSafeTarget =
    input.edited.integrated_lufs + (input.maxTruePeakDbtp - input.edited.true_peak_dbtp);
  const target = roundToThreeDecimals(
    Math.min(requestedTarget, originalSafeTarget, editedSafeTarget),
  );

  return {
    method: "integrated_lufs_true_peak_capped_gain",
    targetIntegratedLufs: target,
    requestedTargetIntegratedLufs: roundToThreeDecimals(requestedTarget),
    maxTruePeakDbtp: input.maxTruePeakDbtp,
    toleranceLufs: input.toleranceLufs,
    original: buildMatchSide(input.original, target),
    edited: buildMatchSide(input.edited, target),
  };
}

function buildMatchSide(
  inputLoudness: PreviewLoudnessMetrics,
  targetIntegratedLufs: number,
): MatchPlan["original"] {
  const gainDb = roundToThreeDecimals(targetIntegratedLufs - inputLoudness.integrated_lufs);
  return {
    input_loudness: inputLoudness,
    gain_db: gainDb,
    estimated_true_peak_dbtp: roundToThreeDecimals(inputLoudness.true_peak_dbtp + gainDb),
  };
}

function buildMatchFilterChain(gainDb: number, maxTruePeakDbtp: number): string {
  return `volume=${formatFilterNumber(gainDb)}dB,alimiter=limit=${formatFilterNumber(dbToLinear(maxTruePeakDbtp))}`;
}

function finalizeMatchMetadata(input: {
  matchPlan: MatchPlan;
  originalMatchedLoudness: PreviewLoudnessMetrics;
  editedMatchedLoudness: PreviewLoudnessMetrics;
}): LoudnessMatchMetadata {
  const warnings: string[] = [];
  const loudnessDelta = Math.abs(
    input.originalMatchedLoudness.integrated_lufs - input.editedMatchedLoudness.integrated_lufs,
  );

  if (input.matchPlan.targetIntegratedLufs < input.matchPlan.requestedTargetIntegratedLufs) {
    warnings.push(
      `Target loudness was reduced from ${formatDb(input.matchPlan.requestedTargetIntegratedLufs)} LUFS to ${formatDb(input.matchPlan.targetIntegratedLufs)} LUFS to preserve true-peak headroom.`,
    );
  }

  if (loudnessDelta > input.matchPlan.toleranceLufs) {
    warnings.push(
      `Matched previews differ by ${formatDb(loudnessDelta)} LUFS, which exceeds the ${formatDb(input.matchPlan.toleranceLufs)} LUFS tolerance.`,
    );
  }

  for (const [label, loudness] of [
    ["original", input.originalMatchedLoudness],
    ["edited", input.editedMatchedLoudness],
  ] as const) {
    if (loudness.true_peak_dbtp > input.matchPlan.maxTruePeakDbtp + 0.1) {
      warnings.push(
        `${label} matched preview true peak ${formatDb(loudness.true_peak_dbtp)} dBTP exceeds the ${formatDb(input.matchPlan.maxTruePeakDbtp)} dBTP guard.`,
      );
    }
  }

  return {
    method: input.matchPlan.method,
    target_integrated_lufs: input.matchPlan.targetIntegratedLufs,
    max_true_peak_dbtp: input.matchPlan.maxTruePeakDbtp,
    tolerance_lufs: input.matchPlan.toleranceLufs,
    clipping_guard: "true_peak_gain_cap_and_limiter",
    original: {
      ...input.matchPlan.original,
      matched_loudness: input.originalMatchedLoudness,
    },
    edited: {
      ...input.matchPlan.edited,
      matched_loudness: input.editedMatchedLoudness,
    },
    ...(warnings.length === 0 ? {} : { warnings }),
  };
}

function readArtifactLoudness(artifact: RenderArtifact, label: string): PreviewLoudnessMetrics {
  const integratedLufs = artifact.loudness_summary?.integrated_lufs;
  const truePeakDbtp = artifact.loudness_summary?.true_peak_dbtp;

  if (
    typeof integratedLufs !== "number" ||
    !Number.isFinite(integratedLufs) ||
    typeof truePeakDbtp !== "number" ||
    !Number.isFinite(truePeakDbtp)
  ) {
    throw new Error(`${label} is missing measured loudness summary metadata.`);
  }

  return {
    integrated_lufs: integratedLufs,
    true_peak_dbtp: truePeakDbtp,
  };
}

function addWarnings(artifact: RenderArtifact, warnings: string[] | undefined): RenderArtifact {
  if (warnings === undefined || warnings.length === 0) {
    return artifact;
  }

  return {
    ...artifact,
    warnings: [...new Set([...(artifact.warnings ?? []), ...warnings])],
  };
}

function assertFiniteLoudness(metrics: PreviewLoudnessMetrics, label: string): void {
  if (!Number.isFinite(metrics.integrated_lufs) || !Number.isFinite(metrics.true_peak_dbtp)) {
    throw new Error(`${label} must contain finite integrated_lufs and true_peak_dbtp values.`);
  }
}

function dbToLinear(value: number): number {
  return 10 ** (value / 20);
}

function roundToThreeDecimals(value: number): number {
  return Number(value.toFixed(3));
}

function formatFilterNumber(value: number): string {
  return Number(value.toFixed(6)).toString();
}

function formatDb(value: number): string {
  return Number(value.toFixed(2)).toString();
}
