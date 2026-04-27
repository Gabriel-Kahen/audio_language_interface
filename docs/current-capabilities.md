# Current Capabilities And Limitations

## Purpose

This document records what the repository implements today.

Use it to avoid planning against aspirational architecture docs alone.

## Current Supported Slice

The current repository supports a real single-file natural-language editing slice:

- import one local audio file into workspace storage
- analyze a WAV-backed `AudioVersion`
- derive a conservative `SemanticProfile`
- plan small deterministic edits for a conservative but growing supported request family
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
- `analysis`: deterministic baseline analysis for workspace-local WAV files, including explicit hum/click artifact detection for the current cleanup slice
- `transforms`: deterministic FFmpeg-backed execution for the current runtime operation set
- `render`: preview MP3 rendering plus WAV and FLAC export rendering
- `compare`: metric deltas, small semantic delta vocabulary, regression warnings, structured verification, and `evaluation_basis` metadata

### Intent Layer

- `semantics`: conservative descriptor mapping from `AnalysisReport`
- `planning`: deterministic request parsing and explicit plan generation for supported operations

### Adapters

- `interpretation`: optional provider-backed request normalization that emits richer `IntentInterpretation` artifacts for OpenAI or Google API callers, including an explicit `conservative` vs `best_effort` policy, `next_action`, descriptor hypotheses, constraints, region-intent proposals, alternate candidates, and follow-up interpretation metadata
- `tools`: callable tool registry and request execution for the published tool set
- `orchestration`: composed happy-path workflows and iterative refinement helpers

### Evaluation

- `benchmarks`: fixture-backed compare benchmarks, offline interpretation benchmarks, opt-in live provider interpretation evals, and a real request-cycle benchmark runner for the current supported prompt family

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
- center this more or fix the stereo imbalance, when measured left-right balance is clearly off but still safe to correct conservatively
- denoise or reduce hiss, when steady-noise evidence is strong enough
- explicit loudness normalization through `normalize`
- airier, warmer, less muddy, or less harsh ring through surgical tone-shaping
- tame sibilance, remove explicitly specified `50 Hz` / `60 Hz` hum, or clean up clicks through narrow restoration primitives
- small benchmarked compound prompts within the supported slice, including tonal combinations such as `warmer and airier` or `darker, less harsh, and less muddy` plus a narrow cross-family set such as `speed up by 10% and tame the sibilance`, `tame the sibilance and make it darker`, `center this more and make it wider`, and the current tradeoff-style `make this a little tighter and more controlled, and darker`

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

The baseline planner currently plans only against operations marked `planner_supported` in the runtime capability manifest:

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

The baseline planner now supports a conservative timing-edit slice for explicit boundary-silence trimming, pitch-preserving time stretching, and semitone pitch shifting on material that reads as pitched, plus a narrow stereo/spatial slice for widening, narrowing, and centering already-stereo material when the measured image is safe to adjust conservatively. `pan`, channel-utility and broader stereo-routing operations, the broader transient/control operations, and the new Layer 1 effect operations remain runtime-available without being baseline-planner-selected. The current `transient_shaper` surface is compand-based and best suited to transient-rich material.

### Implemented Tool Surface

- `describe_runtime_capabilities`
- `load_audio`
- `analyze_audio`
- `interpret_request`
- `plan_edits`
- `apply_edit_plan`
- `render_preview`
- `compare_versions`
- `run_request_cycle`

Current tool-surface caveats:

- `apply_edit_plan` supports the published runtime capability surface, including first-cohort `time_range` execution for selected duration-preserving Layer 1 operations, while still validating explicit runtime prerequisites such as stereo-only processing where applicable
- `interpret_request` is optional and provider-backed; it normalizes language into a contract-valid `IntentInterpretation`, accepts explicit session context plus a `conservative` vs `best_effort` policy for fuzzy follow-ups, and does not bypass deterministic planning or verification
- the benchmark layer can now evaluate that interpretation surface directly against real OpenAI and Google calls through an opt-in live benchmark harness; that live path is outside default CI and intended for provider-quality measurement rather than deterministic regression gating
- `plan_edits` only chooses operations marked as `planner_supported` in the runtime capability manifest
- `plan_edits` can accept an optional `intent_interpretation` artifact, but still validates that proposal against current audio evidence and planner support
- `compare_versions` returns `evaluation_basis` so callers can see whether structured verification or fallback goal alignment is authoritative
- `run_request_cycle` exposes the full orchestration editing loop, including session-aware follow-up behavior, optional LLM-assisted request interpretation with explicit timeout and retry settings, and first-class clarification-required results that record `pending_clarification` in the returned `session_graph`
- explicit technical callers can still submit runtime-only Layer 1 effect steps when they stay inside the published contract surface

## Important Current Limitations

- `io` imports local file paths only
- analysis currently requires `.wav` input files on disk
- analysis reads the whole file into memory
- semantic descriptor coverage is intentionally small and conservative
- the optional interpretation layer broadens language handling, but it does not make unsupported descriptors or transforms safe automatically
- the baseline planner now grounds one narrow region-targeting slice for explicit numeric `time_range` wording such as `the first 0.5 seconds` or `from 0.2s to 0.7s`, but it still refuses vague named regions like `intro` and it still refuses region-scoped requests that require full-file-only planner operations
- planning fails on unsupported requests instead of trying to generalize broadly
- iterative editing now supports `more`, `less`, `undo`, `revert to previous version`, and `try another version` through both orchestration and the published `run_request_cycle` tool; those follow-up flows still require explicit historical version materialization rather than hidden adapter-managed state
- conservative interpretation can now stop at a first-class clarification result instead of a planner error, and the next caller-supplied `session_graph` can resume that clarification path explicitly
- the baseline planner still does not choose `pan`, channel remapping, `mid_side_eq`, broader Layer 1 runtime effects, or the creative-effect surface automatically
- render preview is MP3-only
- final render export is limited to WAV and FLAC
- compare now prefers planner-emitted structured verification targets and still keeps heuristic goal alignment only as a legacy fallback
- compare now preserves compound-goal tradeoff detail through `goal_alignment[].verification_rollup` when structured verification rolls multiple targets into one goal
- hum and click analysis evidence now exists in the baseline `AnalysisReport`, and compare now prefers those direct artifact fields before falling back to conservative low-band or clipped-sample proxies
- the repository now provides a narrow alpha CLI entrypoint through `pnpm ali -- ...` for local `edit` and `follow-up` flows, with explicit session directories and no hidden persistence
- benchmark coverage is fixture-backed for the current cleanup slice, including compare-only hum/click isolation cases and a small end-to-end request-cycle corpus focused on stable tonal cleanup, tonal and cross-family compound edits, restoration, timing edits, stereo/spatial edits, the first explicit numeric region-targeting slice, iterative follow-up flows, peak-control, dedicated louder-and-controlled prompts, and clarification/failure controls
- live provider evaluation exists for the interpretation layer, but it is intentionally opt-in and narrower than the deterministic benchmark/reporting path because provider drift, key management, latency, and API cost are part of what that harness is meant to measure

## Practical Interpretation

The repository is well past pure scaffolding. It already contains a usable technical slice for programmatic experimentation and module-level integration.

It is not yet a broad audio-editing platform, a polished end-user product, or a beatmaking system.

## Source Of Truth

When this file disagrees with older high-level docs, prefer:

1. module `src/` exports
2. module `docs/api.md` files
3. module `docs/overview.md` files updated to match current code

Then update the stale high-level doc in the same change.
