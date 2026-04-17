# Core Module Agent Guide

## Mission

Own the platform's canonical shared domain models and common primitives.

## Architectural role

`core` is part of the shared/foundation layer. It provides the shared language other modules use.

## Owns

- canonical types for assets, versions, identifiers, timestamps, and result envelopes
- shared validation primitives
- stable naming for canonical project artifacts
- cross-module utility code that is truly domain-level, not convenience glue

## Inputs

- no audio-specific business logic inputs are required to define the module
- requirements from published contracts and other modules' needs

## Outputs

- reusable core models consumed by other modules
- serialization-friendly types for shared artifacts
- common error and metadata shapes

## Must not own

- audio decoding or file I/O
- DSP analysis logic
- semantic labeling rules
- edit planning logic
- transform execution
- orchestration logic

## Coordination rules

- keep this module minimal and stable
- avoid putting generic helper clutter here
- any change here can ripple across the whole project, so favor caution

## Deliverables

- documented shared types
- tests for invariants and serialization behavior
- notes in `docs/` for major design decisions

## Success criteria

Other modules can depend on `core` without importing each other's internals.
