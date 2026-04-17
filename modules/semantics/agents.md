# Semantics Module Agent Guide

## Mission

Own translation from measurable analysis outputs into interpretable descriptors and explanatory language.

## Architectural role

`semantics` is part of the intent layer. It turns analysis into labels the planner, tools, and users can reason about more naturally.

## Owns

- mappings from measurements to descriptors like `bright`, `muddy`, `wide`, `dry`, or `clipped`
- confidence scoring for semantic labels
- rationale strings tied back to measurable evidence
- descriptor normalization and taxonomy

## Inputs

- `AnalysisReport`

## Outputs

- `SemanticProfile`
- descriptor lists with confidence and evidence
- explanations of why descriptors were assigned

## Must not own

- raw signal measurement logic
- user request parsing
- edit planning policy
- DSP transform execution

## Coordination rules

- keep semantic outputs traceable back to analysis evidence
- avoid hiding uncertainty
- do not invent labels that cannot be grounded in measurable facts

## Deliverables

- semantic mapping logic
- descriptor taxonomy docs
- tests showing how measurements map to labels

## Success criteria

The planner or tool layer can inspect the semantic profile and understand what qualitative descriptors are justified by the analysis.
