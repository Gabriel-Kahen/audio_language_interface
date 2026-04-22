# Interpretation API

## Scope

This document describes the implemented public API in `modules/interpretation/src/index.ts`.

## Entry points

### `interpretRequest(options)`

Builds a validated `IntentInterpretation` from:

- `userRequest`
- `audioVersion`
- `analysisReport`
- `semanticProfile`
- optional `capabilityManifest`
- provider config for `openai` or `google`
- optional `policy`
- optional `promptVersion`
- optional `sessionContext`
- optional `cacheStore`

Current behavior:

- validates inbound `AudioVersion`, `AnalysisReport`, and `SemanticProfile`
- checks provenance consistency across those source artifacts
- builds deterministic prompts from the request and current audio context
- requests structured JSON from the selected provider
- validates the returned JSON against the module’s candidate schema
- normalizes the returned JSON into the published `IntentInterpretation` contract
- schema-validates the final artifact
- records explicit `interpretation_policy`, `next_action`, descriptor hypotheses, constraints, region-intent proposals, alternate interpretations, and follow-up metadata when the provider returns them
- can reuse explicit cache entries when a caller supplies `cacheStore`
- records provider cache and latency metadata in `artifact.provider.cached` and `artifact.provider.response_ms`

Policy behavior:

- `conservative` is the default and allows grounded ambiguity to stay `next_action = "clarify"`
- `best_effort` prefers one planner-facing interpretation for ordinary ambiguity, keeps ambiguity metadata explicit, and should reserve `refuse` for unsupported, unsafe, or planner-disabled requests

### `assertValidIntentInterpretation(artifact)`

Throws if a payload fails the published `IntentInterpretation` contract.

### `isValidIntentInterpretation(artifact)`

Returns `true` when a payload satisfies the published `IntentInterpretation` contract.

## Public types

`src/index.ts` re-exports:

- `IntentInterpretation`
- `InterpretationNextAction`
- `InterpretationPolicy`
- `DescriptorHypothesis`
- `InterpretationConstraint`
- `RegionIntent`
- `FollowUpIntent`
- `InterpretationAlternative`
- `InterpretationSessionContext`
- `InterpretRequestOptions`
- `InterpretationProviderConfig`
- `InterpretationProviderKind`
- `InterpretationCacheStore`
- `MemoryInterpretationCache`

## Current limitations

- this module interprets request text only; it does not inspect raw audio directly
- the module does not emit executable transform parameters or `EditPlan` steps
- provider support is currently limited to fetch-based OpenAI and Google calls
- determinism applies to prompt shaping, validation, and artifact normalization, not to remote model behavior
- alternate `candidate_interpretations` are for inspection only; deterministic planning still consumes one selected interpretation
