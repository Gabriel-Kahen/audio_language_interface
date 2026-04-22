# Audio Language Interface

Audio Language Interface is a contract-first natural-language audio editing platform for LLMs.

The project is built around one core idea: a language model should be able to inspect audio, reason about requested changes, build an explicit edit plan, execute deterministic transforms, and verify whether the result moved toward the request.

This repo is not:

- a DAW clone
- a beatmaker
- a music-generation system
- a pile of hidden heuristics behind one opaque prompt

It is an audio-editing runtime and planning stack for model-driven workflows.

License: `MIT`. See [LICENSE](LICENSE).

## Why This Exists

Most LLM audio workflows collapse too many responsibilities into one step:

- vague language interpretation
- capability guessing
- audio execution
- result evaluation

That makes them brittle and hard to debug.

This repository splits those concerns cleanly so a model can work against explicit artifacts instead of hidden behavior.

The key architectural rule is:

- the audio runtime owns deterministic execution
- the intent layer owns semantics and planning
- the capability manifest is the contract between them
- optional provider-backed request interpretation stays above the deterministic core
- tools and orchestration are adapters, not the core system

## What The System Does

Today, the repository supports a real single-file editing loop:

1. import audio into workspace storage
2. analyze the current file
3. derive conservative semantic descriptors
4. translate a user request into an explicit `EditPlan`
5. apply deterministic FFmpeg-backed transforms
6. render previews or exports
7. compare before and after
8. record provenance in a `SessionGraph`

That loop is exposed both through modules and through a thin tool surface.

There is now also an optional interpretation layer for open-ended language:

- `modules/interpretation` can call OpenAI or Google APIs to normalize a raw request into a bounded `IntentInterpretation`
- deterministic planning remains authoritative and may still reject unsupported or weakly grounded interpretations
- callers can use the standalone `interpret_request` tool or enable LLM-assisted interpretation inside `run_request_cycle`

On top of the one-shot loop, orchestration now supports early iterative follow-up behavior for:

- `more`
- `less`
- `undo`
- `revert to previous version`
- `try another version`

Those follow-ups stay explicit: orchestration resolves them against recorded session history and version provenance instead of inventing hidden state.

The published tool surface now also exposes a first-class orchestration entrypoint for explicit request-cycle execution:

- `run_request_cycle` supports both initial import-driven runs and session-aware follow-up requests
- follow-up calls stay explicit at the adapter boundary by requiring the caller to provide the current `SessionGraph`
- revert-style and alternate-version flows also require any needed historical `AudioVersion` artifacts to be materialized explicitly instead of being resolved from hidden tool-layer state

The current cleanup slice is now analysis-backed instead of purely prompt-driven:

- `analysis` emits explicit `hum` and `click` annotations plus file-level artifact fields such as `hum_detected`, `hum_fundamental_hz`, `click_detected`, and `click_count`
- `semantics` can assign `hum_present` and `clicks_present` when that evidence is strong enough
- `compare` reports `evaluation_basis` so downstream callers can see whether structured verification, heuristic goal alignment, or raw deltas are driving quality interpretation
- `benchmarks` includes a tiny committed fixture-backed cleanup corpus under [fixtures/audio/phase-1](fixtures/audio/phase-1)

The current benchmarked planner surface also includes conservative compound-edit handling:

- explicit 2-step and 3-step tonal compounds such as `make this warmer and airier` and `make this darker, less harsh, and less muddy`
- a narrow cross-family compound slice such as `speed up by 10% and tame the sibilance`, `tame the sibilance and make it darker`, `center this more and make it wider`, and the current tradeoff-style `make this a little tighter and more controlled, and darker`
- explicit operation-phase ordering instead of prompt-order guesswork
- structured multi-goal verification rollups that keep requested-target success and regression-guard outcomes separate, including honest partial-success reporting when only part of a compound request lands
- explicit contradiction or refusal failures for prompt pairs such as `make it brighter and darker`, `make it faster and slower`, or `make it wider and narrower`, plus one-pass safety refusals for mixes such as brightening-plus-de-essing when the baseline planner cannot justify the sequence conservatively

## Architecture

The repo is organized into five groups.

### Shared/Foundation

- `contracts`
- `modules/core`
- `modules/history`
- `modules/capabilities`

This layer owns canonical artifacts, schema contracts, IDs, provenance, and published runtime capability metadata.

### Audio Runtime

- `modules/io`
- `modules/analysis`
- `modules/transforms`
- `modules/render`
- `modules/compare`

This layer owns deterministic import, inspection, execution, rendering, and before/after evaluation.

### Intent Layer

- `modules/semantics`
- `modules/planning`

This layer owns interpretation of measurable audio evidence and conversion of user requests into explicit edit plans.

### Adapters

- `modules/interpretation`
- `modules/tools`
- `modules/orchestration`

This layer exposes stable integration surfaces over the runtime and intent modules without redefining their responsibilities. `modules/interpretation` is the optional provider-backed request-normalization adapter; it does not replace deterministic planning.

### Evaluation

- `modules/benchmarks`

This layer owns prompt suites, scoring harnesses, and repeatable evaluation workflows.

For the full dependency and boundary rules, see [docs/architecture.md](docs/architecture.md).

## Core Contracts

The repository converges on a small set of canonical artifacts:

- `AudioAsset`
- `AudioVersion`
- `AnalysisReport`
- `SemanticProfile`
- `IntentInterpretation`
- `EditPlan`
- `TransformRecord`
- `RenderArtifact`
- `ComparisonReport`
- `SessionGraph`
- `ToolRequest`
- `ToolResponse`
- `RuntimeCapabilityManifest`

These are published under [contracts/schemas](contracts/schemas) with matching examples under [contracts/examples](contracts/examples).

## Current Capability Surface

### Runtime-Supported Operations

The current runtime can execute:

- `gain`
- `normalize`
- `trim`
- `trim_silence`
- `fade`
- `pitch_shift`
- `parametric_eq`
- `high_pass_filter`
- `low_pass_filter`
- `high_shelf`
- `low_shelf`
- `notch_filter`
- `tilt_eq`
- `compressor`
- `limiter`
- `transient_shaper`
- `clipper`
- `gate`
- `time_stretch`
- `reverse`
- `mono_sum`
- `pan`
- `channel_swap`
- `channel_remap`
- `stereo_balance_correction`
- `mid_side_eq`
- `stereo_width`
- `denoise`
- `de_esser`
- `declick`
- `dehum`
- `reverb`
- `delay`
- `echo`
- `bitcrush`
- `distortion`
- `saturation`
- `flanger`
- `phaser`

### Planner-Supported Operations

The baseline planner is intentionally narrower. It currently plans only against operations marked `planner_supported` in the published capability manifest.

At the moment, that includes:

- `gain`
- `trim`
- `trim_silence`
- `fade`
- `normalize`
- `pitch_shift`
- `parametric_eq`
- `high_pass_filter`
- `low_pass_filter`
- `high_shelf`
- `low_shelf`
- `notch_filter`
- `tilt_eq`
- `compressor`
- `limiter`
- `time_stretch`
- `stereo_balance_correction`
- `stereo_width`
- `denoise`
- `de_esser`
- `declick`
- `dehum`

The baseline planner now includes a conservative timing-edit slice for explicit boundary-silence trimming, pitch-preserving time stretching, and semitone pitch shifting on pitched material, plus a narrow stereo/spatial slice for widening, narrowing, and centering already-stereo material when the measured image is safe to adjust conservatively. `pan`, channel-utility and broader stereo-routing operations, the broader transient/control operations, and the newer creative effect operations remain runtime-available without being baseline-planner-selected. The transient-shaper surface is currently a compand-based, transient-biased runtime primitive rather than a full transient-designer model.

### Tool Surface

Published tool entrypoints:

- `describe_runtime_capabilities`
- `load_audio`
- `analyze_audio`
- `interpret_request`
- `plan_edits`
- `apply_edit_plan`
- `render_preview`
- `compare_versions`
- `run_request_cycle`

The tool layer is intentionally small. It exists to expose stable contracts and capability discovery to external callers, not to replace the underlying module boundaries.

## Cleanup Evidence And Evaluation

The current baseline is strongest on conservative cleanup and corrective-edit prompts when they are backed by explicit evidence:

- `analysis` can now publish steady mains-hum evidence and sparse click evidence directly in `AnalysisReport`
- `planning` keeps hum/click cleanup conservative and still requires explicit restoration intent rather than widening generic `clean it up` phrasing automatically
- `compare` prefers structured verification targets when they exist and exposes `evaluation_basis` in `ComparisonReport`
- `benchmarks` now include both curated compare cases, including isolated hum/click direct-evidence and fallback checks, and a small fixture-backed request-cycle corpus that executes the real orchestration path across tonal cleanup, restoration, timing edits, stereo/spatial edits, peak-control, and benchmarked louder-and-controlled prompts

## Best-Supported Requests Right Now

The current system is strongest on conservative editing requests such as:

- darker
- less harsh
- slightly cleaner
- explicit loudness normalization
- airier, warmer, or less muddy through conservative surgical EQ
- tame sibilance, remove explicitly specified `50 Hz` or `60 Hz` hum, and clean up clicks
- more controlled
- control peaks
- widen or narrow slightly when stereo evidence supports it
- center the image more or fix the stereo imbalance when measured balance supports it
- reduce steady broadband noise conservatively

This repo is usable today for technical experimentation and module-level integration work. It is not yet a polished end-user application.

## What Is Still Limited

- import is local-file based
- analysis currently requires WAV files on disk
- semantic coverage is intentionally conservative
- compare now prefers structured verification targets, with heuristic goal alignment kept only as a backward-compatible fallback
- hum and click comparison now prefers direct `AnalysisReport.artifacts` evidence when it exists, with low-band or clipped-sample proxies kept only as conservative fallbacks
- there is no dedicated demo CLI or app entrypoint yet
- the baseline planner does not yet auto-select `pan`, `mid_side_eq`, channel remapping, or the broader Layer 1 runtime-effect surface
- benchmark coverage now includes a tiny committed cleanup, timing, stereo/spatial, and control corpus, but it is still light compared with the long-term goal

## Repository Layout

```text
.
|-- AGENTS.md
|-- README.md
|-- contracts/
|   |-- examples/
|   `-- schemas/
|-- docs/
|-- fixtures/
|   `-- audio/
|-- modules/
|   |-- analysis/
|   |-- benchmarks/
|   |-- capabilities/
|   |-- compare/
|   |-- core/
|   |-- history/
|   |-- interpretation/
|   |-- io/
|   |-- orchestration/
|   |-- planning/
|   |-- render/
|   |-- semantics/
|   |-- tools/
|   `-- transforms/
`-- tests/
    `-- integration/
```

## Getting Started

1. Install the prerequisites in [docs/system-dependencies.md](docs/system-dependencies.md).
2. Run `pnpm install`.
3. Run the validation loop:

```bash
pnpm validate:schemas
pnpm lint
pnpm typecheck
pnpm test
```

Or run the full CI-equivalent command:

```bash
pnpm run ci
```

## Where To Start Reading

For contributors and agents, use this order:

1. [AGENTS.md](AGENTS.md)
2. [docs/architecture.md](docs/architecture.md)
3. [docs/implementation-plan.md](docs/implementation-plan.md)
4. [docs/current-capabilities.md](docs/current-capabilities.md)
5. [docs/contributor-guide.md](docs/contributor-guide.md)
6. [docs/repository-map.md](docs/repository-map.md)
7. the target module's `agents.md`
8. the target module's `docs/overview.md`
9. the relevant contracts under `contracts/schemas/`

## Practical Entry Points

- [modules/capabilities/src/index.ts](modules/capabilities/src/index.ts) for runtime capability metadata
- [modules/tools/src/index.ts](modules/tools/src/index.ts) for stable tool execution
- [modules/orchestration/src/index.ts](modules/orchestration/src/index.ts) for thin composed workflows

## Status

The architecture split is complete enough to build forward on:

- runtime and intent are separated
- planning is grounded by published capability metadata instead of transform internals
- contracts and docs reflect the split
- the repository validation loop is green

The next work is not more restructuring. It is deeper behavior:

- better capability metadata
- stronger planning
- better compare and verification
- a thin CLI or app adapter on top of the current modules
