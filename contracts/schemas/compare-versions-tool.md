# `compare_versions` Tool Contract

## Purpose

Defines the tool envelope for comparing two versions using paired analyses.

## Request

- `tool_name` must be `compare_versions`
- required arguments:
  - `baseline_version`
  - `candidate_version`
  - `baseline_analysis`
  - `candidate_analysis`
- optional arguments:
  - `edit_plan`
  - `comparison_id`
  - `generated_at`

When provided, `arguments.edit_plan` must match the canonical `EditPlan` contract.

## Success response

- `result.comparison_report`: `ComparisonReport`

## Schemas

- `contracts/schemas/json/compare-versions-tool-request.schema.json`
- `contracts/schemas/json/compare-versions-tool-response.schema.json`

## Example payloads

- `contracts/examples/compare-versions-tool-request.json`
- `contracts/examples/compare-versions-tool-response.json`
