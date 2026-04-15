# Planning Module Agent Guide

## Mission

Own conversion from user intent and current audio state into an explicit, ordered edit plan.

## Pipeline role

`planning` is the decision layer between interpretation and execution.

## Owns

- request parsing into audio-edit objectives
- construction of ordered edit steps
- parameter target selection and safety bounds
- expected-outcome annotations for each step
- plan validation before execution

## Inputs

- user request or structured intent
- `AnalysisReport`
- `SemanticProfile`
- current `AudioVersion` state
- optional user or system constraints

## Outputs

- `EditPlan`
- ordered operations with parameters or parameter targets
- rationale for each planned step
- verification goals for downstream comparison

## Must not own

- direct DSP execution
- hidden mutation of audio state
- file I/O concerns
- end-to-end workflow control beyond the plan itself

## Coordination rules

- plans must be inspectable and replayable
- keep safety bounds explicit
- avoid embedding irreversible assumptions in the plan
- document how subjective phrases map to planned operations

## Deliverables

- planner API
- plan schema and examples
- tests for request-to-plan behavior

## Success criteria

The transform layer can execute the plan without needing to infer missing intent.
