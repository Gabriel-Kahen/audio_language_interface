# CLI Overview

## Purpose

Expose a narrow local command-line surface over the already-validated request-cycle path.

This module is intentionally small. It does not invent new planning behavior, new
session semantics, or a second tool protocol. It wraps `modules/orchestration`
into an explicit session-directory workflow for short local audio edits and follow-ups.

## Public API surface

- `runCli(argv, options?)`
- `parseCliArgs(argv, options?)`
- `assertValidCliSessionState(value)` and `loadCliSessionState(sessionDir)`

See `docs/api.md` for the concrete command syntax and session-directory layout.

## Implemented command set

- `ali edit <input-path> <request>`
- `ali follow-up <session-dir> <request>`

Both commands:

- write explicit run artifacts to disk
- keep the orchestration workspace inside the session directory
- can opt into LLM interpretation with explicit provider settings
- can opt into planner best-effort texture fallbacks with `--best-effort`
- return machine-readable JSON summaries when `--json` is set

## Session model

Each CLI session directory contains:

- `workspace/` for runtime-managed imported audio, transformed versions, and renders
- `runs/run-0001/`, `runs/run-0002/`, ... for per-invocation artifacts
- `session.json` for the current explicit session state

That keeps follow-up editing reproducible without hidden global persistence.

## Current limitations

- the CLI only exposes the current narrow request-cycle surface; it does not widen planner support
- `--best-effort` only changes planner refusal behavior for subjective texture wording that can be proxied by conservative tonal softening; it does not enable runtime-only effects or unsafe restoration guesses
- the command set is intentionally small and currently focused on initial edits plus session-aware follow-ups
- output rendering is currently fixed to the existing orchestration final-render path
- the CLI is local-first and does not provide service hosting, job queues, or multi-user persistence
- clarification-required results are surfaced explicitly and still require a second follow-up command from the caller

## Dependencies

- `modules/orchestration`
- `modules/core`
- `modules/history`

## Downstream consumers

- local maintainers
- contributors testing the repo surface
- future demos or wrappers that want one obvious local entrypoint
