# Current Capabilities And Limitations

## Purpose

This document records what the repository implements today.

Use it to avoid planning against aspirational architecture docs alone.

## Current Supported Slice

The current repository supports a real single-file natural-language editing slice:

- import one local audio file into workspace storage
- analyze a WAV-backed `AudioVersion`
- derive a conservative `SemanticProfile`
- plan small deterministic edits for a narrow prompt family
- apply deterministic FFmpeg-backed transforms
- render preview and limited export artifacts
- compare baseline and candidate versions or renders
- record provenance in a `SessionGraph`
- access the flow through adapter surfaces in `tools` or `orchestration`

The runtime capability surface is now also published explicitly through `RuntimeCapabilityManifest`.

## What Works Today

### Shared/Foundation

- `core`: canonical `AudioAsset` and `AudioVersion` helpers plus schema-backed validation
- `history`: explicit session graph, provenance, branch, snapshot, revert, undo, and redo helpers
- `capabilities`: published `RuntimeCapabilityManifest` and shared runtime operation metadata

### Audio Runtime

- `io`: local file import, metadata inspection, optional WAV normalization, source-ref validation
- `analysis`: deterministic baseline analysis for workspace-local WAV files
- `transforms`: deterministic FFmpeg-backed execution for the current runtime operation set
- `render`: preview MP3 rendering plus WAV and FLAC export rendering
- `compare`: metric deltas, small semantic delta vocabulary, regression warnings, and goal checks

### Intent Layer

- `semantics`: conservative descriptor mapping from `AnalysisReport`
- `planning`: deterministic request parsing and explicit plan generation for supported operations

### Adapters

- `tools`: callable tool registry and request execution for the published tool set
- `orchestration`: composed happy-path workflows and iterative refinement helpers

### Evaluation

- `benchmarks`: first benchmark harness for compare-driven evaluation of the initial prompt family

## Current Prompt And Operation Scope

### Best-Supported Prompt Family

- darker
- less harsh
- slightly cleaner
- preserve punch
- more controlled
- control peaks

Supported but conservative areas:

- wider or narrower, when stereo evidence is safe enough
- denoise or reduce hiss, when steady-noise evidence is strong enough

### Runtime-Supported Operations

- `gain`
- `normalize`
- `trim`
- `trim_silence`
- `fade`
- `pitch_shift`
- `parametric_eq`
- `high_pass_filter`
- `low_pass_filter`
- `compressor`
- `limiter`
- `time_stretch`
- `reverse`
- `mono_sum`
- `channel_swap`
- `stereo_balance_correction`
- `stereo_width`
- `denoise`
- `reverb`
- `delay`
- `echo`
- `bitcrush`
- `distortion`
- `saturation`
- `flanger`
- `phaser`

### Planner-Supported Operations

The baseline planner currently plans only against operations marked `planner_supported` in the runtime capability manifest:

- `gain`
- `trim`
- `fade`
- `parametric_eq`
- `high_pass_filter`
- `low_pass_filter`
- `compressor`
- `limiter`
- `stereo_width`
- `denoise`

`time_stretch`, `pitch_shift`, `trim_silence`, the channel-utility operations, and the new Layer 1 effect operations are runtime-available but not yet selected by the baseline planner.

### Implemented Tool Surface

- `describe_runtime_capabilities`
- `load_audio`
- `analyze_audio`
- `plan_edits`
- `apply_edit_plan`
- `render_preview`
- `compare_versions`

Current tool-surface caveats:

- `apply_edit_plan` supports the published runtime capability surface, but still validates explicit runtime prerequisites such as stereo-only width processing and full-file-only target scopes for some operations
- `plan_edits` only chooses operations marked as `planner_supported` in the runtime capability manifest
- explicit technical callers can still submit runtime-only Layer 1 effect steps when they stay inside the published contract surface

## Important Current Limitations

- `io` imports local file paths only
- analysis currently requires `.wav` input files on disk
- analysis reads the whole file into memory
- semantic descriptor coverage is intentionally small and conservative
- planning fails on unsupported requests instead of trying to generalize broadly
- iterative orchestration supports early `more`, `less`, and `undo` follow-up behavior, but still relies on explicit version materialization through orchestration dependencies for safe revert execution
- the baseline planner still does not choose pitch shifting, trim silence, channel utilities, or Layer 1 runtime effects automatically
- render preview is MP3-only
- final render export is limited to WAV and FLAC
- compare goal alignment is heuristic and string-driven
- the repository does not yet provide a dedicated demo CLI or application entrypoint
- benchmark coverage is still synthetic-first and not yet tied to committed real audio fixtures or full end-to-end fixture-backed runs

## Practical Interpretation

The repository is well past pure scaffolding. It already contains a usable technical slice for programmatic experimentation and module-level integration.

It is not yet a broad audio-editing platform, a polished end-user product, or a beatmaking system.

## Source Of Truth

When this file disagrees with older high-level docs, prefer:

1. module `src/` exports
2. module `docs/api.md` files
3. module `docs/overview.md` files updated to match current code

Then update the stale high-level doc in the same change.
