import { readFileSync } from "node:fs";

import { type AnalysisReport, assertValidAnalysisReport } from "@audio-language-interface/analysis";
import {
  assertValidRuntimeCapabilityManifest,
  defaultRuntimeCapabilityManifest,
  type RuntimeCapabilityManifest,
} from "@audio-language-interface/capabilities";
import {
  type AudioVersion,
  assertValidAudioVersion,
  createInterpretationId,
  nowTimestamp,
} from "@audio-language-interface/core";
import {
  assertValidSemanticProfile,
  type SemanticProfile,
} from "@audio-language-interface/semantics";
import Ajv2020Import from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";

import type {
  IntentInterpretation,
  IntentInterpretationCandidate,
  InterpretationProviderRequest,
} from "./types.js";

function loadJson(relativePath: string): object {
  const fileUrl = new URL(relativePath, import.meta.url);
  return JSON.parse(readFileSync(fileUrl, "utf8")) as object;
}

const commonSchema = loadJson("../../../contracts/schemas/json/common.schema.json");
const intentInterpretationSchema = loadJson(
  "../../../contracts/schemas/json/intent-interpretation.schema.json",
);
const candidateSchema = {
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
      items: { type: "string", minLength: 1 },
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
} as const;

function buildAjv() {
  const Ajv2020 = Ajv2020Import as unknown as new (options: {
    allErrors: boolean;
    strict: boolean;
  }) => {
    addSchema: (value: unknown, key?: string) => void;
    compile: <T>(value: unknown) => {
      (candidate: unknown): candidate is T;
      errors?: unknown;
    };
  };
  const addFormats = addFormatsImport as unknown as (ajv: object) => void;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(commonSchema, "./common.schema.json");
  return ajv;
}

const candidateValidator = buildAjv().compile<IntentInterpretationCandidate>(candidateSchema);
const interpretationValidator = buildAjv().compile<IntentInterpretation>(
  intentInterpretationSchema,
);

export function assertValidIntentInterpretation(value: IntentInterpretation): void {
  if (interpretationValidator(value)) {
    return;
  }

  throw new Error(
    `IntentInterpretation schema validation failed: ${JSON.stringify(interpretationValidator.errors)}`,
  );
}

export function isValidIntentInterpretation(value: IntentInterpretation): boolean {
  return interpretationValidator(value) === true;
}

export function parseInterpretationCandidate(content: string): IntentInterpretationCandidate {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(
      `Interpretation provider returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (candidateValidator(parsed)) {
    return parsed;
  }

  throw new Error(
    `Interpretation provider returned an invalid candidate payload: ${JSON.stringify(candidateValidator.errors)}`,
  );
}

export function buildInterpretationArtifact(
  input: InterpretationProviderRequest & { generatedAt?: string },
  candidate: IntentInterpretationCandidate,
): IntentInterpretation {
  const interpretation: IntentInterpretation = {
    schema_version: "1.0.0",
    interpretation_id: createInterpretationId(),
    asset_id: input.audioVersion.asset_id,
    version_id: input.audioVersion.version_id,
    analysis_report_id: input.analysisReport.report_id,
    semantic_profile_id: input.semanticProfile.profile_id,
    user_request: input.userRequest,
    normalized_request: candidate.normalized_request,
    request_classification: candidate.request_classification,
    normalized_objectives: [...candidate.normalized_objectives],
    candidate_descriptors: [...candidate.candidate_descriptors],
    rationale: candidate.rationale,
    confidence: candidate.confidence,
    provider: {
      kind: input.provider.kind,
      model: input.provider.model,
      prompt_version: input.promptVersion,
    },
    generated_at: input.generatedAt ?? nowTimestamp(),
    ...(candidate.ambiguities === undefined ? {} : { ambiguities: [...candidate.ambiguities] }),
    ...(candidate.unsupported_phrases === undefined
      ? {}
      : { unsupported_phrases: [...candidate.unsupported_phrases] }),
    ...(candidate.clarification_question === undefined
      ? {}
      : { clarification_question: candidate.clarification_question }),
  };

  assertValidIntentInterpretation(interpretation);
  return interpretation;
}

export function assertValidInterpretationInputs(input: {
  audioVersion: AudioVersion;
  analysisReport: AnalysisReport;
  semanticProfile: SemanticProfile;
  capabilityManifest?: RuntimeCapabilityManifest;
}): RuntimeCapabilityManifest {
  assertValidAudioVersion(input.audioVersion);
  assertValidAnalysisReport(input.analysisReport);
  assertValidSemanticProfile(input.semanticProfile);
  if (input.capabilityManifest) {
    assertValidRuntimeCapabilityManifest(input.capabilityManifest);
  }

  if (input.analysisReport.asset_id !== input.audioVersion.asset_id) {
    throw new Error("AnalysisReport asset_id must match AudioVersion asset_id.");
  }

  if (input.analysisReport.version_id !== input.audioVersion.version_id) {
    throw new Error("AnalysisReport version_id must match AudioVersion version_id.");
  }

  if (input.semanticProfile.analysis_report_id !== input.analysisReport.report_id) {
    throw new Error("SemanticProfile analysis_report_id must match AnalysisReport report_id.");
  }

  return input.capabilityManifest ?? defaultRuntimeCapabilityManifest;
}

export function resolveFetchImpl(fetchImpl?: typeof fetch): typeof fetch {
  if (fetchImpl) {
    return fetchImpl;
  }

  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable in this runtime.");
  }

  return fetch;
}

export async function toApiError(provider: string, response: Response): Promise<string> {
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    bodyText = "";
  }

  return `${provider} interpretation request failed with ${response.status}: ${bodyText || response.statusText}`;
}
