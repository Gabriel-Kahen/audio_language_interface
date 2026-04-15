# ToolResponse

## Purpose

Represents the normalized response returned by the platform tool layer.

## Producers

- `modules/tools`

## Consumers

- external LLM tool callers
- `modules/orchestration`

## Required fields

| Field | Type | Description |
| --- | --- | --- |
| `schema_version` | string | Contract version identifier. |
| `request_id` | string | Matching request identifier. |
| `tool_name` | string | Name of the responding tool. |
| `status` | string | One of `ok` or `error`. |
| `completed_at` | string | ISO 8601 UTC timestamp. |

## Optional fields

| Field | Type | Description |
| --- | --- | --- |
| `result` | object | Tool-specific response payload for successful calls. |
| `warnings` | array of string | Non-fatal issues worth surfacing. |
| `error.code` | string | Stable error code. |
| `error.message` | string | Human-readable error. |
| `error.details` | object | Optional machine-readable error payload. |

## Invariants

- `request_id` must match the triggering `ToolRequest`.
- `status = error` must include an `error` object.
- `status = ok` should omit the `error` object.

## Tool payload policy

The base contract validates only the shared envelope. Tool-specific `result` payloads are defined by the callable tool surface and may contain published contract objects such as an `AnalysisReport` under `result.report`.

The base contract also allows machine-readable `error.details` payloads so tool-layer implementations can distinguish unsupported operations, provenance mismatches, and internal contract drift without changing the shared response envelope.

## Example

See `contracts/examples/tool-response.json`.
