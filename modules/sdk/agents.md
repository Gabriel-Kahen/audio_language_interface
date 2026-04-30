# SDK Module Agent Guide

## Mission

Own the stable TypeScript entry point for application developers using the engine.

## Architectural role

`sdk` is an adapter layer above `orchestration`. It gives commercial apps and external callers a stable, small API without requiring them to reach into module internals.

## Owns

- public SDK construction and session APIs
- in-memory session state needed to run follow-up requests explicitly
- application-facing result shapes that expose canonical engine artifacts
- SDK usage documentation and integration tests

## Inputs

- local audio input paths
- user edit and follow-up requests
- optional orchestration dependency overrides for tests or alternate runtimes

## Outputs

- canonical artifacts such as `AudioAsset`, `AudioVersion`, `EditPlan`, `TransformRecord`, `RenderArtifact`, `ComparisonReport`, and `SessionGraph`

## Must not own

- planning policy beyond forwarding explicit options
- transform implementation details
- product-specific persistence, accounts, jobs, or UI state
- alternate schemas for canonical artifacts

## Coordination rules

- depend on published orchestration/core/history contracts instead of lower-level private internals
- keep SDK state inspectable through public accessors
- expose dependency injection narrowly for tests and host applications
- update docs and integration tests with any public API change

## Success criteria

Application code can import `createAudioLanguageSession` from `@audio-language-interface/sdk`, run edits and follow-ups, render or compare versions, and receive canonical artifacts without depending on internal module paths.
