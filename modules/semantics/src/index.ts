export { buildSemanticProfile } from "./build-semantic-profile.js";
export { DESCRIPTOR_TAXONOMY, SUPPORTED_DESCRIPTOR_LABELS } from "./descriptor-taxonomy.js";
export type {
  AnalysisReport,
  BuildSemanticProfileOptions,
  SemanticDescriptor,
  SemanticProfile,
} from "./types.js";
export { assertValidSemanticProfile, isValidSemanticProfile } from "./utils/schema.js";
