# Benchmarks Module Agent Guide

## Mission

Own evaluation assets, benchmark harnesses, and quality measurement for the platform.

## Pipeline role

`benchmarks` measures whether individual modules and full workflows are reliable enough for LLM-driven audio manipulation.

## Owns

- benchmark datasets and prompt suites
- scoring harnesses and metric aggregation
- repeatable evaluation workflows
- regression tracking for module and pipeline quality

## Inputs

- fixtures, prompts, expected outcomes, and outputs from runtime modules

## Outputs

- benchmark reports
- score summaries
- regression signals for contributors

## Must not own

- product runtime logic
- hidden test-only behavior inside production modules
- primary contract definitions that belong with runtime modules

## Coordination rules

- benchmarks should reflect real platform use, not only synthetic happy paths
- make evaluation criteria explicit
- document dataset provenance and licensing

## Deliverables

- benchmark harnesses
- benchmark documentation
- repeatable scoring workflows

## Success criteria

Contributors can measure whether changes improve or degrade module quality and end-to-end behavior.
