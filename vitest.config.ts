import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@audio-language-interface/analysis": fileURLToPath(
        new URL("./modules/analysis/src/index.ts", import.meta.url),
      ),
      "@audio-language-interface/compare": fileURLToPath(
        new URL("./modules/compare/src/index.ts", import.meta.url),
      ),
      "@audio-language-interface/capabilities": fileURLToPath(
        new URL("./modules/capabilities/src/index.ts", import.meta.url),
      ),
      "@audio-language-interface/core": fileURLToPath(
        new URL("./modules/core/src/index.ts", import.meta.url),
      ),
      "@audio-language-interface/history": fileURLToPath(
        new URL("./modules/history/src/index.ts", import.meta.url),
      ),
      "@audio-language-interface/interpretation": fileURLToPath(
        new URL("./modules/interpretation/src/index.ts", import.meta.url),
      ),
      "@audio-language-interface/io": fileURLToPath(
        new URL("./modules/io/src/index.ts", import.meta.url),
      ),
      "@audio-language-interface/orchestration": fileURLToPath(
        new URL("./modules/orchestration/src/index.ts", import.meta.url),
      ),
      "@audio-language-interface/planning": fileURLToPath(
        new URL("./modules/planning/src/index.ts", import.meta.url),
      ),
      "@audio-language-interface/render": fileURLToPath(
        new URL("./modules/render/src/index.ts", import.meta.url),
      ),
      "@audio-language-interface/semantics": fileURLToPath(
        new URL("./modules/semantics/src/index.ts", import.meta.url),
      ),
      "@audio-language-interface/tools": fileURLToPath(
        new URL("./modules/tools/src/index.ts", import.meta.url),
      ),
      "@audio-language-interface/transforms": fileURLToPath(
        new URL("./modules/transforms/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: [
      "modules/*/tests/**/*.test.ts",
      "modules/*/tests/**/*.spec.ts",
      "tests/integration/**/*.test.ts",
      "tests/integration/**/*.spec.ts",
    ],
  },
});
