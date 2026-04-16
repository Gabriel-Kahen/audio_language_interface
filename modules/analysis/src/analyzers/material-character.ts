import type { AnalysisSegment, MaterialCharacter } from "../types.js";
import { clamp } from "../utils/math.js";

interface MaterialCharacterInputs {
  durationSeconds: number;
  segments: AnalysisSegment[];
  transientDensityPerSecond: number;
}

export function classifyMaterialCharacter(inputs: MaterialCharacterInputs): MaterialCharacter {
  const durationSeconds = Math.max(inputs.durationSeconds, 0);
  const hasLoopSegment = inputs.segments.some((segment) => segment.kind === "loop");
  const activeSegments = inputs.segments.filter(
    (segment) => segment.kind === "active" || segment.kind === "loop",
  );
  const silenceSegments = inputs.segments.filter((segment) => segment.kind === "silence");
  const activeDurationSeconds = activeSegments.reduce(
    (total, segment) => total + Math.max(0, segment.end_seconds - segment.start_seconds),
    0,
  );
  const activeRatio = durationSeconds === 0 ? 0 : activeDurationSeconds / durationSeconds;
  const isBoundedBySilence =
    inputs.segments[0]?.kind === "silence" &&
    inputs.segments.at(-1)?.kind === "silence" &&
    silenceSegments.length >= 2;
  const hasLoopEvidence = hasLoopSegment && inputs.transientDensityPerSecond >= 1.5;
  const hasOneShotEvidence =
    isBoundedBySilence &&
    activeSegments.length === 1 &&
    activeRatio <= 0.8 &&
    inputs.transientDensityPerSecond < 1.5;

  if (hasLoopEvidence) {
    return {
      classification: "loop",
      confidence: clamp(0.84 + Math.min(inputs.transientDensityPerSecond / 20, 0.08), 0, 0.95),
      evidence: `active material covers ${toPercent(activeRatio)} of the file with repeated transient activity`,
    };
  }

  if (hasOneShotEvidence) {
    return {
      classification: "one_shot",
      confidence: clamp(0.82 + Math.min((1 - activeRatio) * 0.15, 0.08), 0, 0.92),
      evidence: `single active region is bounded by leading and trailing silence and covers ${toPercent(activeRatio)} of the file`,
    };
  }

  return {
    classification: "unknown",
    confidence: 0.25,
    evidence: "no clear repeated loop pattern or isolated one-shot envelope",
  };
}

function toPercent(value: number): string {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}
