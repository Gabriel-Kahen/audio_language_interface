# Orchestration Module Agent Guide

## Mission

Own end-to-end workflow coordination across modules.

## Architectural role

`orchestration` composes the independent modules into useful execution flows while keeping their responsibilities separate.

## Owns

- sequencing of analysis, planning, execution, rendering, comparison, and history updates
- workflow policies for iteration and stopping conditions
- error recovery behavior across module boundaries
- session-level coordination that is broader than any one module

## Inputs

- user requests, tool invocations, and published outputs from other modules

## Outputs

- coordinated workflow results
- composed execution traces
- session-level summaries

## Must not own

- canonical core models
- low-level analysis logic
- transform implementations
- file decoding logic
- direct replacement of the tool boundary

## Coordination rules

- keep orchestration thin and explicit
- call into modules through their published contracts
- do not reimplement lower-level logic here for convenience

## Deliverables

- workflow coordinators
- orchestration docs explaining supported flows
- tests for end-to-end behavior and failure handling

## Success criteria

The full pipeline can run coherently without blurring the ownership of the underlying modules.
