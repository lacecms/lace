## Context

See the proposal. The current file has six direct parser cases, twelve snapshots and seven subprocess cases. The source test configuration discovers `*.test.ts` and type-checks it; the packaged configuration discovers `*.packaged.test.mjs` and resolves the built output. Two snapshots contain an absolute working directory.

## Goals / Non-Goals

**Goals:** Keep source characterization fast and typed while retaining end-to-end coverage of the built executable.

**Non-Goals:** Change parser behavior, make a repository-wide choice about TypeScript packaged tests, or reorganize CLI source for RF7C.

## Decisions

- Put the six parser cases in a `*.test.ts` file importing their source modules, with an explicitly typed case table or individually typed cases. Avoid type suppression and unsafe casts; differing parser result types need not be unified. Source testing is the established convention and runs without a build. Keeping these tests against `dist` would retain the unnecessary build dependency.
- Keep the seven subprocess sanitization cases in the existing packaged file, which continues to spawn `dist/bin.js`. Moving them to a source test would violate its build-free contract; converting the packaged runner to TypeScript is a separate, broader tooling decision.
- Transfer all twelve expected parser outputs and the duplicate, unknown and missing-value checks. Preserve semantic expectations when relocating snapshots, including default project directory; replace machine-specific absolute paths with a deterministic assertion against the expected runtime working directory, rather than recording a developer's path. Remove the old snapshot only after all expectations are represented.

## Risks / Trade-offs

- [Moving snapshots can silently change expected behavior] → compare all twelve old values and retain both success and failure cases; do not blindly regenerate expected output.
- [Losing packaged coverage] → keep all seven built-process cases with their status, JSON and both output-stream sanitization assertions; run the packaged suite after a build.
- [Source tests accidentally need built output] → verify the focused test without `dist` using a safely isolated clean checkout or equivalent non-destructive setup; never remove another person's build artifacts.
