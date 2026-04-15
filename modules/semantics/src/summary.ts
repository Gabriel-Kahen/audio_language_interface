import type { AnalysisReport } from "@audio-language-interface/analysis";

import type { SemanticDescriptor } from "./types.js";

export function buildSemanticSummary(input: {
  report: AnalysisReport;
  descriptors: SemanticDescriptor[];
  unresolvedTerms: string[];
}): { plain_text: string; caveats?: string[] } {
  const topLabels = input.descriptors
    .slice(0, 3)
    .map((descriptor) => formatLabel(descriptor.label));
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
        "No strong semantic descriptors were assigned from the current analysis evidence.",
      ...(caveats.length > 0 ? { caveats } : {}),
    };
  }

  const subject = describeSource(input.report);

  return {
    plain_text: `${subject} ${describeDescriptors(topLabels)}.`,
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

function describeDescriptors(labels: string[]): string {
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
