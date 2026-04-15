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
