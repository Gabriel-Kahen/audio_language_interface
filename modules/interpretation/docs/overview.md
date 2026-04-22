# Interpretation Overview

## Purpose

Interpret user audio-edit requests through an optional LLM-backed layer that produces a structured `IntentInterpretation`.

This module does not emit an `EditPlan`. It captures a bounded interpretation proposal that deterministic planning can validate or reject.

## Public API surface

- `interpretRequest(options) => Promise<IntentInterpretation>`
- `assertValidIntentInterpretation(artifact)` and `isValidIntentInterpretation(artifact)` for contract checks

See `docs/api.md` for the concrete API shape and failure behavior.

## Implemented source files

- `src/interpret-request.ts`: top-level interpretation entrypoint
- `src/prompts.ts`: deterministic prompt construction from request and current audio state
- `src/provider.ts`: provider selection
- `src/providers/openai.ts`: fetch-based OpenAI implementation
- `src/providers/google.ts`: fetch-based Google implementation
- `src/validation.ts`: candidate and contract validation
- `src/index.ts`: public exports only

## Dependencies

- `modules/core`
- `modules/analysis`
- `modules/capabilities`
- `modules/semantics`
- `IntentInterpretation` contract

## Downstream consumers

- `modules/orchestration` for optional request interpretation before deterministic planning
- `modules/tools` for explicit adapter-surface interpretation calls
- tests or benchmarks comparing interpretation output across providers

## Non-goals

- replace the deterministic planner
- emit executable transform parameters
- hide provider failure modes
- infer semantic descriptor meaning without the deterministic evidence layer

## Initial implementation notes

- the module uses provider config rather than SDK-specific adapters
- supported providers use direct `fetch` calls, not provider SDKs
- the module validates both the provider-returned JSON payload and the final `IntentInterpretation`
- interpretation stays optional and above deterministic planning
