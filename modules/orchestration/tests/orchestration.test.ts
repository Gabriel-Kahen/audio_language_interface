import {
  createBranch,
  createSessionGraph,
  recordAnalysisReport,
  recordAudioAsset,
  recordAudioVersion,
  recordComparisonReport,
  recordEditPlan,
  recordRenderArtifact,
  recordSemanticProfile,
  recordTransformRecord,
  revertToVersion,
  validateSessionGraph,
} from "@audio-language-interface/history";
import { planEdits } from "@audio-language-interface/planning";
import { buildSemanticProfile } from "@audio-language-interface/semantics";
import { describe, expect, it, vi } from "vitest";
import {
  type AnalysisReport,
  type AppliedOrRevertedRequestCycleResult,
  type ApplyTransformsResult,
  type AudioAsset,
  type AudioVersion,
  type ClarificationRequiredRequestCycleResult,
  type ComparisonReport,
  type EditPlan,
  type ImportAudioResult,
  importAndAnalyze,
  isAppliedOrRevertedRequestCycleResult,
  isClarificationRequiredRequestCycleResult,
  iterativeRefine,
  type OrchestrationDependencies,
  type OrchestrationStageError,
  planAndApply,
  type RenderArtifact,
  renderAndCompare,
  resolveFollowUpRequest,
  runRequestCycle,
} from "../src/index.js";

function expectAppliedRequestCycleResult(
  result: Awaited<ReturnType<typeof runRequestCycle>>,
): AppliedOrRevertedRequestCycleResult {
  expect(isAppliedOrRevertedRequestCycleResult(result)).toBe(true);
  if (!isAppliedOrRevertedRequestCycleResult(result)) {
    throw new Error(
      `Expected applied or reverted request cycle result, got ${result.result_kind}.`,
    );
  }
  return result;
}

function expectClarificationRequestCycleResult(
  result: Awaited<ReturnType<typeof runRequestCycle>>,
): ClarificationRequiredRequestCycleResult {
  expect(isClarificationRequiredRequestCycleResult(result)).toBe(true);
  if (!isClarificationRequiredRequestCycleResult(result)) {
    throw new Error(
      `Expected clarification-required request cycle result, got ${result.result_kind}.`,
    );
  }
  return result;
}

describe("importAndAnalyze", () => {
  it("composes import and analysis explicitly", async () => {
    const result = await importAndAnalyze({
      inputPath: "/tmp/source.wav",
      dependencies: {
        importAudioFromFile: async () => createImportResult(),
        analyzeAudioVersion: async (version) =>
          createAnalysisReport(version.version_id, "analysis_input"),
      },
    });

    expect(result.asset.asset_id).toBe("asset_test");
    expect(result.analysisReport.version_id).toBe(result.version.version_id);
    expect(result.trace.map((entry) => entry.stage)).toEqual(["import", "analyze_input"]);
  });
});

describe("planAndApply", () => {
  it("uses the real semantics and planning surfaces before transforms", async () => {
    const version = createVersion("ver_input");
    const analysis = createAnalysisReport(version.version_id, "analysis_input");

    const result = await planAndApply({
      workspaceRoot: "/workspace",
      userRequest: "Make it darker",
      version,
      analysisReport: analysis,
      dependencies: {
        buildSemanticProfile,
        planEdits,
        applyEditPlan: async ({ plan }) => createTransformResult(version, plan),
      },
    });

    expect(result.semanticProfile?.analysis_report_id).toBe(analysis.report_id);
    expect(result.editPlan.version_id).toBe(version.version_id);
    expect(result.editPlan.steps[0]).toMatchObject({
      operation: "tilt_eq",
      expected_effects: expect.arrayContaining(["tilt the overall balance slightly darker"]),
    });
    expect(result.transformResult.outputVersion.parent_version_id).toBe(version.version_id);
    expect(result.trace.map((entry) => entry.stage)).toEqual(["semantic_profile", "plan", "apply"]);
  });
});

describe("renderAndCompare", () => {
  it("renders both sides and compares render artifacts", async () => {
    const baseline = createVersion("ver_base");
    const candidate = createVersion("ver_candidate", baseline.version_id);
    const baselineAnalysis = createAnalysisReport(baseline.version_id, "analysis_base");
    const candidateAnalysis = createAnalysisReport(candidate.version_id, "analysis_candidate");

    const result = await renderAndCompare({
      workspaceRoot: "/workspace",
      baselineVersion: baseline,
      candidateVersion: candidate,
      baselineAnalysis,
      candidateAnalysis,
      renderKind: "final",
      baselineRenderOptions: {
        renderId: "render_base",
        outputDir: "/workspace/renders/baseline",
        format: "flac",
        sampleRateHz: 48_000,
      },
      candidateRenderOptions: {
        renderId: "render_candidate",
        outputDir: "/workspace/renders/candidate",
        format: "wav",
        sampleRateHz: 96_000,
      },
      dependencies: {
        renderPreview: async ({ version }) => ({
          artifact: createRenderArtifact(version.version_id),
          command: createCommand(),
        }),
        renderExport: async ({ version, renderId, outputDir, format, sampleRateHz }) => {
          expect(renderId).toMatch(/^render_/);
          expect(outputDir).toMatch(/^\/workspace\/renders\//);
          expect(format).toMatch(/^(wav|flac)$/);
          expect(sampleRateHz).toBeGreaterThan(44_100);

          return {
            artifact: createRenderArtifact(version.version_id),
            command: createCommand(),
          };
        },
        compareRenders: ({ baselineRender, candidateRender }) =>
          createComparisonReport(baselineRender.render_id, candidateRender.render_id, "render"),
      },
    });

    expect(result.baselineRender.version_id).toBe(baseline.version_id);
    expect(result.candidateRender.version_id).toBe(candidate.version_id);
    expect(result.comparisonReport.baseline.ref_type).toBe("render");
    expect(result.trace.map((entry) => entry.stage)).toEqual([
      "render_baseline",
      "render_candidate",
      "compare",
    ]);
  });
});

describe("runRequestCycle", () => {
  it("runs a full request cycle and records session lineage", async () => {
    const asset = createAsset();
    const inputVersion = createVersion("ver_input");
    const dependencies = createDependencies();

    const result = await runRequestCycle({
      workspaceRoot: "/workspace",
      userRequest: "Make it darker",
      input: {
        kind: "existing",
        asset,
        version: inputVersion,
      },
      dependencies,
    });

    const appliedResult = expectAppliedRequestCycleResult(result);

    expect(appliedResult.result_kind).toBe("applied");
    expect(appliedResult.editPlan?.user_request).toBe("Make it darker");
    expect(appliedResult.outputVersion.version_id).toBe("ver_output");
    expect(appliedResult.versionComparisonReport.baseline.ref_type).toBe("version");
    expect(appliedResult.versionComparisonReport.candidate.ref_id).toBe("ver_output");
    expect(appliedResult.renderComparisonReport.candidate.ref_id).toBe("render_ver_output");
    expect(appliedResult.comparisonReport.candidate.ref_id).toBe("render_ver_output");
    expect(appliedResult.comparisonReport).toEqual(appliedResult.renderComparisonReport);
    expect(validateSessionGraph(appliedResult.sessionGraph).valid).toBe(true);
    expect(appliedResult.sessionGraph.nodes.map((node) => node.node_type)).toEqual(
      expect.arrayContaining([
        "audio_asset",
        "audio_version",
        "analysis_report",
        "semantic_profile",
        "edit_plan",
        "transform_record",
        "render_artifact",
        "comparison_report",
      ]),
    );
  });

  it("uses opt-in request interpretation above deterministic planning and returns the artifact explicitly", async () => {
    const asset = createAsset();
    const inputVersion = createVersion("ver_input");
    const interpretRequest = vi.fn().mockResolvedValue({
      schema_version: "1.0.0",
      interpretation_id: "interpret_test123",
      interpretation_policy: "best_effort",
      asset_id: inputVersion.asset_id,
      version_id: inputVersion.version_id,
      analysis_report_id: "analysis_input",
      semantic_profile_id: "semantic_input",
      user_request: "Make it darker",
      normalized_request: "Make it darker with a gentle high-shelf cut.",
      request_classification: "supported",
      next_action: "plan",
      normalized_objectives: ["darker"],
      candidate_descriptors: ["dark"],
      rationale: "Preserve the original intent while making the tonal move more explicit.",
      confidence: 0.76,
      provider: {
        kind: "openai",
        model: "gpt-5-mini",
        prompt_version: "intent_v1",
      },
      generated_at: "2026-04-21T20:30:00Z",
    });
    const dependencies = createDependencies({
      interpretRequest,
    });

    const result = await runRequestCycle({
      workspaceRoot: "/workspace",
      userRequest: "Make it darker",
      input: {
        kind: "existing",
        asset,
        version: inputVersion,
      },
      interpretation: {
        mode: "llm_assisted",
        apiKey: "test-key",
        policy: "best_effort",
        provider: {
          kind: "openai",
          model: "gpt-5-mini",
          temperature: 0.2,
        },
      },
      dependencies,
    });

    expect(interpretRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userRequest: "Make it darker",
        audioVersion: inputVersion,
        policy: "best_effort",
        provider: expect.objectContaining({
          kind: "openai",
          model: "gpt-5-mini",
          temperature: 0.2,
        }),
      }),
    );
    const appliedResult = expectAppliedRequestCycleResult(result);

    expect(appliedResult.intentInterpretation).toMatchObject({
      interpretation_id: "interpret_test123",
      interpretation_policy: "best_effort",
      provider: {
        kind: "openai",
        model: "gpt-5-mini",
      },
      normalized_request: "Make it darker with a gentle high-shelf cut.",
    });
    expect(appliedResult.editPlan?.user_request).toBe("Make it darker");
    expect(appliedResult.editPlan?.interpreted_user_request).toBe(
      "Make it darker with a gentle high-shelf cut.",
    );
    expect(appliedResult.iterations?.[0]?.intentInterpretation).toMatchObject({
      normalized_request: "Make it darker with a gentle high-shelf cut.",
    });
  });

  it("returns a first-class clarification result when conservative interpretation asks for clarity", async () => {
    const asset = createAsset();
    const inputVersion = createVersion("ver_input");
    const interpretRequest = vi.fn().mockResolvedValue({
      schema_version: "1.0.0",
      interpretation_id: "interpret_clarify123",
      interpretation_policy: "conservative",
      asset_id: inputVersion.asset_id,
      version_id: inputVersion.version_id,
      analysis_report_id: "analysis_input",
      semantic_profile_id: "semantic_input",
      user_request: "clean it",
      normalized_request: "clean it",
      request_classification: "supported_but_underspecified",
      next_action: "clarify",
      normalized_objectives: [],
      candidate_descriptors: [],
      clarification_question: "Do you mean reduce noise, tame harshness, or make it darker?",
      rationale: "Broad cleanup wording needs one explicit supported direction.",
      confidence: 0.42,
      provider: {
        kind: "openai",
        model: "gpt-5-mini",
        prompt_version: "intent_v1",
      },
      generated_at: "2026-04-22T16:00:00Z",
    });
    const dependencies = createDependencies({ interpretRequest });

    const result = await runRequestCycle({
      workspaceRoot: "/workspace",
      userRequest: "clean it",
      input: {
        kind: "existing",
        asset,
        version: inputVersion,
      },
      interpretation: {
        mode: "llm_assisted",
        apiKey: "test-key",
        policy: "conservative",
        provider: {
          kind: "openai",
          model: "gpt-5-mini",
        },
      },
      dependencies,
    });

    const clarificationResult = expectClarificationRequestCycleResult(result);

    expect(clarificationResult.result_kind).toBe("clarification_required");
    expect(clarificationResult.clarification.question).toContain("Do you mean");
    expect(clarificationResult.sessionGraph.metadata?.pending_clarification).toMatchObject({
      original_user_request: "clean it",
      source_version_id: inputVersion.version_id,
    });
    expect(clarificationResult.trace.map((entry) => entry.stage)).toEqual(
      expect.arrayContaining(["analyze_input", "resolve_follow_up"]),
    );
  });

  it("uses pending clarification context to resume the request cycle on the next answer", async () => {
    const asset = createAsset();
    const inputVersion = createVersion("ver_input");
    const interpretRequest = vi.fn().mockImplementation(async ({ userRequest, sessionContext }) => {
      if (userRequest === "clean it") {
        return {
          schema_version: "1.0.0",
          interpretation_id: "interpret_clarify123",
          interpretation_policy: "conservative",
          asset_id: inputVersion.asset_id,
          version_id: inputVersion.version_id,
          analysis_report_id: "analysis_input",
          semantic_profile_id: "semantic_input",
          user_request: "clean it",
          normalized_request: "clean it",
          request_classification: "supported_but_underspecified",
          next_action: "clarify",
          normalized_objectives: [],
          candidate_descriptors: [],
          clarification_question: "Do you mean reduce noise, tame harshness, or make it darker?",
          rationale: "Broad cleanup wording needs one explicit supported direction.",
          confidence: 0.42,
          provider: {
            kind: "openai",
            model: "gpt-5-mini",
            prompt_version: "intent_v1",
          },
          generated_at: "2026-04-22T16:00:00Z",
        };
      }

      expect(sessionContext?.pending_clarification).toMatchObject({
        original_user_request: "clean it",
      });
      return {
        schema_version: "1.0.0",
        interpretation_id: "interpret_answer123",
        interpretation_policy: "conservative",
        asset_id: inputVersion.asset_id,
        version_id: inputVersion.version_id,
        analysis_report_id: "analysis_input",
        semantic_profile_id: "semantic_input",
        user_request: userRequest,
        normalized_request: "Make it darker.",
        request_classification: "supported",
        next_action: "plan",
        normalized_objectives: ["darker"],
        candidate_descriptors: ["dark"],
        rationale: "The follow-up answer resolved the earlier cleanup ambiguity.",
        confidence: 0.82,
        provider: {
          kind: "openai",
          model: "gpt-5-mini",
          prompt_version: "intent_v1",
        },
        generated_at: "2026-04-22T16:00:01Z",
      };
    });
    const dependencies = createDependencies({ interpretRequest });

    const firstCycle = await runRequestCycle({
      workspaceRoot: "/workspace",
      userRequest: "clean it",
      input: {
        kind: "existing",
        asset,
        version: inputVersion,
      },
      interpretation: {
        mode: "llm_assisted",
        apiKey: "test-key",
        policy: "conservative",
        provider: {
          kind: "openai",
          model: "gpt-5-mini",
        },
      },
      dependencies,
    });

    const clarificationResult = expectClarificationRequestCycleResult(firstCycle);

    const secondCycle = await runRequestCycle({
      workspaceRoot: "/workspace",
      userRequest: "Make it darker.",
      input: {
        kind: "existing",
        asset,
        version: clarificationResult.inputVersion,
        sessionGraph: clarificationResult.sessionGraph,
      },
      interpretation: {
        mode: "llm_assisted",
        apiKey: "test-key",
        policy: "conservative",
        provider: {
          kind: "openai",
          model: "gpt-5-mini",
        },
      },
      dependencies,
    });

    const resumedCycle = expectAppliedRequestCycleResult(secondCycle);

    expect(resumedCycle.result_kind).toBe("applied");
    expect(resumedCycle.followUpResolution).toMatchObject({
      kind: "apply",
      source: "clarification_answer",
    });
    expect(resumedCycle.sessionGraph.metadata?.pending_clarification).toBeUndefined();
    expect(resumedCycle.intentInterpretation).toMatchObject({
      normalized_request: "Make it darker.",
    });
  });

  it("wraps stage failures with partial results", async () => {
    const asset = createAsset();
    const inputVersion = createVersion("ver_input");
    const dependencies = createDependencies({
      applyEditPlan: async () => {
        throw new Error("transform failed");
      },
    });

    await expect(
      runRequestCycle({
        workspaceRoot: "/workspace",
        userRequest: "Make it darker",
        input: {
          kind: "existing",
          asset,
          version: inputVersion,
        },
        dependencies,
      }),
    ).rejects.toMatchObject({
      stage: "apply",
      partialResult: {
        semanticProfile: expect.objectContaining({ analysis_report_id: "analysis_input" }),
        editPlan: expect.objectContaining({ user_request: "Make it darker" }),
      },
    } satisfies Partial<OrchestrationStageError>);
  });

  it("fails explicitly when LLM-assisted interpretation is requested without an interpreter dependency", async () => {
    const asset = createAsset();
    const inputVersion = createVersion("ver_input");

    await expect(
      runRequestCycle({
        workspaceRoot: "/workspace",
        userRequest: "Make it darker",
        input: {
          kind: "existing",
          asset,
          version: inputVersion,
        },
        interpretation: {
          mode: "llm_assisted",
          apiKey: "test-key",
          provider: {
            kind: "openai",
            model: "gpt-5-mini",
          },
        },
        dependencies: createDependencies(),
      }),
    ).rejects.toMatchObject({
      stage: "plan",
      partialResult: {
        semanticProfile: expect.objectContaining({ analysis_report_id: "analysis_input" }),
      },
    } satisfies Partial<OrchestrationStageError>);
  });

  it("reuses the last recorded request for `more` follow-ups", async () => {
    const asset = createAsset();
    const inputVersion = createVersion("ver_input");
    const dependencies = createDependencies();

    const firstCycle = expectAppliedRequestCycleResult(
      await runRequestCycle({
        workspaceRoot: "/workspace",
        userRequest: "Make it darker",
        input: {
          kind: "existing",
          asset,
          version: inputVersion,
        },
        dependencies,
      }),
    );

    const secondCycle = expectAppliedRequestCycleResult(
      await runRequestCycle({
        workspaceRoot: "/workspace",
        userRequest: "more",
        input: {
          kind: "existing",
          asset,
          version: firstCycle.outputVersion,
          sessionGraph: firstCycle.sessionGraph,
        },
        dependencies,
      }),
    );

    expect(secondCycle.result_kind).toBe("applied");
    expect(secondCycle.editPlan?.user_request).toBe("Make it darker");
  });

  it("supports `try another version` by branching from the prior baseline and replaying the last request", async () => {
    const asset = createAsset();
    const inputVersion = createVersion("ver_input");
    const dependencies = createDependencies();

    const firstCycle = expectAppliedRequestCycleResult(
      await runRequestCycle({
        workspaceRoot: "/workspace",
        userRequest: "Make it darker",
        input: {
          kind: "existing",
          asset,
          version: inputVersion,
        },
        dependencies,
      }),
    );

    const alternateCycle = expectAppliedRequestCycleResult(
      await runRequestCycle({
        workspaceRoot: "/workspace",
        userRequest: "try another version",
        input: {
          kind: "existing",
          asset: firstCycle.asset,
          version: firstCycle.outputVersion,
          sessionGraph: firstCycle.sessionGraph,
        },
        dependencies,
      }),
    );

    expect(alternateCycle.result_kind).toBe("applied");
    expect(alternateCycle.followUpResolution).toMatchObject({
      kind: "apply",
      source: "try_another_version",
      resolvedUserRequest: "Make it darker",
      inputVersionId: inputVersion.version_id,
    });
    expect(alternateCycle.followUpResolution.kind).toBe("apply");
    if (alternateCycle.followUpResolution.kind !== "apply") {
      throw new Error("Expected apply follow-up resolution for alternate version flow.");
    }
    expect(alternateCycle.followUpResolution.branchId).toMatch(/^branch_alt_/);
    expect(alternateCycle.inputVersion.version_id).toBe(inputVersion.version_id);
    expect(alternateCycle.outputVersion.parent_version_id).toBe(inputVersion.version_id);
    expect(alternateCycle.sessionGraph.active_refs.branch_id).toBe(
      alternateCycle.followUpResolution.branchId,
    );
    expect(validateSessionGraph(alternateCycle.sessionGraph).valid).toBe(true);
  });

  it("preserves pass history and caller rationale when one revision pass is requested", async () => {
    const asset = createAsset();
    const inputVersion = createVersion("ver_input");
    const compareRenderEditPlans: unknown[] = [];
    const dependencies = createDependencies({
      compareRenders: ({ baselineRender, candidateRender, editPlan }) => {
        compareRenderEditPlans.push(editPlan);
        return createComparisonReport(
          baselineRender.render_id,
          candidateRender.render_id,
          "render",
          editPlan,
        );
      },
    });

    const result = await runRequestCycle({
      workspaceRoot: "/workspace",
      userRequest: "Make it darker",
      input: {
        kind: "existing",
        asset,
        version: inputVersion,
      },
      revision: {
        enabled: true,
        shouldRevise: ({ history }) => ({
          shouldRevise: history.length === 1,
          rationale: "One explicit follow-up pass is required for this test.",
        }),
      },
      dependencies,
    });

    const appliedResult = expectAppliedRequestCycleResult(result);

    expect(appliedResult.result_kind).toBe("applied");
    expect(appliedResult.iterations).toHaveLength(2);
    expect(appliedResult.revision).toEqual({
      shouldRevise: true,
      rationale: "One explicit follow-up pass is required for this test.",
      source: "caller",
    });
    expect(appliedResult.outputVersion.version_id).toBe("ver_output2");
    expect(appliedResult.versionComparisonReport.baseline.ref_id).toBe("ver_output");
    expect(appliedResult.versionComparisonReport.candidate.ref_id).toBe("ver_output2");
    expect(appliedResult.renderComparisonReport.baseline.ref_type).toBe("render");
    expect(
      appliedResult.iterations?.map((iteration) => iteration.outputVersion.version_id),
    ).toEqual(["ver_output", "ver_output2"]);
    expect(
      appliedResult.iterations?.map((iteration) => iteration.comparisonReport.baseline.ref_id),
    ).toEqual(["ver_input", "ver_output"]);
    expect(
      appliedResult.trace.filter((entry) => entry.stage === "plan").map((entry) => entry.pass),
    ).toEqual([1, 2]);
    expect(appliedResult.semanticProfile).toBeUndefined();
    expect(appliedResult.editPlan).toBeUndefined();
    expect(appliedResult.transformResult).toBeUndefined();
    expect(compareRenderEditPlans).toEqual([
      expect.objectContaining({ version_id: inputVersion.version_id }),
    ]);
    expect(appliedResult.comparisonReport.goal_alignment?.map((goal) => goal.goal)).toEqual(
      appliedResult.iterations?.[0]?.editPlan.goals,
    );
    expect(validateSessionGraph(appliedResult.sessionGraph).valid).toBe(true);
  });

  it("executes undo follow-ups by reverting to the prior active version", async () => {
    const asset = createAsset();
    const inputVersion = createVersion("ver_input");
    const dependencies = createDependencies();

    const firstCycle = expectAppliedRequestCycleResult(
      await runRequestCycle({
        workspaceRoot: "/workspace",
        userRequest: "Make it darker",
        input: {
          kind: "existing",
          asset,
          version: inputVersion,
        },
        dependencies,
      }),
    );

    const secondCycle = expectAppliedRequestCycleResult(
      await runRequestCycle({
        workspaceRoot: "/workspace",
        userRequest: "more",
        input: {
          kind: "existing",
          asset,
          version: firstCycle.outputVersion,
          sessionGraph: firstCycle.sessionGraph,
        },
        dependencies,
      }),
    );

    const undoCycle = await runRequestCycle({
      workspaceRoot: "/workspace",
      userRequest: "undo",
      input: {
        kind: "existing",
        asset,
        version: secondCycle.outputVersion,
        sessionGraph: secondCycle.sessionGraph,
      },
      dependencies,
    });

    const revertedCycle = expectAppliedRequestCycleResult(undoCycle);

    expect(revertedCycle.result_kind).toBe("reverted");
    expect(revertedCycle.followUpResolution).toEqual({
      kind: "revert",
      targetVersionId: firstCycle.outputVersion.version_id,
      source: "undo",
    });
    expect(revertedCycle.outputVersion.version_id).toBe(firstCycle.outputVersion.version_id);
    expect(revertedCycle.versionComparisonReport.baseline.ref_type).toBe("version");
    expect(revertedCycle.renderComparisonReport.baseline.ref_type).toBe("render");
    expect(revertedCycle.comparisonReport).toEqual(revertedCycle.renderComparisonReport);
    expect(revertedCycle.sessionGraph.active_refs.version_id).toBe(
      firstCycle.outputVersion.version_id,
    );
    expect(validateSessionGraph(revertedCycle.sessionGraph).valid).toBe(true);
  });

  it("rejects revert execution when getAudioVersionById returns the wrong version payload", async () => {
    const asset = createAsset();
    const inputVersion = createVersion("ver_input");
    const dependencies = createDependencies({
      getAudioVersionById: async () => createVersion("ver_wrong"),
    });

    const firstCycle = expectAppliedRequestCycleResult(
      await runRequestCycle({
        workspaceRoot: "/workspace",
        userRequest: "Make it darker",
        input: {
          kind: "existing",
          asset,
          version: inputVersion,
        },
        dependencies,
      }),
    );

    await expect(
      runRequestCycle({
        workspaceRoot: "/workspace",
        userRequest: "undo",
        input: {
          kind: "existing",
          asset,
          version: firstCycle.outputVersion,
          sessionGraph: firstCycle.sessionGraph,
        },
        dependencies,
      }),
    ).rejects.toMatchObject({
      stage: "load_revert_target",
      partialResult: {
        followUpResolution: {
          kind: "revert",
          targetVersionId: inputVersion.version_id,
          source: "undo",
        },
      },
    } satisfies Partial<OrchestrationStageError>);
  });

  it("wraps follow-up resolution failures with partial session context", async () => {
    const asset = createAsset();
    const inputVersion = createVersion("ver_input");
    const dependencies = createDependencies();

    await expect(
      runRequestCycle({
        workspaceRoot: "/workspace",
        userRequest: "more",
        input: {
          kind: "existing",
          asset,
          version: inputVersion,
        },
        dependencies,
      }),
    ).rejects.toMatchObject({
      stage: "resolve_follow_up",
      partialResult: {
        asset: expect.objectContaining({ asset_id: asset.asset_id }),
        inputVersion: expect.objectContaining({ version_id: inputVersion.version_id }),
        inputAnalysis: expect.objectContaining({ version_id: inputVersion.version_id }),
        sessionGraph: expect.objectContaining({
          active_refs: expect.objectContaining({ version_id: inputVersion.version_id }),
        }),
      },
    } satisfies Partial<OrchestrationStageError>);
  });
});

describe("resolveFollowUpRequest", () => {
  it("resolves revert-style follow-ups to a previous version id", async () => {
    const asset = createAsset();
    const inputVersion = createVersion("ver_input");
    const dependencies = createDependencies();
    const result = expectAppliedRequestCycleResult(
      await runRequestCycle({
        workspaceRoot: "/workspace",
        userRequest: "Make it darker",
        input: {
          kind: "existing",
          asset,
          version: inputVersion,
        },
        dependencies,
      }),
    );

    expect(
      resolveFollowUpRequest({
        userRequest: "undo",
        versionId: result.outputVersion.version_id,
        sessionGraph: result.sessionGraph,
      }),
    ).toEqual({
      kind: "revert",
      targetVersionId: result.inputVersion.version_id,
      source: "undo",
    });
  });

  it("resolves `revert to previous version` as an explicit revert follow-up", async () => {
    const asset = createAsset();
    const inputVersion = createVersion("ver_input");
    const dependencies = createDependencies();
    const result = expectAppliedRequestCycleResult(
      await runRequestCycle({
        workspaceRoot: "/workspace",
        userRequest: "Make it darker",
        input: {
          kind: "existing",
          asset,
          version: inputVersion,
        },
        dependencies,
      }),
    );

    expect(
      resolveFollowUpRequest({
        userRequest: "revert to previous version",
        versionId: result.outputVersion.version_id,
        sessionGraph: result.sessionGraph,
      }),
    ).toEqual({
      kind: "revert",
      targetVersionId: result.inputVersion.version_id,
      source: "revert",
    });
  });

  it("resolves `try another version` to the prior baseline request and source version", async () => {
    const asset = createAsset();
    const inputVersion = createVersion("ver_input");
    const dependencies = createDependencies();
    const result = expectAppliedRequestCycleResult(
      await runRequestCycle({
        workspaceRoot: "/workspace",
        userRequest: "Make it darker",
        input: {
          kind: "existing",
          asset,
          version: inputVersion,
        },
        dependencies,
      }),
    );

    expect(
      resolveFollowUpRequest({
        userRequest: "try another version",
        versionId: result.outputVersion.version_id,
        sessionGraph: result.sessionGraph,
      }),
    ).toEqual({
      kind: "apply",
      resolvedUserRequest: "Make it darker",
      source: "try_another_version",
      inputVersionId: result.inputVersion.version_id,
    });
  });
});

describe("iterativeRefine", () => {
  it("stops when the caller stop condition returns false", async () => {
    const analyzeCalls: Array<Parameters<OrchestrationDependencies["analyzeAudioVersion"]>[1]> = [];
    const dependencies = createDependencies({
      analyzeAudioVersion: async (version, options) => {
        analyzeCalls.push(options);

        return createAnalysisReport(
          version.version_id,
          version.version_id === "ver_output" ? "analysis_output" : "analysis_input",
        );
      },
    });
    const initialVersion = createVersion("ver_input");
    const initialAnalysis = createAnalysisReport(initialVersion.version_id, "analysis_input");

    const result = await iterativeRefine({
      workspaceRoot: "/workspace",
      userRequest: "Make it darker",
      version: initialVersion,
      analysisReport: initialAnalysis,
      analysisOptions: { generatedAt: "2026-04-14T20:20:03Z" },
      maxIterations: 3,
      dependencies,
      shouldContinue: ({ history }) => history.length < 2,
    });

    expect(result.iterations).toHaveLength(2);
    expect(result.finalVersion.version_id).toBe("ver_output2");
    expect(result.iterations[0]?.comparisonReport.baseline.ref_type).toBe("version");
    expect(analyzeCalls).toEqual([
      { workspaceRoot: "/workspace", generatedAt: "2026-04-14T20:20:03Z" },
      { workspaceRoot: "/workspace", generatedAt: "2026-04-14T20:20:03Z" },
    ]);
  });
});

function createDependencies(
  overrides: Partial<OrchestrationDependencies> = {},
): OrchestrationDependencies {
  const versions = new Map<string, AudioVersion>();
  let transformCount = 0;

  return {
    importAudioFromFile: async () => createImportResult(),
    analyzeAudioVersion: async (version) =>
      createAnalysisReport(
        version.version_id,
        version.version_id === "ver_input"
          ? "analysis_input"
          : `analysis_${version.version_id.replace(/[^A-Za-z0-9]/g, "")}`,
      ),
    buildSemanticProfile,
    planEdits,
    applyEditPlan: async ({ version, plan }) => {
      versions.set(version.version_id, version as AudioVersion);
      transformCount += 1;
      const transformResult = createTransformResult(
        version as AudioVersion,
        plan,
        transformCount === 1 ? "ver_output" : `ver_output${transformCount}`,
        transformCount === 1 ? "transform_input" : `transform_input${transformCount}`,
      );
      versions.set(
        transformResult.outputVersion.version_id,
        transformResult.outputVersion as AudioVersion,
      );
      return transformResult;
    },
    renderPreview: async ({ version }) => ({
      artifact: createRenderArtifact(version.version_id),
      command: createCommand(),
    }),
    renderExport: async ({ version }) => ({
      artifact: createRenderArtifact(version.version_id),
      command: createCommand(),
    }),
    compareVersions: ({ baselineVersion, candidateVersion }) =>
      createComparisonReport(baselineVersion.version_id, candidateVersion.version_id, "version"),
    compareRenders: ({ baselineRender, candidateRender, editPlan }) =>
      createComparisonReport(
        baselineRender.render_id,
        candidateRender.render_id,
        "render",
        editPlan,
      ),
    createSessionGraph,
    createBranch,
    revertToVersion,
    recordAudioAsset,
    recordAudioVersion,
    recordAnalysisReport,
    recordSemanticProfile,
    recordEditPlan,
    recordTransformRecord,
    recordRenderArtifact,
    recordComparisonReport,
    getAudioVersionById: async ({ versionId }) => versions.get(versionId),
    ...overrides,
  };
}

function createImportResult(): ImportAudioResult {
  const asset = createAsset();
  const version = createVersion("ver_input");
  return {
    asset,
    version,
    sourceMetadata: {
      sourcePath: "/tmp/source.wav",
      fileSizeBytes: 1024,
      containerFormat: "wav",
      codec: "pcm_s16le",
      sampleRateHz: 44100,
      channels: 2,
      durationSeconds: 1,
      frameCount: 44100,
    },
    materializedMetadata: {
      sourcePath: "/workspace/storage/audio/ver_input.wav",
      fileSizeBytes: 1024,
      containerFormat: "wav",
      codec: "pcm_s16le",
      sampleRateHz: 44100,
      channels: 2,
      durationSeconds: 1,
      frameCount: 44100,
    },
    outputPath: "/workspace/storage/audio/ver_input.wav",
    normalized: false,
  };
}

function createAsset(): AudioAsset {
  return {
    schema_version: "1.0.0",
    asset_id: "asset_test",
    display_name: "fixture.wav",
    source: {
      kind: "file",
      uri: "file:///fixture.wav",
      imported_at: "2026-04-14T20:20:00Z",
      checksum_sha256: "abc123",
    },
    media: {
      container_format: "wav",
      codec: "pcm_s16le",
      sample_rate_hz: 44100,
      channels: 2,
      duration_seconds: 1,
    },
  };
}

function createVersion(
  versionId: AudioVersion["version_id"],
  parentVersionId?: AudioVersion["version_id"],
  planId?: AudioVersion["lineage"]["plan_id"],
): AudioVersion {
  const lineage: AudioVersion["lineage"] = {
    created_at: "2026-04-14T20:20:01Z",
    created_by: parentVersionId ? "modules/transforms" : "modules/io",
    reason: parentVersionId ? `applied edit plan ${planId ?? "unknown"}` : "initial import",
  };

  if (parentVersionId !== undefined && planId !== undefined) {
    lineage.plan_id = planId;
  }

  return {
    schema_version: "1.0.0",
    version_id: versionId,
    asset_id: "asset_test",
    ...(parentVersionId === undefined ? {} : { parent_version_id: parentVersionId }),
    lineage,
    audio: {
      storage_ref: `storage/audio/${versionId}.wav`,
      sample_rate_hz: 44100,
      channels: 2,
      duration_seconds: 1,
      frame_count: 44100,
    },
    state: {
      is_original: parentVersionId === undefined,
      is_preview: false,
    },
  };
}

function createAnalysisReport(versionId: string, reportId: string): AnalysisReport {
  return {
    schema_version: "1.0.0",
    report_id: reportId,
    asset_id: "asset_test",
    version_id: versionId,
    generated_at: "2026-04-14T20:20:02Z",
    analyzer: {
      name: "baseline",
      version: "0.1.0",
    },
    summary: {
      plain_text: "fixture summary",
    },
    measurements: {
      levels: {
        integrated_lufs: -14,
        true_peak_dbtp: -1,
        rms_dbfs: -16,
        sample_peak_dbfs: -1,
        headroom_db: 1,
      },
      dynamics: {
        crest_factor_db: 10,
        transient_density_per_second: 2,
        rms_short_term_dbfs: -17,
        dynamic_range_db: 8,
      },
      spectral_balance: {
        low_band_db: -15,
        mid_band_db: -12,
        high_band_db: -9,
        spectral_centroid_hz: 3000,
      },
      stereo: {
        width: 0.6,
        correlation: 0.2,
        balance_db: 0,
      },
      artifacts: {
        clipping_detected: false,
        noise_floor_dbfs: -70,
        clipped_sample_count: 0,
        hum_detected: false,
        hum_harmonic_count: 0,
        click_detected: false,
        click_count: 0,
        click_rate_per_second: 0,
      },
    },
  };
}

function createTransformResult(
  version: AudioVersion,
  plan: EditPlan,
  outputVersionId: AudioVersion["version_id"] = "ver_output",
  recordId: ApplyTransformsResult["transformRecord"]["record_id"] = "transform_input",
): ApplyTransformsResult {
  const outputVersion = createVersion(
    outputVersionId,
    version.version_id,
    plan.plan_id as AudioVersion["lineage"]["plan_id"],
  );
  outputVersion.lineage.transform_record_id = recordId as NonNullable<
    AudioVersion["lineage"]["transform_record_id"]
  >;

  return {
    outputVersion,
    transformRecord: {
      schema_version: "1.0.0",
      record_id: recordId,
      plan_id: plan.plan_id,
      asset_id: version.asset_id,
      input_version_id: version.version_id,
      output_version_id: outputVersion.version_id,
      started_at: "2026-04-14T20:20:05Z",
      finished_at: "2026-04-14T20:20:06Z",
      runtime_ms: 10,
      operations: [
        {
          operation: "parametric_eq",
          target: plan.steps[0]?.target ?? { scope: "full_file" },
          parameters: plan.steps[0]?.parameters ?? {},
          status: "applied",
        },
      ],
    },
    commands: [createCommand()],
    warnings: [],
  };
}

function createRenderArtifact(versionId: string): RenderArtifact {
  return {
    schema_version: "1.0.0",
    render_id: `render_${versionId}`,
    asset_id: "asset_test",
    version_id: versionId,
    kind: "preview",
    created_at: "2026-04-14T20:20:07Z",
    output: {
      path: `renders/${versionId}.mp3`,
      format: "mp3",
      codec: "libmp3lame",
      sample_rate_hz: 44100,
      channels: 2,
      duration_seconds: 1,
      file_size_bytes: 1024,
    },
    warnings: [],
  };
}

function createComparisonReport(
  baselineRefId: string,
  candidateRefId: string,
  refType: "version" | "render",
  editPlan?: { goals: string[] },
): ComparisonReport {
  return {
    schema_version: "1.0.0",
    comparison_id: `compare_${candidateRefId}`,
    baseline: {
      ref_type: refType,
      ref_id: baselineRefId,
    },
    candidate: {
      ref_type: refType,
      ref_id: candidateRefId,
    },
    generated_at: "2026-04-14T20:20:08Z",
    metric_deltas: [
      {
        metric: "spectral_balance.high_band_db",
        direction: "decreased",
        delta: -1,
      },
    ],
    ...(editPlan === undefined
      ? {}
      : {
          goal_alignment: editPlan.goals.map((goal) => ({
            goal,
            status: "met" as const,
          })),
        }),
    evaluation_basis: {
      metric_source: refType === "version" ? "analysis_reports" : "render_artifacts",
      goal_evaluation_source: editPlan === undefined ? "none" : "heuristic_goal_alignment",
      authoritative_signal: editPlan === undefined ? "metric_deltas" : "goal_alignment",
    },
    summary: {
      plain_text: "candidate is darker",
    },
  };
}

function createCommand() {
  return {
    executable: "ffmpeg",
    args: ["-version"],
    outputPath: "/tmp/output.wav",
  };
}
