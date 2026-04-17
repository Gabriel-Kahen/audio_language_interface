# Describe Runtime Capabilities Tool

## Purpose

`describe_runtime_capabilities` exposes the published `RuntimeCapabilityManifest` through the tool layer.

It gives LLM callers and other adapters a stable way to discover:

- which deterministic runtime operations exist
- which operations are planner-supported today
- what target scopes and parameter surfaces are valid

## Request shape

The request uses the common `ToolRequest` envelope with:

- `tool_name = "describe_runtime_capabilities"`
- `arguments = {}`

This tool is not tied to a specific asset or version, so `asset_id` and `version_id` are optional and typically omitted.

## Success response

On success, `result.runtime_capability_manifest` contains a contract-valid `RuntimeCapabilityManifest`.

## Failure behavior

The tool follows the shared `ToolResponse` envelope and may return:

- `invalid_arguments`
- `invalid_result_contract`
- `handler_failed`

## Notes

This tool is an adapter-layer discovery surface. It does not execute DSP and it does not replace `describeTools()`.
