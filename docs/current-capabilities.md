# Current Capabilities And Limitations

## Purpose

This document records what the repository implements today.

Use it to avoid planning against aspirational architecture docs alone.

## Current supported slice

The current repository supports a first end-to-end slice for single-file audio editing:

- import one local audio file into workspace storage
- analyze a WAV-backed `AudioVersion`
- derive a conservative `SemanticProfile`
- plan small deterministic edits for a narrow prompt family
- apply deterministic FFmpeg-backed transforms
- render preview and limited export artifacts
- compare baseline and candidate versions or renders
- record provenance in a `SessionGraph`
- access the flow through `tools` or `orchestration`

The repository is now in an early Phase 2 state: the runtime layer supports a broader internal transform set than the external tool surface currently exposes.

## What works today

### Runtime modules with implemented `src/`

- `core`: canonical `AudioAsset` and `AudioVersion` helpers plus schema-backed validation
- `io`: local file import, metadata inspection, optional WAV normalization, source-ref validation
- `analysis`: deterministic baseline analysis for workspace-local WAV files
- `semantics`: conservative descriptor mapping from `AnalysisReport`
- `planning`: deterministic request parsing and explicit plan generation for supported operations
- `transforms`: deterministic FFmpeg-backed execution for the current small operation set
- `render`: preview MP3 rendering plus WAV and FLAC export rendering
- `compare`: metric deltas, small semantic delta vocabulary, regression warnings, and goal checks
- `history`: explicit session graph, provenance, branch, snapshot, revert, undo, and redo helpers
- `tools`: callable tool registry and request execution for the currently exposed tool set
- `orchestration`: composed happy-path workflows and iterative refinement helpers

### Implemented support modules

- `benchmarks`: first-slice prompt suite, scoring helpers, a benchmark harness, and markdown report formatting

## Current prompt and operation scope

### Best-supported prompt family

- darker
- less harsh
- slightly cleaner
- preserve punch
- more controlled
- control peaks

Partially supported or runtime-only Phase 2 areas:

- wider or narrower, when stereo evidence is safe enough
- denoise or reduce hiss, when steady-noise evidence is strong enough

### Implemented transform operations

- `gain`
- `normalize`
- `trim`
- `fade`
- `parametric_eq`
- `high_pass_filter`
- `low_pass_filter`
- `compressor`
- `limiter`
- `stereo_width`
- `denoise`

### Implemented tool surface

- `load_audio`
- `analyze_audio`
- `apply_edit_plan`
- `render_preview`
- `compare_versions`

Current tool-surface caveat:

- `apply_edit_plan` currently supports the narrower runtime subset through the exposed tool contract and does not yet fully open every Phase 2 runtime operation externally

## Important current limitations

- `io` imports local file paths only
- analysis currently requires `.wav` input files on disk
- analysis reads the whole file into memory
- semantic descriptor coverage is intentionally small and conservative
- planning fails on unsupported requests instead of trying to generalize broadly
- tool exposure still lags behind the full runtime transform surface
- iterative orchestration currently supports only an early subset of follow-up behavior, with `more` being the most complete path today
- transforms still do not cover pitch shifting or time stretching
- render preview is MP3-only
- final render export is limited to WAV and FLAC
- compare goal alignment is heuristic and string-driven
- the tool surface does not expose `plan_edits`, even though `modules/planning` has a runtime API
- the repository does not yet provide a dedicated demo CLI or application entrypoint
- benchmark coverage is still synthetic-first and not yet tied to committed real audio fixtures or full end-to-end fixture-backed runs

## Practical interpretation

The repository is past pure scaffolding. It already contains a usable first technical slice for programmatic experimentation and module-level integration.

It is not yet a broad audio-editing platform, a polished external product, or a feature-complete orchestration stack.

## Source of truth

When this file disagrees with older high-level docs, prefer:

1. module `src/` exports
2. module `docs/api.md` files
3. module `docs/overview.md` files updated to match current code

Then update the stale high-level doc in the same change.
