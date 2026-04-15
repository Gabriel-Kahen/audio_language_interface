import { createHash } from "node:crypto";

import type { AnalysisReport } from "@audio-language-interface/analysis";

import { SCHEMA_VERSION, SEMANTICS_NAME, SEMANTICS_VERSION } from "./constants.js";
import { assessDescriptors } from "./rules.js";
import { buildSemanticSummary } from "./summary.js";
import type { BuildSemanticProfileOptions, SemanticProfile } from "./types.js";
import { assertValidAnalysisReport, assertValidSemanticProfile } from "./utils/schema.js";

/**
 * Build a contract-aligned `SemanticProfile` from one validated `AnalysisReport`.
 */
export function buildSemanticProfile(
  report: AnalysisReport,
  options: BuildSemanticProfileOptions = {},
): SemanticProfile {
  assertValidAnalysisReport(report);

  const assessment = assessDescriptors(report);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const semanticProfile: SemanticProfile = {
    schema_version: SCHEMA_VERSION,
    profile_id: createSemanticProfileId(report),
    analysis_report_id: report.report_id,
    asset_id: report.asset_id,
    version_id: report.version_id,
    generated_at: generatedAt,
    descriptors: assessment.descriptors,
    summary: buildSemanticSummary({
      report,
      descriptors: assessment.descriptors,
      unresolvedTerms: assessment.unresolvedTerms,
    }),
    ...(assessment.unresolvedTerms.length > 0
      ? { unresolved_terms: assessment.unresolvedTerms }
      : {}),
  };

  assertValidSemanticProfile(semanticProfile);
  return semanticProfile;
}

function createSemanticProfileId(report: AnalysisReport): string {
  const digest = createHash("sha256")
    .update(report.report_id)
    .update("|")
    .update(SEMANTICS_NAME)
    .update("|")
    .update(SEMANTICS_VERSION)
    .digest("hex")
    .slice(0, 24)
    .toUpperCase();

  return `semantic_${digest}`;
}
