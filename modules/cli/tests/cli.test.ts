import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadCliSessionState, parseCliArgs, runCli } from "../src/index.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const firstSliceFixturePath = path.join(repoRoot, "fixtures/audio/phase-1/first-slice-loop.wav");

describe("runCli", () => {
  it("parses the explicit best-effort planner flag without requiring LLM options", () => {
    const command = parseCliArgs([
      "edit",
      firstSliceFixturePath,
      "Make it less distorted.",
      "--best-effort",
    ]);

    expect(command.kind).toBe("edit");
    if (command.kind !== "edit") {
      throw new Error("Expected edit command.");
    }
    expect(command.bestEffort).toBe(true);
    expect(command.llm).toBeUndefined();
  });

  it("creates a self-contained session directory for a first edit", async () => {
    const sessionDir = await mkdtemp(path.join(os.tmpdir(), "ali-cli-edit-"));
    const stdout = createBufferWriter();
    const stderr = createBufferWriter();

    try {
      const result = await runCli(
        [
          "edit",
          firstSliceFixturePath,
          "Make this loop darker and less harsh.",
          "--session-dir",
          sessionDir,
          "--json",
        ],
        { stdout, stderr },
      );

      expect(result.exitCode).toBe(0);
      expect(stderr.value).toBe("");

      const summary = JSON.parse(stdout.value) as { result_kind: string; output_file?: string };
      expect(summary.result_kind).toBe("applied");
      expect(summary.output_file).toBeTruthy();

      const state = await loadCliSessionState(sessionDir);
      expect(state.runs).toHaveLength(1);
      expect(state.runs[0]?.command_kind).toBe("edit");
      expect(state.current_version.version_id).not.toBe(state.available_versions[0]?.version_id);

      await access(path.join(sessionDir, "runs", "run-0001", "request-cycle-result.json"));
      await access(path.join(sessionDir, "runs", "run-0001", "edit-plan.json"));
      await access(path.join(sessionDir, "runs", "run-0001", "version-comparison-report.json"));
      await access(path.join(sessionDir, "runs", "run-0001", "render-comparison-report.json"));
      await access(path.join(sessionDir, "runs", "run-0001", "output.wav"));
    } finally {
      await rm(sessionDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("uses --best-effort to apply a conservative proxy for texture wording", async () => {
    const sessionDir = await mkdtemp(path.join(os.tmpdir(), "ali-cli-best-effort-"));
    const stdout = createBufferWriter();
    const stderr = createBufferWriter();

    try {
      const result = await runCli(
        [
          "edit",
          firstSliceFixturePath,
          "Make it less distorted.",
          "--session-dir",
          sessionDir,
          "--best-effort",
          "--json",
        ],
        { stdout, stderr },
      );

      expect(result.exitCode).toBe(0);
      expect(stderr.value).toBe("");

      const summary = JSON.parse(stdout.value) as {
        result_kind: string;
        plan_operations?: string[];
      };
      expect(summary.result_kind).toBe("applied");
      expect(summary.plan_operations).toContain("notch_filter");

      const editPlan = JSON.parse(
        await readFile(path.join(sessionDir, "runs", "run-0001", "edit-plan.json"), "utf8"),
      ) as { constraints?: string[] };
      expect(editPlan.constraints).toContain(
        "best_effort: texture wording had weak or missing direct artifact evidence, so the planner chose a conservative tonal-softening proxy instead of refusing",
      );
    } finally {
      await rm(sessionDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("reuses saved session state for follow-up undo requests", async () => {
    const sessionDir = await mkdtemp(path.join(os.tmpdir(), "ali-cli-follow-up-"));
    const firstStdout = createBufferWriter();

    try {
      const firstRun = await runCli(
        [
          "edit",
          firstSliceFixturePath,
          "Make this loop darker and less harsh.",
          "--session-dir",
          sessionDir,
          "--json",
        ],
        { stdout: firstStdout },
      );
      expect(firstRun.exitCode).toBe(0);

      const stateAfterEdit = await loadCliSessionState(sessionDir);
      const originalVersionId = stateAfterEdit.available_versions.find(
        (version) => version.state?.is_original === true,
      )?.version_id;
      expect(originalVersionId).toBeTruthy();

      const stdout = createBufferWriter();
      const followUp = await runCli(["follow-up", sessionDir, "Undo.", "--json"], { stdout });

      expect(followUp.exitCode).toBe(0);
      const summary = JSON.parse(stdout.value) as {
        result_kind: string;
        follow_up_source?: string;
      };
      expect(summary.result_kind).toBe("reverted");
      expect(summary.follow_up_source).toBe("undo");

      const stateAfterUndo = await loadCliSessionState(sessionDir);
      expect(stateAfterUndo.runs).toHaveLength(2);
      expect(stateAfterUndo.runs[1]?.command_kind).toBe("follow_up");
      expect(stateAfterUndo.current_version.version_id).toBe(originalVersionId);

      const followUpResultPath = path.join(
        sessionDir,
        stateAfterUndo.runs[1]?.run_directory ?? "",
        "request-cycle-result.json",
      );
      const followUpResult = JSON.parse(await readFile(followUpResultPath, "utf8")) as {
        result_kind: string;
      };
      expect(followUpResult.result_kind).toBe("reverted");
    } finally {
      await rm(sessionDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("rejects stale session state before running follow-up orchestration", async () => {
    const sessionDir = await mkdtemp(path.join(os.tmpdir(), "ali-cli-stale-state-"));
    const stdout = createBufferWriter();

    try {
      const firstRun = await runCli(
        [
          "edit",
          firstSliceFixturePath,
          "Make this loop darker and less harsh.",
          "--session-dir",
          sessionDir,
          "--json",
        ],
        { stdout },
      );
      expect(firstRun.exitCode).toBe(0);

      const state = await loadCliSessionState(sessionDir);
      const originalVersion = state.available_versions.find(
        (version) => version.state?.is_original === true,
      );
      expect(originalVersion).toBeTruthy();
      await writeFile(
        path.join(sessionDir, "session.json"),
        `${JSON.stringify({ ...state, current_version: originalVersion }, null, 2)}\n`,
      );

      const stderr = createBufferWriter();
      const followUp = await runCli(["follow-up", sessionDir, "more", "--json"], { stderr });

      expect(followUp.exitCode).toBe(1);
      expect(stderr.value).toContain("session_graph.active_refs must match");
    } finally {
      await rm(sessionDir, { recursive: true, force: true });
    }
  }, 20_000);
});

function createBufferWriter(): { value: string; write(chunk: string): void } {
  return {
    value: "",
    write(chunk: string) {
      this.value += chunk;
    },
  };
}
