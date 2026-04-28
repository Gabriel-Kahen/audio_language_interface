import type { AnalysisReport } from "@audio-language-interface/analysis";

import { DESCRIPTOR_CATEGORY_BY_LABEL, type DESCRIPTOR_TAXONOMY } from "./descriptor-taxonomy.js";
import type { SemanticDescriptor } from "./types.js";

export function buildSemanticSummary(input: {
  report: AnalysisReport;
  descriptors: SemanticDescriptor[];
  unresolvedTerms: string[];
}): { plain_text: string; caveats?: string[] } {
  const strongestDescriptorConfidence = input.descriptors[0]?.confidence ?? 0;
  const topLabels = selectSummaryLabels(input.descriptors).map((label) => formatLabel(label));
  const caveats: string[] = [];

  if (input.report.summary.confidence !== undefined && input.report.summary.confidence < 0.65) {
    caveats.push(
      "Analysis confidence is limited, so descriptor coverage remains intentionally conservative.",
    );
  }

  if (input.unresolvedTerms.length > 0) {
    caveats.push(
      `Borderline evidence exists for: ${input.unresolvedTerms.map(formatLabel).join(", ")}.`,
    );
  }

  if (topLabels.length === 0) {
    return {
      plain_text:
        "The current analysis does not justify strong semantic descriptors from the available evidence.",
      ...(caveats.length > 0 ? { caveats } : {}),
    };
  }

  const subject = describeSource(input.report);
  const summaryConfidence = input.report.summary.confidence ?? 0;
  const usesCautiousLanguage =
    summaryConfidence < 0.72 ||
    strongestDescriptorConfidence < 0.72 ||
    input.unresolvedTerms.length > 0;

  return {
    plain_text: `${subject} ${describeDescriptors(topLabels, usesCautiousLanguage)}.`,
    ...(caveats.length > 0 ? { caveats } : {}),
  };
}

function describeSource(report: AnalysisReport): string {
  const sourceCharacter = report.source_character;

  if (!sourceCharacter?.primary_class) {
    return "The audio";
  }

  return `The current analysis suggests ${withIndefiniteArticle(formatLabel(sourceCharacter.primary_class))}`;
}

function describeDescriptors(labels: string[], usesCautiousLanguage: boolean): string {
  if (usesCautiousLanguage) {
    return `shows evidence of ${joinLabels(labels)} characteristics`;
  }

  return `has ${joinLabels(labels)} characteristics`;
}

function formatLabel(label: string): string {
  return label.replace(/_/g, " ");
}

function withIndefiniteArticle(phrase: string): string {
  const article = /^[aeiou]/i.test(phrase) ? "an" : "a";
  return `${article} ${phrase}`;
}

function joinLabels(labels: string[]): string {
  if (labels.length === 1) {
    return labels[0] ?? "";
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function selectSummaryLabels(descriptors: SemanticDescriptor[]): string[] {
  const categoryPriority: Array<keyof typeof DESCRIPTOR_TAXONOMY> = [
    "tonalBalance",
    "texture",
    "level",
    "dynamics",
    "artifacts",
    "space",
  ];
  const selected = new Set<string>();
  const strongestByCategory = new Map<string, string>();
  const availableLabels = new Set(descriptors.map((descriptor) => descriptor.label));

  for (const descriptor of descriptors) {
    const label = descriptor.label as keyof typeof DESCRIPTOR_CATEGORY_BY_LABEL;
    const category = DESCRIPTOR_CATEGORY_BY_LABEL[label];
    if (!category || strongestByCategory.has(category)) {
      continue;
    }

    if (
      descriptor.label === "balanced" &&
      descriptors.some(
        (candidate) =>
          candidate.label !== "balanced" &&
          DESCRIPTOR_CATEGORY_BY_LABEL[
            candidate.label as keyof typeof DESCRIPTOR_CATEGORY_BY_LABEL
          ] === "tonalBalance",
      )
    ) {
      continue;
    }

    strongestByCategory.set(category, descriptor.label);
  }

  for (const category of categoryPriority) {
    const label = strongestByCategory.get(category);
    if (!label) {
      continue;
    }

    selected.add(label);
    if (selected.size >= 4) {
      return [...selected];
    }
  }

  for (const descriptor of descriptors) {
    if (availableLabels.has("balanced") && descriptor.label === "balanced" && selected.size > 0) {
      continue;
    }

    selected.add(descriptor.label);
    if (selected.size >= 4) {
      break;
    }
  }

  return [...selected];
}
