# CLI API

## Commands

### `ali edit <input-path> <request>`

Creates a new explicit session directory, imports the source audio into
`session-dir/workspace`, runs one request cycle, and writes run artifacts to
`session-dir/runs/run-0001/`.

Supported options:

- `--session-dir <path>`: explicit session directory. Defaults to a new timestamped directory under the current working directory.
- `--output <path>`: optional convenience copy of the final rendered output.
- `--json`: print a machine-readable summary instead of human text.
- `--best-effort`: opt into planner best-effort mode for subjective texture wording. This can produce a conservative tonal-softening proxy instead of refusing phrases such as `less distorted` when direct clipping evidence is missing.
- `--llm-provider <openai|google|codex_cli>`
- `--llm-model <model>`: required for `openai` and `google`, optional for `codex_cli`
- `--llm-api-key <key>`: required for `openai` and `google`
- `--llm-policy <conservative|best_effort>`
- `--llm-timeout-ms <milliseconds>`
- `--llm-max-retries <count>`
- `--llm-api-base-url <url>`
- `--llm-codex-path <path>`
- `--llm-codex-profile <profile>`
- `--llm-prompt-version <id>`

### `ali follow-up <session-dir> <request>`

Loads the explicit state from `session-dir/session.json`, reuses the session
workspace, and runs a follow-up request against the current version.

Supported options:

- `--output <path>`
- `--json`
- `--best-effort`
- the same `--llm-*` interpretation flags supported by `edit`

Follow-up requests can include:

- direct new supported requests
- iterative shorthand such as `more`, `less`, `undo`, `revert to previous version`, `try another version`, or `retry`
- clarification answers when the previous run returned `clarification_required`

## Run artifacts

Each run directory contains a narrow set of explicit artifacts:

- `summary.json`
- `request.txt`
- `request-cycle-result.json`
- `session-graph.json`
- `edit-plan.json` when planning succeeded
- `intent-interpretation.json` when interpretation was used
- `version-comparison-report.json` and `render-comparison-report.json` when a final comparison exists
- `output.<ext>` when a final rendered output exists

## Exit behavior

- `0` for successful applied, reverted, or clarification-required request-cycle results
- non-zero for invalid arguments, unreadable session state, or orchestration/runtime failures

## Session state

`session.json` is an internal but explicit CLI-owned state file. It stores:

- current `AudioAsset`
- current `AudioVersion`
- current `SessionGraph`
- materialized `available_versions`
- the run history needed to keep follow-up behavior explicit

It is not a published cross-module contract, but it is validated by the CLI before reuse.
The stored `current_version` must match `session_graph.active_refs` so follow-up resolution cannot silently run against stale session state.
