# Interpretation Module Guide

## Purpose

`interpretation` is the optional provider-backed request-normalization layer above deterministic planning.

It turns open-ended language into a bounded `IntentInterpretation` artifact that downstream deterministic modules can validate.

It does not own planning, semantics, compare, or session history.

## Boundary rules

- This module may consume:
  - `AnalysisReport`
  - `SemanticProfile`
  - `RuntimeCapabilityManifest`
  - `AudioVersion`
- This module must not:
  - emit `EditPlan` steps
  - reach into planner or transform internals
  - redefine semantic descriptors dynamically
  - persist hidden provider state

## Design requirements

- provider support must stay explicit and swappable
- remote calls must remain optional
- prompts must send compact structured context, not raw audio
- output must be normalized into the published `IntentInterpretation` contract
- provider failures must stay visible; do not hide them behind fallback heuristics

## Documentation requirements

- keep `docs/overview.md` and `docs/api.md` aligned with the actual exported module API
- if the artifact contract changes, update `contracts/schemas/intent-interpretation.md` and the JSON schema in the same change

## Testing expectations

- unit-test OpenAI and Google provider parsing with mocked fetch responses
- test malformed JSON and malformed candidate payload failure paths
- test provenance validation and final artifact contract validation
