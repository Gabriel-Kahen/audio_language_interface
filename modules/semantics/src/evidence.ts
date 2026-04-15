import type { AnalysisReport } from "@audio-language-interface/analysis";

export function measurementEvidenceRef(
  report: AnalysisReport,
  measurementGroup: keyof AnalysisReport["measurements"],
): string {
  return `${report.report_id}:measurements.${measurementGroup}`;
}

export function annotationEvidenceRef(report: AnalysisReport, annotationIndex: number): string {
  return `${report.report_id}:annotations[${annotationIndex}]`;
}
