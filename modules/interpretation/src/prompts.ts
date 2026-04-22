import type { AnalysisReport } from "@audio-language-interface/analysis";
import { plannerSupportedRuntimeOperations } from "@audio-language-interface/capabilities";
import { SUPPORTED_DESCRIPTOR_LABELS } from "@audio-language-interface/semantics";

import type { InterpretationPolicy, InterpretationProviderRequest } from "./types.js";

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
  "make the first 0.5 seconds darker",
  "make it less harsh from 0.2s to 0.7s",
  "preserve punch",
] as const;

export function buildSystemInstruction(policy: InterpretationPolicy): string {
  const policyInstruction =
    policy === "best_effort"
      ? "Interpretation policy is best_effort. Always return one best planner-facing interpretation for grounded ambiguous requests instead of dead-ending at clarify. Keep uncertainty explicit through ambiguities, candidate_interpretations, low confidence, grounding_notes, and optional clarification_question metadata. Only use refuse for truly unsupported, unsafe, or runtime-only requests."
      : "Interpretation policy is conservative. Ambiguous grounded requests should usually stay clarify rather than guessing a best interpretation.";

  return [
    "You are interpreting natural-language audio editing requests for a deterministic editing system.",
    "Return only JSON matching the provided schema.",
    "Do not output transforms, ffmpeg parameters, or hidden reasoning chains.",
    "Normalize the request into a concise request phrase that stays inside the system's supported vocabulary when that is honest.",
    policyInstruction,
    "Set next_action to plan, clarify, or refuse. Supported grounded requests should usually be plan. Unsupported or planner-disabled requests should usually be refuse.",
    "Descriptor hypotheses must stay evidence-linked. Use supported_by, contradicted_by, and needs_more_evidence with short artifact-aware references such as semantic:bright or analysis:measurements.stereo.balance_db.",
    "Use constraints to preserve important intent like subtlety, preserve punch, avoid added harshness, or similar safety and preservation language.",
    "Use region_intents only when the user wording clearly scopes the request to a part of the file. Explicit numeric windows like `the first 0.5 seconds` or `from 0.2s to 0.7s` are the safest form.",
    "If the request is a fuzzy follow-up relative to an earlier request, use follow_up_intent and constraints to explain the relationship instead of inventing unsupported transforms.",
    "If session_context.pending_clarification is present, treat the current user_request as a possible answer to that clarification question. Use the prior request and clarification question to resolve the user's intent when that is grounded.",
    "candidate_interpretations may contain a few alternate grounded readings when the request is ambiguous; keep the top-level fields as the best current interpretation.",
    "If the request is ambiguous, contradictory, unsupported, or only runtime-available, set request_classification accordingly.",
    "Do not invent support for terms or effects that are not grounded by the current capabilities and evidence.",
    "Allowed request classifications: supported, supported_but_underspecified, unsupported, supported_runtime_only_but_not_planner_enabled.",
    "Allowed next_action values: plan, clarify, refuse.",
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
    ...(input.sessionContext === undefined
      ? {}
      : {
          session_context: {
            ...(input.sessionContext.current_version_id === undefined
              ? {}
              : { current_version_id: input.sessionContext.current_version_id }),
            ...(input.sessionContext.previous_request === undefined
              ? {}
              : { previous_request: input.sessionContext.previous_request }),
            ...(input.sessionContext.original_user_request === undefined
              ? {}
              : { original_user_request: input.sessionContext.original_user_request }),
            ...(input.sessionContext.follow_up_source === undefined
              ? {}
              : { follow_up_source: input.sessionContext.follow_up_source }),
            ...(input.sessionContext.pending_clarification === undefined
              ? {}
              : {
                  pending_clarification: {
                    original_user_request:
                      input.sessionContext.pending_clarification.original_user_request,
                    clarification_question:
                      input.sessionContext.pending_clarification.clarification_question,
                    source_version_id: input.sessionContext.pending_clarification.source_version_id,
                    ...(input.sessionContext.pending_clarification.source_interpretation_id ===
                    undefined
                      ? {}
                      : {
                          source_interpretation_id:
                            input.sessionContext.pending_clarification.source_interpretation_id,
                        }),
                  },
                }),
          },
        }),
  };

  return JSON.stringify(
    {
      task:
        input.policy === "best_effort"
          ? "Interpret this audio-edit request for deterministic planning in best-effort mode."
          : "Interpret this audio-edit request conservatively for deterministic planning.",
      interpretation_policy: input.policy,
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
      "next_action",
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
      next_action: {
        type: "string",
        enum: ["plan", "clarify", "refuse"],
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
      descriptor_hypotheses: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "status"],
          properties: {
            label: { type: "string", minLength: 1 },
            status: {
              type: "string",
              enum: ["supported", "weak", "contradicted", "unresolved"],
            },
            supported_by: {
              type: "array",
              items: { type: "string", minLength: 1 },
            },
            contradicted_by: {
              type: "array",
              items: { type: "string", minLength: 1 },
            },
            needs_more_evidence: {
              type: "array",
              items: { type: "string", minLength: 1 },
            },
            rationale: { type: "string", minLength: 1 },
          },
        },
      },
      constraints: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "label"],
          properties: {
            kind: {
              type: "string",
              enum: ["intensity", "preserve", "avoid", "safety", "scope"],
            },
            label: { type: "string", minLength: 1 },
            value: { type: "string", minLength: 1 },
            rationale: { type: "string", minLength: 1 },
          },
        },
      },
      region_intents: {
        type: "array",
        items: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["scope"],
              properties: {
                scope: { const: "full_file" },
                rationale: { type: "string", minLength: 1 },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["scope", "start_seconds", "end_seconds"],
              properties: {
                scope: { const: "time_range" },
                start_seconds: { type: "number", minimum: 0 },
                end_seconds: { type: "number", minimum: 0 },
                rationale: { type: "string", minLength: 1 },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["scope", "reference"],
              properties: {
                scope: { const: "segment_reference" },
                reference: { type: "string", minLength: 1 },
                rationale: { type: "string", minLength: 1 },
              },
            },
          ],
        },
      },
      candidate_interpretations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "normalized_request",
            "request_classification",
            "next_action",
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
            next_action: {
              type: "string",
              enum: ["plan", "clarify", "refuse"],
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
        },
      },
      follow_up_intent: {
        type: "object",
        additionalProperties: false,
        required: ["kind"],
        properties: {
          kind: {
            type: "string",
            enum: [
              "direct_request",
              "repeat_last_request",
              "reduce_previous_intensity",
              "undo",
              "revert",
              "try_another_version",
              "unclear_follow_up",
            ],
          },
          rationale: { type: "string", minLength: 1 },
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
      grounding_notes: {
        type: "array",
        items: { type: "string", minLength: 1 },
      },
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
