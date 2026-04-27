# CLI Module Agent Guide

## Mission

Own the narrow command-line user surface for Audio Language Interface.

## Architectural role

`cli` is a thin adapter over `modules/orchestration` for local human and agent use.

It should make the validated request-cycle surface easy to try without adding hidden
state, alternate planning rules, or a second workflow engine.

## Owns

- command parsing and help text
- explicit session-directory layout
- persistence of run artifacts for local inspection
- concise human and machine-readable summaries

## Inputs

- local file paths
- user request strings
- optional LLM interpretation settings
- explicit session directories for follow-up work

## Outputs

- CLI exit codes
- terminal summaries
- explicit session and run artifact files

## Must not own

- core audio-processing logic
- interpretation, planning, or compare policy that belongs in lower modules
- hidden persistence outside the caller-chosen session directory

## Coordination rules

- call `modules/orchestration` through its published entrypoints
- keep the session layout explicit and documented
- persist enough artifacts that follow-ups remain inspectable and reproducible
- stay honest about current support limits

## Deliverables

- a local `ali` CLI entrypoint
- module docs for command behavior and session layout
- tests for the narrow supported command set

## Success criteria

A caller can run one obvious local command, inspect the resulting session directory,
and continue with explicit follow-up requests without needing hidden service state.
