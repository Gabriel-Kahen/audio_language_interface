# ToolRequest

## Purpose

Represents an external tool invocation into the platform.

## Producers

- external LLM tool callers
- `modules/orchestration` when one tool composes another

## Consumers

- `modules/tools`

## Required fields

| Field | Type | Description |
| --- | --- | --- |
| `schema_version` | string | Contract version identifier. |
| `request_id` | string | Stable request identifier. |
| `tool_name` | string | Name of the requested tool. |
| `arguments` | object | Tool-specific argument payload. |
| `requested_at` | string | ISO 8601 UTC timestamp. |

## Optional fields

| Field | Type | Description |
| --- | --- | --- |
| `session_id` | string | Current session identifier. |
| `asset_id` | string | Related asset identifier when known. |
| `version_id` | string | Related version identifier when known. |
| `caller` | string | Human or system caller identifier. |

## Invariants

- `tool_name` must correspond to a published tool.
- `arguments` must be machine-readable and self-contained.
- Requests must not rely on hidden prior state when identifiers are required.

## Tool payload policy

The base contract validates only the shared envelope. The `tools` module validates tool-specific `arguments` separately, including published contract-bearing payloads such as `AudioVersion`, `AnalysisReport`, and `EditPlan` where applicable.

## Example

See `contracts/examples/tool-request.json`.
