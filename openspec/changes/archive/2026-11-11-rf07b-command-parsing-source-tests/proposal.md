## Why

RF7B's command-parsing characterization mixes direct parser tests with subprocess checks of the built CLI in an untyped packaged test. The parser cases can run against TypeScript source and benefit from type checking and a build-free feedback loop.

## What Changes

- Move the six parsers' characterization cases and their expected snapshots to a type-checked TypeScript source test, preserving the same inputs and assertions.
- Retain the built-CLI subprocess cases for JSON error and secret sanitization as packaged coverage, preserving all commands and assertions.
- Keep CLI behavior, snapshots' expected values and existing test-runner conventions unchanged; no broad conversion of packaged tests or tooling is included.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a behavior-preserving test refactor; the accepted `workspace-governance` and `operational-cli` specifications remain applicable without a delta.

## Impact

This is a targeted follow-up to completed roadmap session RF7B, independently verifiable before RF7C; RF7C and RF7D are not included. It depends on RF2's source/packaged test split and RF7B's existing characterization. Architecture §§6 and 20 and the `workspace-governance` and `operational-cli` specs govern the work. It affects CLI tests and snapshots only, with no public API, CLI behavior, dependencies or migration changes.
