export { compareRenders } from "./compare-renders.js";
export { compareVersions } from "./compare-versions.js";
export { computeAnalysisMetricDeltas, computeRenderMetricDeltas } from "./deltas.js";
export { evaluateGoalAlignment } from "./goal-alignment.js";
export { detectAnalysisRegressions, detectRenderRegressions } from "./regressions.js";
export { buildComparisonReport } from "./report-builder.js";
export { deriveSemanticDeltas } from "./semantic-deltas.js";
export type {
  AnalysisMeasurements,
  AnalysisReport,
  AudioVersion,
  CompareRendersOptions,
  CompareVersionsOptions,
  ComparisonReport,
  EditPlan,
  GoalAlignment,
  GoalStatus,
  MetricDelta,
  MetricDirection,
  RegressionWarning,
  RenderArtifact,
  SemanticDelta,
} from "./types.js";
export { CONTRACT_SCHEMA_VERSION } from "./types.js";
export { assertValidComparisonReport, isValidComparisonReport } from "./utils/schema.js";
