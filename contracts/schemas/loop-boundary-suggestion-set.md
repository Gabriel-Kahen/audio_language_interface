# LoopBoundarySuggestionSet Schema

## Purpose

Define the standalone machine-readable output emitted by
`modules/analysis` `suggestLoopBoundaries(...)`.

## Shape

```json
{
  "schema_version": "1.0.0",
  "loop_boundary_suggestion_id": "loopbounds_01EXAMPLE0123456789ABCD",
  "asset_id": "asset_01HZX8A7J2V3M4N5P6Q7R8S9T0",
  "version_id": "ver_01HZX8B7J2V3M4N5P6Q7R8S9T0",
  "generated_at": "2026-04-16T12:00:10Z",
  "detector": {
    "name": "default-analysis",
    "version": "0.1.3"
  },
  "suggestions": [
    {
      "start_seconds": 0,
      "end_seconds": 0.5,
      "duration_seconds": 0.5,
      "confidence": 0.88,
      "rationale": "Detected a 0.5s region that repeats in adjacent audio with 94% similarity and anchor support score 89%."
    }
  ]
}
```

## Required fields

- `schema_version`
- `loop_boundary_suggestion_id`
- `asset_id`
- `version_id`
- `generated_at`
- `detector`
- `suggestions`

## Field semantics

- `loop_boundary_suggestion_id`: deterministic identifier for this suggestion run.
- `detector`: analysis implementation name/version that produced the suggestions.
- `suggestions`: ordered loop candidates in descending preference.

Each suggestion contains:

- `start_seconds`
- `end_seconds`
- `duration_seconds`
- `confidence`
- `rationale`

## Notes

- Suggestions are conservative and may be an empty array.
- This payload is separate from `AnalysisReport` so downstream consumers can
  reason about candidate loop spans explicitly.
