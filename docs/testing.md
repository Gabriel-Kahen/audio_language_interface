# Testing

## Goal

Keep the repository easy to validate locally and in CI while preserving clear boundaries between schema validation, static checks, and runtime tests.

## Validation layers

The repository currently uses four main validation layers:

1. Schema validation
2. Lint and formatting checks
3. Type checking
4. Runtime tests

## Root commands

Run the full validation loop with:

```bash
pnpm run ci
```

This expands to:

```bash
pnpm validate:schemas
pnpm lint
pnpm typecheck
pnpm test
```

## What each command checks

### `pnpm validate:schemas`

- validates contract examples against the machine-readable JSON Schemas
- ensures cross-module payload examples stay in sync with published contracts

### `pnpm lint`

- runs `biome check .`
- enforces formatting, import organization, and selected static rules

### `pnpm typecheck`

- runs the workspace TypeScript check from the root `tsconfig.json`
- catches cross-module typing and package-surface drift

### `pnpm test`

- runs the Vitest suite across module-local tests and integration tests
- the current suite covers runtime modules, integration flows, and benchmark scaffolding

## Module-local testing

You can run targeted checks while working inside one module.

Examples:

```bash
pnpm exec vitest run modules/analysis/tests/analyze-audio.test.ts
pnpm exec vitest run modules/render/tests/render.test.ts
pnpm exec tsc -p modules/core/tsconfig.json --noEmit
pnpm exec biome check modules/transforms
```

## Test organization

- `modules/<name>/tests`: unit and module-local behavior
- `tests/integration`: cross-module workflows
- `contracts/examples`: contract examples validated by schema checks
- `fixtures/audio/phase-1`: committed tiny WAV corpus used by cleanup benchmark coverage and fixture-integrity checks

The current repository state includes expanded coverage around:

- analysis-backed cleanup evidence (`hum`, `click`, and the corresponding `AnalysisReport` artifact fields)
- dynamics and control transforms (`compressor`, `limiter`, `transient_shaper`, `clipper`, `gate`)
- stereo and routing behavior (`stereo_width`, `pan`, `channel_swap`, `channel_remap`, `mid_side_eq`)
- restoration behavior (`denoise`, `de_esser`, `declick`, `dehum`)
- conservative timing behavior (`trim_silence`, `time_stretch`, `pitch_shift`)
- conservative stereo/spatial behavior (`stereo_width`, `stereo_balance_correction`)
- measurement-aware normalization and target-scope execution behavior
- repeated request-cycle behavior, including alternate-version branching and revert-style follow-ups
- provider-backed request interpretation, contract validation, and tool/orchestration integration for `IntentInterpretation`
- interpretation-only benchmark scoring for richer `IntentInterpretation` artifacts, including conservative vs best-effort policy behavior, clarification, constraints, region-intent proposals, and follow-up interpretation
- grounded texture semantics and interpretation coverage for descriptors such as `relaxed`, `aggressive`, `distorted`, and `crunchy`
- end-to-end clarification-loop orchestration, tool, and request-cycle benchmark coverage for `clarify -> answer -> resume`
- alpha CLI coverage for explicit session-directory persistence, first-run editing, and history-aware follow-up reuse
- planner-facing request-cycle checks for the first explicit numeric region-targeting slice, including exact `time_range` target assertions on emitted `EditPlan` steps
- tool-surface request-cycle execution, including explicit `SessionGraph` and `available_versions` handling for follow-up requests
- compare-layer regression logic and structured verification provenance
- fixture-backed cleanup benchmark corpus integrity
- benchmark scoring/reporting for the new request-cycle evaluation layer

## Thoroughness standard

The repository should prefer overlapping validation layers rather than relying on one large end-to-end test alone.

For meaningful behavior changes, the expected stack is:

1. contract validation where payload structure changes
2. unit tests in the owning module
3. integration coverage when a workflow crosses module boundaries
4. fixture-backed tests when real audio behavior matters
5. benchmark updates when the change affects product-quality directional outcomes

No single layer should be treated as sufficient by itself for current capability-expansion work.

## Benchmark interpretation

The benchmark layer now has four distinct uses:

- compare-only benchmark cases for direct `ComparisonReport` evaluation
- interpretation-only benchmark cases for direct `IntentInterpretation` evaluation
- live interpretation benchmark execution for real OpenAI/Google/Codex CLI `interpretRequest(...)` calls against the curated interpretation corpus
- request-cycle benchmark execution plus scoring/reporting for full orchestration-cycle evaluation

The request-cycle benchmark mode should be read conservatively. Its scores are useful because they separate:

- planner correctness
- outcome verification
- regression avoidance

That separation makes failures easier to diagnose, but it does not turn the benchmark into a perceptual listening test. Request-cycle outcome scoring still depends on the current compare-layer evidence, including structured verification, goal alignment, and regression warnings.

The current request-cycle benchmark corpus is intentionally small. It covers stable tonal cleanup, grounded texture wording, tonal and cross-family compound edits, restoration, timing edits, stereo/spatial edits, the first explicit numeric region-targeting slice, iterative follow-up flows, peak-control, dedicated louder-and-controlled prompts, and explicit clarification/failure controls on committed phase-1 fixtures rather than trying to benchmark the full runtime surface at once.

That corpus now also includes a narrow compound-edit slice:

- 2-step tonal prompts such as `make this warmer and airier`
- 3-step tonal prompts such as `make this darker, less harsh, and less muddy`
- cross-family prompts such as `speed up by 10% and tame the sibilance`, `tame the sibilance and make it darker`, `center this more and make it wider`, and the current tradeoff-style `make this a little tighter and more controlled, and darker`
- explicit contradiction controls such as `make it brighter and darker`, `make it faster and slower`, and `make it wider and narrower`

Those cases are meant to test planner decomposition, explicit operation ordering, multi-goal structured verification, and honest partial-success reporting without pretending the planner can already compose the whole runtime surface safely.

For hum and click cleanup prompts, benchmark outcome checks should prefer direct `AnalysisReport.artifacts` signals such as `hum_detected`, `hum_level_dbfs`, `click_detected`, and `click_count`. Low-band, noise-floor, and clipped-sample checks remain conservative fallback coverage rather than the primary success signal.

The compare-only corpus now also includes isolated hum and click cases for both direct-artifact and fallback scoring paths. Use those cases when you need to debug compare behavior without involving planning or orchestration.

The live interpretation benchmark mode is intentionally opt-in. Run it separately from the default CI loop with:

```bash
OPENAI_API_KEY=... GOOGLE_API_KEY=... pnpm run bench:interpretation:live
```

Optional environment controls:

- `LIVE_INTERPRETATION_PROVIDERS=openai,google,codex_cli`
- `OPENAI_MODEL=...`
- `CODEX_CLI_MODEL=...`
- `CODEX_CLI_PROFILE=...`
- `CODEX_CLI_PATH=...`
- `GOOGLE_MODEL=...`
- `LIVE_INTERPRETATION_CASES=live_interpret_clean_it_conservative,live_interpret_clean_it_best_effort`

That command exits nonzero when a provider run fails or when the measured live interpretations miss their declared benchmark expectations.

## Current Capability-Expansion Testing Expectations

Current capability-expansion work should be held to a stricter test standard than the initial Phase 1 slice.

### Transform additions

Each new transform should add:

- parameter validation tests
- command or execution-shape tests
- deterministic behavior tests
- fixture-backed output verification when practical
- compare-layer regression tests for likely failure modes

### Prompt-handling changes

Prompt interpretation changes should add:

- supported prompt tests
- ambiguity tests
- unsupported-request tests
- safety-bound tests showing the planner stays conservative

### Orchestration changes

Orchestration changes should add:

- repeated-edit integration tests
- undo or revert tests where relevant
- partial-failure tests
- provenance and active-ref assertions in `SessionGraph`

### Semantic changes

Semantic changes should add:

- threshold-boundary tests
- conflicting-evidence tests
- unresolved-term tests
- summary-language tests where wording depends on confidence

## Test Matrix For Capability Readiness

Before considering a capability track complete, contributors should be able to point to:

- contract coverage for any changed payloads
- unit coverage in the owner modules
- at least one integration path showing the capability in the full pipeline where applicable
- updated docs describing supported scope and limitations

## CI behavior

GitHub Actions runs the same root validation flow used locally.

Current CI steps:

1. checkout
2. setup Node and pnpm
3. install system `ffmpeg`
4. install workspace dependencies
5. run `pnpm run ci`

Live interpretation evaluation is intentionally excluded from this path.

## System dependency note

Some modules rely on `ffmpeg` and `ffprobe` for analysis, render, import, or transform behavior. Local contributors and CI must have those tools available on `PATH`.

See `docs/system-dependencies.md` for the full system dependency policy.
