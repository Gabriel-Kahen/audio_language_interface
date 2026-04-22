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
- optional `promptVersion`

Current behavior:

- validates inbound `AudioVersion`, `AnalysisReport`, and `SemanticProfile`
- checks provenance consistency across those source artifacts
- builds deterministic prompts from the request and current audio context
- requests structured JSON from the selected provider
- validates the returned JSON against the module’s candidate schema
- normalizes the returned JSON into the published `IntentInterpretation` contract
- schema-validates the final artifact

### `assertValidIntentInterpretation(artifact)`

Throws if a payload fails the published `IntentInterpretation` contract.

### `isValidIntentInterpretation(artifact)`

Returns `true` when a payload satisfies the published `IntentInterpretation` contract.

## Public types

`src/index.ts` re-exports:

- `IntentInterpretation`
- `InterpretRequestOptions`
- `InterpretationProviderConfig`
- `InterpretationProviderKind`

## Current limitations

- this module interprets request text only; it does not inspect raw audio directly
- the module does not emit executable transform parameters or `EditPlan` steps
- provider support is currently limited to fetch-based OpenAI and Google calls
- determinism applies to prompt shaping, validation, and artifact normalization, not to remote model behavior
