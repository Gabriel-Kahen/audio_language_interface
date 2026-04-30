# SDK Overview

## Purpose

`@audio-language-interface/sdk` is the stable application-facing TypeScript entry point for the engine.

It wraps the existing orchestration workflows without replacing them. Host applications should use the SDK instead of reaching into `modules/orchestration`, `modules/tools`, or lower-level runtime modules directly.

## Basic usage

```ts
import { createAudioLanguageSession } from "@audio-language-interface/sdk";

const session = await createAudioLanguageSession({
  workspaceDir: "./ali-workspace",
});

const result = await session.edit({
  input: "./loop.wav",
  request: "make it warmer and less harsh",
});

if (result.resultKind === "applied") {
  console.log(result.outputVersion);
  console.log(result.editPlan?.steps.map((step) => step.operation));
  console.log(result.renderArtifact.output.path);
  console.log(result.comparisonReport.summary.plain_text);
}
```

Variant generation is available through the same entry point:

```ts
const variants = await session.edit({
  input: "./loop.wav",
  request: "make this darker but keep the punch",
  variants: 3,
});

if (variants.resultKind === "variants_generated") {
  for (const variant of variants.variants) {
    console.log(variant.label, variant.rank, variant.previewRender.output.path);
  }
}
```

Relative `workspaceDir` and `input` paths resolve against `cwd`, which defaults to `process.cwd()`.

## Public session API

`createAudioLanguageSession(options)` returns an `AudioLanguageSession` with these methods:

- `importAudio({ input, importOptions? })`: import and analyze an audio file, initialize session state, and return `AudioAsset`, `AudioVersion`, `AnalysisReport`, and `SessionGraph`.
- `edit({ input, request, ...options })`: import an input file, run the full request cycle, and update session state. When `variants` is `1`, `2`, or `3`, it runs deterministic variant generation instead of the single-output request cycle.
- `followUp({ request, ...options })`: run a follow-up request such as `more`, `less`, `undo`, or a new edit request against the current session state.
- `render({ version?, kind?, options? })`: render the provided version, or the current session version, and return a `RenderArtifact`.
- `compare({ baselineVersion?, candidateVersion?, ...options })`: compare two versions, defaulting to the last edit input and current version, and return a `ComparisonReport`.
- `getState()`: return the current explicit session state, including available `AudioVersion` artifacts and the current `SessionGraph`.

## Returned artifacts

SDK edit and follow-up results expose canonical artifacts rather than product-specific wrapper objects:

- `asset`: `AudioAsset`
- `inputVersion`: `AudioVersion`
- `outputVersion`: `AudioVersion` for applied or reverted results
- `editPlan`: `EditPlan` when the cycle planned a transform
- `transformRecord`: `TransformRecord` when the cycle applied a transform
- `renderArtifact`: the candidate `RenderArtifact`
- `comparisonReport`: the version-to-version `ComparisonReport`
- `renderComparisonReport`: the render-to-render `ComparisonReport`
- `sessionGraph`: `SessionGraph`

Variant results expose one candidate object per generated option:

- `label`: `subtle`, `balanced`, or `stronger`
- `editPlan`: generated `EditPlan`
- `outputVersion`: candidate `AudioVersion`
- `previewRender`: preview `RenderArtifact`
- `transformRecord`: candidate `TransformRecord`
- `comparisonReport`: version-to-version `ComparisonReport`
- `rationale`, `warnings`, `rank`, and `isRecommended`

The raw orchestration result is also available as `rawResult` for advanced callers, but product code should prefer the canonical top-level artifacts.

## Session state

The SDK keeps only the explicit state needed for follow-ups:

- current `AudioAsset`
- current `AudioVersion`
- current `SessionGraph`
- available `AudioVersion` artifacts for undo, less, and alternate-version requests
- last edit input and output analyses for default comparison calls

For variant generation, the SDK records all variant output versions and sets the current version to the conservative recommended variant. Applications that want a different candidate should use the returned variant artifacts explicitly.

This is intentionally not durable product persistence. Applications that need durable sessions should store the returned canonical artifacts and recreate their own state model around them.

## Options

Session-level defaults can be set once on `createAudioLanguageSession` and overridden per edit or follow-up:

- `renderKind`: `preview` or `final`; defaults to `final`
- `interpretation`: opt-in LLM-assisted interpretation options
- `planningPolicy`: deterministic planner policy such as `best_effort`
- `revision`: optional one-extra-pass revision policy
- `dependencies`: orchestration dependency overrides for tests or alternate runtimes
- `failurePolicy`: orchestration retry policy

Per-call `edit()` also accepts `variants: 1 | 2 | 3`. The profile set is deterministic:

- `1`: `balanced`
- `2`: `subtle`, `balanced`
- `3`: `subtle`, `balanced`, `stronger`

Variant calls always produce preview renders and do not run revision passes. Passing `renderKind` or `revision` with `variants` is rejected so those options are not silently ignored.

The SDK forwards these options to orchestration. It does not add hidden planning support, hidden transform support, or alternate capability discovery.

## Variant limits and non-goals

- Variants only apply to fresh `edit({ input, request, variants })` calls today; follow-up variant generation is intentionally out of scope.
- Variants are strength profiles over the same deterministic planner interpretation. They are not random generations and do not invent new creative effects.
- Ranking is conservative: severe regressions and unmet verification targets are penalized before stronger edits are preferred.
- Each variant starts from the same imported input version, so candidates are A/B/C alternatives rather than cumulative edits.

## Boundary rules

`sdk` depends on published adapter and artifact contracts:

- orchestration entry points and dependency injection
- core artifact types
- history `SessionGraph`
- planning `PlanningPolicy` type
- transform `TransformRecord` type

It must not depend on private planning, transform, render, analysis, or compare implementation details.
