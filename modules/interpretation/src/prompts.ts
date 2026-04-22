import type { AnalysisReport } from "@audio-language-interface/analysis";
import { plannerSupportedRuntimeOperations } from "@audio-language-interface/capabilities";
import { SUPPORTED_DESCRIPTOR_LABELS } from "@audio-language-interface/semantics";

import type { InterpretationProviderRequest } from "./types.js";

export const SUPPORTED_NORMALIZATION_PHRASES = [
  "make it darker",
  "make it brighter",
  "make it airier",
  "make it warmer",
  "make it less muddy",
  "make it less harsh",
  "make it cleaner",
  "make it louder",
  "make it quieter",
  "make it more controlled",
  "control the peaks",
  "normalize the loudness",
  "trim the silence at the beginning and end",
  "speed it up",
  "slow it down",
  "pitch it up",
  "pitch it down",
  "tame the sibilance",
  "remove 50 hz hum",
  "remove 60 hz hum",
  "clean up clicks",
  "reduce hiss",
  "make it wider",
  "narrow it",
  "center this more",
  "fix the stereo imbalance",
  "preserve punch",
] as const;

export function buildSystemInstruction(): string {
  return [
    "You are interpreting natural-language audio editing requests for a deterministic editing system.",
    "Return only JSON matching the provided schema.",
    "Do not output transforms, ffmpeg parameters, or hidden reasoning chains.",
    "Normalize the request into a concise request phrase that stays inside the system's supported vocabulary when that is honest.",
    "If the request is ambiguous, contradictory, unsupported, or only runtime-available, set request_classification accordingly.",
    "Do not invent support for terms or effects that are not grounded by the current capabilities and evidence.",
    "Allowed request classifications: supported, supported_but_underspecified, unsupported, supported_runtime_only_but_not_planner_enabled.",
    `Supported descriptor labels include: ${SUPPORTED_DESCRIPTOR_LABELS.join(", ")}.`,
    `The normalized request should use phrases from the supported family when possible, such as: ${SUPPORTED_NORMALIZATION_PHRASES.join("; ")}.`,
  ].join(" ");
}

export function buildUserPrompt(input: InterpretationProviderRequest): string {
  const context = {
    asset_id: input.audioVersion.asset_id,
    version_id: input.audioVersion.version_id,
    planner_supported_operations: plannerSupportedRuntimeOperations,
    capability_manifest_id: input.capabilityManifest.manifest_id,
    supported_descriptors: SUPPORTED_DESCRIPTOR_LABELS,
    semantic_labels: input.semanticProfile.descriptors.map((descriptor) => ({
      label: descriptor.label,
      confidence: descriptor.confidence,
    })),
    unresolved_terms: input.semanticProfile.unresolved_terms ?? [],
    analysis_summary: summarizeAnalysis(input.analysisReport),
  };

  return JSON.stringify(
    {
      task: "Interpret this audio-edit request conservatively for deterministic planning.",
      prompt_version: input.promptVersion,
      user_request: input.userRequest,
      context,
    },
    null,
    2,
  );
}

export function buildCandidateSchema(): object {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "normalized_request",
      "request_classification",
      "normalized_objectives",
      "candidate_descriptors",
      "rationale",
      "confidence",
    ],
    properties: {
      normalized_request: { type: "string", minLength: 1 },
      request_classification: {
        type: "string",
        enum: [
          "supported",
          "supported_but_underspecified",
          "unsupported",
          "supported_runtime_only_but_not_planner_enabled",
        ],
      },
      normalized_objectives: {
        type: "array",
        items: { type: "string", minLength: 1 },
      },
      candidate_descriptors: {
        type: "array",
        items: {
          type: "string",
          enum: [...SUPPORTED_DESCRIPTOR_LABELS],
        },
      },
      ambiguities: {
        type: "array",
        items: { type: "string", minLength: 1 },
      },
      unsupported_phrases: {
        type: "array",
        items: { type: "string", minLength: 1 },
      },
      clarification_question: { type: "string", minLength: 1 },
      rationale: { type: "string", minLength: 1 },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
  };
}

function summarizeAnalysis(report: AnalysisReport) {
  return {
    summary: report.summary.plain_text,
    spectral_balance: report.measurements.spectral_balance,
    dynamics: report.measurements.dynamics,
    levels: report.measurements.levels,
    stereo: report.measurements.stereo,
    artifacts: report.measurements.artifacts,
    annotations: (report.annotations ?? []).slice(0, 8).map((annotation) => ({
      kind: annotation.kind,
      severity: annotation.severity,
      bands_hz: annotation.bands_hz,
      start_seconds: annotation.start_seconds,
      end_seconds: annotation.end_seconds,
      evidence: annotation.evidence,
    })),
  };
}
