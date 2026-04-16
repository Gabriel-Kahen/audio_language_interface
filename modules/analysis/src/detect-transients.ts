import { cwd } from "node:process";

import { assertValidAudioVersion } from "@audio-language-interface/core";
import { buildTransientMap } from "./analyzers/transients.js";
import type { AudioVersion, TransientDetectionOptions, TransientMap } from "./types.js";
import { assertValidTransientMap } from "./utils/schema.js";
import { loadNormalizedAudioData } from "./utils/wav.js";

/**
 * Detect transient events in a contract-aligned `AudioVersion`.
 *
 * The detector reuses the baseline WAV decoding path and returns a standalone
 * transient map instead of extending `AnalysisReport` with event detail.
 */
export function detectTransients(
  audioVersion: AudioVersion,
  options: TransientDetectionOptions = {},
): TransientMap {
  assertValidAudioVersion(audioVersion);

  const audioData = loadNormalizedAudioData(audioVersion, options.workspaceRoot ?? cwd());
  const transientMap = buildTransientMap(audioVersion, audioData, options);
  assertValidTransientMap(transientMap);
  return transientMap;
}
