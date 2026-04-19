# Audio Fixtures

This directory is reserved for shared audio fixtures used by tests, examples, and benchmarks.

Guidelines:

- Prefer small files when possible.
- Document origin, license, and intended use.
- Separate synthetic fixtures from real-world samples.
- Avoid adding large files unless they are necessary for benchmark coverage.

## Current committed corpus

Phase 1 now includes a small committed request-cycle corpus under `fixtures/audio/phase-1/`.

Benchmark-ready cases:

- `first-slice-loop.wav`: bright, slightly harsh stereo loop used as the shared baseline fixture.
- `first-slice-loop-darker-less-harsh.wav`: supported tonal cleanup candidate for darker / less-harsh requests.
- `first-slice-loop-reduced-brightness.wav`: supported brightness-reduction candidate with transient preservation.
- `first-slice-loop-cleaner.wav`: supported cleanup candidate with lower noise-floor intent.
- `first-slice-loop-peak-controlled.wav`: supported peak-control candidate with preserved punch.

Retained spare control fixture:

- `first-slice-loop-darker-lost-punch.wav`: deterministic regression candidate kept for future negative-control coverage.

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

The benchmark layer now uses this corpus in two ways:

- compare-only cases with curated `ComparisonReport` expectations
- end-to-end request-cycle cases that execute the real orchestration path on the shared source fixture

The committed WAVs anchor provenance and repeatability, while the benchmark expectations stay intentionally conservative and can evolve without changing the fixture ids or paths.
