# Integration Setup

This directory holds stable setup artifacts for the first supported happy path.

Current contents:

- `happy-path-workflow.json`: references the shared source fixture in `fixtures/audio/manifest.json` and the contract example chain used by integration validation.

The happy-path setup is intentionally aligned with the benchmarks cleanup corpus:

- integration keeps the source fixture id stable
- benchmarks reuse that same source fixture as the cleanup-slice baseline
- drift between the happy-path setup, committed fixtures, and benchmark corpus should fail tests
