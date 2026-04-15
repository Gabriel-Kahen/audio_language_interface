# Audio Fixtures

This directory is reserved for shared audio fixtures used by tests, examples, and benchmarks.

Guidelines:

- Prefer small files when possible.
- Document origin, license, and intended use.
- Separate synthetic fixtures from real-world samples.
- Avoid adding large files unless they are necessary for benchmark coverage.

Current Phase 1 scaffolding is manifest-first. Until small redistributable WAV binaries are checked in, integration work should use `fixtures/audio/manifest.json` as the source of truth for provenance, intended prompts, and acquisition or generation steps.
