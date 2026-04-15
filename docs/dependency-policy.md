# Dependency Policy

## Goal

Keep the project easy to adopt, easy to redistribute, and safe for open source collaboration.

## Preferred license families

The repository should strongly prefer dependencies under these licenses:

- `MIT`
- `BSD-2-Clause`
- `BSD-3-Clause`
- `Apache-2.0`
- `ISC`

These are the default-allowed licenses for both direct dependencies and recommended optional integrations.

## Avoid by default

Do not add new direct dependencies under these license families without an explicit maintainer decision:

- `GPL`
- `AGPL`
- strong copyleft variants with network or redistribution obligations

Also avoid:

- archived projects for core runtime paths
- abandoned wrappers around active underlying tools when a thin in-repo adapter is practical

## Current approved baseline dependencies

### Core tooling

- `typescript`
- `vitest`
- `@biomejs/biome`
- `ajv`
- `ajv-formats`
- `json-schema-to-ts`

### Runtime-support libraries

- `execa`
- `music-metadata`
- `wavefile`
- `meyda`

## External tools

The platform may rely on system-installed tools when they are the most practical option.

Current approved external tools:

- `ffmpeg`
- `ffprobe`

These are treated as system dependencies rather than vendored JavaScript libraries.

## Explicitly avoided for the initial implementation

- `fluent-ffmpeg`: archived
- `ffmpeg-static`: avoid vendored binary distribution and GPL complications in the repo baseline
- `ffmpeg.wasm` as the primary backend runtime
- `Tone.js` as a core platform dependency
- `aubio`, `essentia`, `essentia.js`, and `rubberband` in the main implementation path because of GPL or AGPL licensing

## Optional future review candidates

These may be reconsidered later if their value clearly outweighs integration and licensing cost:

- `rnnoise`
- `libsndfile`

## Review rules for new dependencies

Every new dependency proposal should document:

- package purpose
- target module
- license
- maintenance status
- why existing approved dependencies are insufficient
- whether the dependency is required at runtime, dev-time, or only for benchmarks

## Module guidance

- `io` should prefer `music-metadata`, `wavefile`, and direct `ffprobe` integration before reaching for heavier libraries.
- `analysis` should prefer deterministic in-repo analyzers plus `meyda` where it maps cleanly to the published contract.
- `transforms` and `render` should prefer thin wrappers around external tools rather than opaque, archived wrapper packages.
- `compare` should reuse published analysis outputs instead of introducing new feature-extraction dependencies unless necessary.
