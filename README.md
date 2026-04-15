# Audio Language Interface

Audio Language Interface is an audio manipulation platform for LLMs.

The project is not a music creation tool. It is a modular system that lets language models inspect audio, plan changes, apply deterministic edits, compare results, and iterate toward a user's requested sound.

## Project goals

- Give LLMs a reliable tool surface for modifying sound.
- Keep every module independently usable outside the full pipeline.
- Make contracts explicit so separate agents can build modules in parallel.
- Keep the repository easy to modify, document, and extend as an open source project.

## Pipeline

The intended pipeline is:

1. `io` loads and validates audio.
2. `core` provides the canonical in-memory and serialized data models.
3. `analysis` extracts measurable facts from the audio.
4. `semantics` converts measurements into interpretable descriptors.
5. `planning` turns user intent plus analysis into an edit plan.
6. `transforms` executes deterministic audio edits.
7. `render` produces previews and exportable outputs.
8. `compare` measures deltas between versions.
9. `history` tracks versions, branches, and provenance.
10. `tools` exposes the platform to LLM tool callers.
11. `orchestration` coordinates end-to-end workflows.
12. `benchmarks` evaluates module quality and pipeline reliability.

Every step must also work independently.

## Repository layout

```text
.
|-- AGENTS.md
|-- README.md
|-- contracts/
|   |-- examples/
|   `-- schemas/
|-- docs/
|   `-- architecture.md
|-- fixtures/
|   `-- audio/
|-- modules/
|   |-- analysis/
|   |-- benchmarks/
|   |-- compare/
|   |-- core/
|   |-- history/
|   |-- io/
|   |-- orchestration/
|   |-- planning/
|   |-- render/
|   |-- semantics/
|   |-- tools/
|   `-- transforms/
`-- tests/
    `-- integration/
```

Each module contains:

- `agents.md`: module-specific agent instructions and ownership rules.
- `src/`: implementation code.
- `tests/`: module tests.
- `docs/`: module-local design notes and developer documentation.

## Start here

- Read `AGENTS.md` for repository-wide agent rules.
- Read `docs/architecture.md` for the module map and pipeline contract.
- Read `docs/repository-map.md` for the purpose of the current scaffolding files.
- Read `docs/implementation-plan.md` for agent rollout and dependencies.
- Read `docs/dependency-policy.md` for approved dependencies and license rules.
- Read `docs/system-dependencies.md` for Node and FFmpeg expectations.
- Read the target module's `agents.md` before editing that module.

## Validation

The main repository validation loop is:

```bash
pnpm validate:schemas
pnpm lint
pnpm typecheck
pnpm test
```

To run the full local CI-equivalent command:

```bash
pnpm run ci
```

See `docs/testing.md` for the testing layout, module-local commands, and CI behavior.

## Local setup

1. Install the required system tools described in `docs/system-dependencies.md`.
2. Install workspace dependencies with `pnpm install`.
3. Validate the current repository state before making changes:

```bash
pnpm validate:schemas
pnpm lint
pnpm typecheck
pnpm test
```

These commands check the contract layer, formatting and lint rules, TypeScript configuration, and the current test suite.

## Contributor workflow

1. Read the root docs listed above.
2. Read the target module's `agents.md` and `docs/overview.md`.
3. If your change affects cross-module data, update the contract spec in `contracts/schemas/` and the matching example payload in `contracts/examples/` in the same change.
4. Run the relevant validation commands before finishing.

Repository-level contract changes should keep the human-readable schema spec, machine-readable JSON Schema, and example payload aligned.

## Contract-first development

Cross-module communication should happen through explicit artifacts stored under `contracts/`.

Expected artifact families:

- `AudioAsset`
- `AudioVersion`
- `AnalysisReport`
- `SemanticProfile`
- `EditPlan`
- `TransformRecord`
- `RenderArtifact`
- `ComparisonReport`
- `SessionGraph`
- `ToolRequest`
- `ToolResponse`

The repository already includes initial contract specs, JSON Schemas, and example payloads, and is structured so those contracts can expand without reorganizing the project.

Initial contract specs and example payloads now live under `contracts/schemas/` and `contracts/examples/`.

For each contract family:

- `contracts/schemas/*.md` explains intent and field semantics.
- `contracts/schemas/json/*.schema.json` provides the machine-readable JSON Schema.
- `contracts/examples/*.json` provides a minimal valid example payload.

Run `pnpm validate:schemas` after changing any of those files. The validator checks every `*.schema.json` file except `common.schema.json` against the same-named example payload in `contracts/examples/`.
