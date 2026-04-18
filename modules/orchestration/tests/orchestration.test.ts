import {
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
import { describe, expect, it } from "vitest";
import {
  type AnalysisReport,
  type ApplyTransformsResult,
  type AudioAsset,
  type AudioVersion,
  type ComparisonReport,
  type EditPlan,
  type ImportAudioResult,
  importAndAnalyze,
  iterativeRefine,
  type OrchestrationDependencies,
  type OrchestrationStageError,
  planAndApply,
  type RenderArtifact,
  renderAndCompare,
  resolveFollowUpRequest,
  runRequestCycle,
} from "../src/index.js";

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
      operation: "parametric_eq",
      expected_effects: expect.arrayContaining(["slightly reduce perceived brightness"]),
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

    expect(result.result_kind).toBe("applied");
    expect(result.editPlan?.user_request).toBe("Make it darker");
    expect(result.outputVersion.version_id).toBe("ver_output");
    expect(result.comparisonReport.candidate.ref_id).toBe("render_ver_output");
    expect(validateSessionGraph(result.sessionGraph).valid).toBe(true);
    expect(result.sessionGraph.nodes.map((node) => node.node_type)).toEqual(
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

  it("reuses the last recorded request for `more` follow-ups", async () => {
    const asset = createAsset();
    const inputVersion = createVersion("ver_input");
    const dependencies = createDependencies();

    const firstCycle = await runRequestCycle({
      workspaceRoot: "/workspace",
      userRequest: "Make it darker",
      input: {
        kind: "existing",
        asset,
        version: inputVersion,
      },
      dependencies,
    });

    const secondCycle = await runRequestCycle({
      workspaceRoot: "/workspace",
      userRequest: "more",
      input: {
        kind: "existing",
        asset,
        version: firstCycle.outputVersion,
        sessionGraph: firstCycle.sessionGraph,
      },
      dependencies,
    });

    expect(secondCycle.result_kind).toBe("applied");
    expect(secondCycle.editPlan?.user_request).toBe("Make it darker");
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

    expect(result.result_kind).toBe("applied");
    expect(result.iterations).toHaveLength(2);
    expect(result.revision).toEqual({
      shouldRevise: true,
      rationale: "One explicit follow-up pass is required for this test.",
      source: "caller",
    });
    expect(result.outputVersion.version_id).toBe("ver_output2");
    expect(result.iterations?.map((iteration) => iteration.outputVersion.version_id)).toEqual([
      "ver_output",
      "ver_output2",
    ]);
    expect(
      result.iterations?.map((iteration) => iteration.comparisonReport.baseline.ref_id),
    ).toEqual(["ver_input", "ver_output"]);
    expect(
      result.trace.filter((entry) => entry.stage === "plan").map((entry) => entry.pass),
    ).toEqual([1, 2]);
    expect(compareRenderEditPlans).toEqual([undefined]);
    expect(validateSessionGraph(result.sessionGraph).valid).toBe(true);
  });

  it("executes undo follow-ups by reverting to the prior active version", async () => {
    const asset = createAsset();
    const inputVersion = createVersion("ver_input");
    const dependencies = createDependencies();

    const firstCycle = await runRequestCycle({
      workspaceRoot: "/workspace",
      userRequest: "Make it darker",
      input: {
        kind: "existing",
        asset,
        version: inputVersion,
      },
      dependencies,
    });

    const secondCycle = await runRequestCycle({
      workspaceRoot: "/workspace",
      userRequest: "more",
      input: {
        kind: "existing",
        asset,
        version: firstCycle.outputVersion,
        sessionGraph: firstCycle.sessionGraph,
      },
      dependencies,
    });

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

    expect(undoCycle.result_kind).toBe("reverted");
    expect(undoCycle.followUpResolution).toEqual({
      kind: "revert",
      targetVersionId: firstCycle.outputVersion.version_id,
      source: "undo",
    });
    expect(undoCycle.outputVersion.version_id).toBe(firstCycle.outputVersion.version_id);
    expect(undoCycle.sessionGraph.active_refs.version_id).toBe(firstCycle.outputVersion.version_id);
    expect(validateSessionGraph(undoCycle.sessionGraph).valid).toBe(true);
  });

  it("rejects revert execution when getAudioVersionById returns the wrong version payload", async () => {
    const asset = createAsset();
    const inputVersion = createVersion("ver_input");
    const dependencies = createDependencies({
      getAudioVersionById: async () => createVersion("ver_wrong"),
    });

    const firstCycle = await runRequestCycle({
      workspaceRoot: "/workspace",
      userRequest: "Make it darker",
      input: {
        kind: "existing",
        asset,
        version: inputVersion,
      },
      dependencies,
    });

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
    compareRenders: ({ baselineRender, candidateRender }) =>
      createComparisonReport(baselineRender.render_id, candidateRender.render_id, "render"),
    createSessionGraph,
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
