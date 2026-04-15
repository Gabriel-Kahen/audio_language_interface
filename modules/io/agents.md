# IO Module Agent Guide

## Mission

Own audio ingestion, decoding, validation, normalization, and file-oriented import or export preparation.

## Pipeline role

`io` is the entry point from external audio into the internal platform representation.

## Owns

- file loading and path handling
- audio format validation
- decoding into the platform's internal representation
- channel and sample rate normalization policies
- metadata extraction that is tied directly to the file container

## Inputs

- file paths, bytes, streams, or asset references

## Outputs

- validated imported assets
- decoded audio buffers or references
- file-level metadata
- initial `AudioAsset` and `AudioVersion` creation hooks

## Must not own

- deeper signal analysis beyond file/container facts
- semantic interpretation
- planning or transform decision-making
- workflow orchestration

## Coordination rules

- keep external format concerns isolated here
- publish normalized outputs so downstream modules do not have to guess
- document any lossy conversion or normalization policy clearly

## Deliverables

- import and validation APIs
- file metadata contracts
- tests covering supported formats and invalid inputs

## Success criteria

Downstream modules receive predictable audio representations regardless of source format.
