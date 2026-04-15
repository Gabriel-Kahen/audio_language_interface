# Integration Tests

This directory is reserved for cross-module tests.

Use it for workflows that verify published contracts and pipeline composition, not for module-private behavior.

Typical targets:

- `io -> analysis`
- `analysis -> semantics`
- `planning -> transforms`
- `transforms -> render -> compare`
- `history` behavior across multiple versions
- `tools` and `orchestration` end-to-end flows

Current Phase 1 setup artifacts live under `tests/integration/setup/` and are intended to give integration agents a stable happy-path dataset before all runtime modules are fully wired together.
