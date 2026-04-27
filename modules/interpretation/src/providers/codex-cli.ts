import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { execa } from "execa";

import { buildCandidateSchema, buildCodexPrompt } from "../prompts.js";
import type {
  CodexCliInterpretationProviderConfig,
  InterpretationProvider,
  InterpretationProviderRequest,
} from "../types.js";
import { parseInterpretationCandidate, sleepMs } from "../validation.js";

export class CodexCliInterpretationProvider implements InterpretationProvider {
  async interpret(input: InterpretationProviderRequest) {
    if (input.provider.kind !== "codex_cli") {
      throw new Error("CodexCliInterpretationProvider requires a codex_cli provider config.");
    }

    const maxAttempts = (input.provider.maxRetries ?? 1) + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await runCodexCliInterpretation(input, input.provider);
      } catch (error) {
        if (attempt < maxAttempts && isRetryableCodexCliError(error)) {
          await sleepMs(attempt * 200);
          continue;
        }

        throw error;
      }
    }

    throw new Error("Codex CLI interpretation request exhausted all retries.");
  }
}

async function runCodexCliInterpretation(
  input: InterpretationProviderRequest,
  provider: CodexCliInterpretationProviderConfig,
) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ali-codex-interpret-"));
  const schemaPath = path.join(tempDir, "interpretation-schema.json");
  const outputPath = path.join(tempDir, "interpretation-output.json");

  try {
    await writeFile(schemaPath, `${JSON.stringify(buildCandidateSchema(), null, 2)}\n`);
    const prompt = buildCodexPrompt(input);
    const args = [
      "exec",
      "--skip-git-repo-check",
      "-C",
      tempDir,
      "-s",
      "read-only",
      "--color",
      "never",
      "--output-schema",
      schemaPath,
      "-o",
      outputPath,
    ];

    if (provider.profile) {
      args.push("-p", provider.profile);
    }
    if (provider.model) {
      args.push("-m", provider.model);
    }

    args.push("-");

    const result = await execa(provider.codexPath ?? "codex", args, {
      input: prompt,
      reject: false,
      ...(provider.timeoutMs === undefined ? {} : { timeout: provider.timeoutMs }),
    });

    const content = await readFile(outputPath, "utf8").catch(() => "");
    if (result.exitCode !== 0) {
      throw new Error(buildCodexCliErrorMessage(result.stderr, result.stdout, content));
    }
    if (content.trim().length === 0) {
      throw new Error("Codex CLI interpretation response did not contain structured content.");
    }

    return parseInterpretationCandidate(content);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        `Codex CLI interpretation failed because the codex executable was not found${provider.codexPath ? ` at ${provider.codexPath}` : ""}.`,
      );
    }

    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function buildCodexCliErrorMessage(stderr: string, stdout: string, content: string): string {
  const detail = [stderr.trim(), stdout.trim(), content.trim()].find((value) => value.length > 0);
  return `Codex CLI interpretation request failed${detail ? `: ${detail}` : "."}`;
}

function isRetryableCodexCliError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|408|5\d\d|rate limit|temporar|timeout|timed out/i.test(message);
}
