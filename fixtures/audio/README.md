# Audio Fixtures

This directory is reserved for shared audio fixtures used by tests, examples, and benchmarks.

Guidelines:

- Prefer small files when possible.
- Document origin, license, and intended use.
- Separate synthetic fixtures from real-world samples.
- Avoid adding large files unless they are necessary for benchmark coverage.

## Current committed corpus

Phase 1 now includes a committed cleanup-slice corpus under `fixtures/audio/phase-1/`.

- `first-slice-loop.wav`: bright, slightly harsh stereo loop used as the shared baseline fixture.
- `first-slice-loop-darker-less-harsh.wav`: tonal cleanup candidate for the happy path.
- `first-slice-loop-reduced-brightness.wav`: wording variant candidate for brightness reduction.
- `first-slice-loop-cleaner.wav`: measurable cleanup candidate with lower noise-floor intent.
- `first-slice-loop-darker-lost-punch.wav`: regression candidate used to confirm punch-loss detection.

All committed WAVs are deterministic synthetic assets generated inside the repository, intended to stay tiny and redistributable.

## Source of truth

Use `fixtures/audio/manifest.json` as the source of truth for:

- fixture ids
- relative paths
- audio metadata
- checksums
- provenance and derivation notes
- intended benchmark and integration usage

## Current benchmark boundary

The benchmark harness is now fixture-backed, but the compare-layer expectations remain curated analysis inputs for the current cleanup slice.

That means the committed WAVs anchor corpus provenance and repeatability today, while full analysis-driven benchmark execution can land later without changing fixture ids or paths.
