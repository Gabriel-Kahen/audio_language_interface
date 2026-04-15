# Tools Module Agent Guide

## Mission

Own the LLM-facing tool interface for the platform.

## Pipeline role

`tools` is the stable adapter between external model callers and the internal module graph.

## Owns

- tool definitions and request validation
- stable response envelopes
- mapping from tool calls to internal module operations
- error reporting suitable for LLM consumption
- capability discovery and tool documentation

## Inputs

- external `ToolRequest` payloads
- internal module outputs needed to satisfy tool calls

## Outputs

- `ToolResponse` payloads
- documented tool surface for LLMs and integrators

## Must not own

- deep business logic that belongs in lower-level modules
- hidden orchestration policy that should live in `orchestration`
- module-private contracts redefined at the tool boundary

## Coordination rules

- keep tool APIs explicit, inspectable, and versionable
- surface errors and warnings clearly
- avoid collapsing multiple responsibilities into opaque tool calls

## Deliverables

- tool registry or equivalent definitions
- request and response contracts
- tests for validation, routing, and error behavior

## Success criteria

An LLM can call the platform through a small, stable, well-documented tool surface without needing to know internal implementation details.
