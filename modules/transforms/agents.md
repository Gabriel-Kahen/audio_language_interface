# Transforms Module Agent Guide

## Mission

Own deterministic audio editing and signal transformation.

## Architectural role

`transforms` is part of the audio runtime. It is the execution engine that turns explicit operations into new audio versions.

## Owns

- deterministic execution of the currently supported runtime operation set
- trim, silence trim, and fade operations
- gain and normalization operations
- EQ and filtering
- compression, limiting, and dynamics shaping
- cleanup, restoration, and creative effect operations
- pitch, time, stereo, and channel-utility transforms
- operation logging tied to exact parameters used

## Inputs

- `AudioVersion`
- explicit parameters or an `EditPlan`
- published operation contracts that must stay aligned with emitted `TransformRecord` data

## Outputs

- new `AudioVersion`
- `TransformRecord`
- execution metadata and warnings

## Must not own

- deciding whether an edit should happen
- semantic labeling logic
- file ingestion policy
- workflow orchestration
- hidden capability discovery for planning

## Coordination rules

- execution should be deterministic for a given input and parameter set
- document side effects and tradeoffs of each transform
- emit enough metadata for history and comparison modules to reason about the change

## Deliverables

- transform APIs
- transform record contract
- tests for determinism, parameter validation, and expected signal changes

## Success criteria

The module can apply explicit edits reliably and produce traceable records of exactly what changed without requiring intent-layer inference at execution time.
