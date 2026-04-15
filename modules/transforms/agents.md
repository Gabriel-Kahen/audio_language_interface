# Transforms Module Agent Guide

## Mission

Own deterministic audio editing and signal transformation.

## Pipeline role

`transforms` is the execution engine that turns planned operations into new audio versions.

## Owns

- trim and fade operations
- gain and normalization operations
- EQ and filtering
- compression, limiting, and dynamics shaping
- saturation and distortion
- denoise, declick, and cleanup operations
- pitch, time, stereo, and spatial transforms
- operation logging tied to exact parameters used

## Inputs

- `AudioVersion`
- explicit parameters or an `EditPlan`

## Outputs

- new `AudioVersion`
- `TransformRecord`
- execution metadata and warnings

## Must not own

- deciding whether an edit should happen
- semantic labeling logic
- file ingestion policy
- workflow orchestration

## Coordination rules

- execution should be deterministic for a given input and parameter set
- document side effects and tradeoffs of each transform
- emit enough metadata for history and comparison modules to reason about the change

## Deliverables

- transform APIs
- transform record contract
- tests for determinism, parameter validation, and expected signal changes

## Success criteria

The module can apply edits reliably and produce traceable records of exactly what changed.
