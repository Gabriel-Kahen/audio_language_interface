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

## Next request-cycle sources

Phase 1 also now includes small committed source fixtures for the next request-cycle benchmark families:

- `request-cycle-sibilance-source.wav`: mono tonal bed with short high-frequency bursts for de-essing / sibilance-control prompts.
- `request-cycle-hum-60hz-source.wav`: mono tonal bed with steady 60 Hz, 120 Hz, and 180 Hz contamination for explicit dehum prompts.
- `request-cycle-clicks-source.wav`: mono 44.1 kHz sparse-click source aligned with the current analysis click-detector recipe for declip / declick / pop-cleanup prompts.
- `request-cycle-loudness-control-source.wav`: mono transient-heavy source reserved for pure peak-control prompts such as `control the peaks without crushing it`.
- `request-cycle-louder-controlled-source.wav`: mono sustained harmonic source for `make it louder and more controlled` request-cycle benchmarks.

These are benchmark-oriented source inputs rather than precomputed candidate outputs. They are intentionally tiny, deterministic, CC0-style synthetic assets so they can be committed and redistributed freely.

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
