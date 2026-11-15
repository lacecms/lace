## Context

The root Vitest architecture guard currently reads top-level Markdown files and enforces strict ceilings; it also checks the schema diagram, section map and change codes. See the proposal for motivation. The README establishes architecture authority over accepted capability specs.

## Goals / Non-Goals

**Goals:** Make the size signals actionable and maintainable, while keeping existing non-size guards intact and documenting editorial ownership.

**Non-Goals:** Moving normative content, changing section identifiers or removing diagram drift checks.

## Decisions

1. Count outside fenced Mermaid blocks, excluding opening and closing fences as well as their contents. For the per-file count, include whitespace-only and empty lines; for the directory count, include only lines with non-whitespace content. Count physical lines without an extra line for a trailing newline. Reuse one parser for both measurements to avoid divergent handling. Existing scope remains top-level Markdown files, including history. A blank-only final line is counted if actually present before the terminating newline.
2. A file of 600 lines passes; 601 fails with name, count and limit. A directory total of 3,000 passes silently; 3,001 produces a visible warning with count and threshold but a successful test exit. Prefer a diagnostic in the root check, visible in normal test output, to a failing assertion or a warning that is hidden by normal tooling. Verify the normal root invocation shows it. Unrelated failures still fail normally.
3. Add fixture-based tests for both boundaries, whitespace, Mermaid fences and termination, and warning visibility/exit behavior. Extract a small helper if necessary to exercise production counting and reporting without modifying actual documentation; avoid dependencies on real directory size.
4. Document in the architecture README: current architecture owns scope, boundaries and cross-cutting invariants; detailed accepted behavior belongs in capability specs, decisions and rationale in ADRs, history in the existing archive/history sources. Update the architecture in the same change when affected, review duplicates or stale detail on warning, preserve invariants and verify destinations before moving detail, and split oversized files by domain while preserving section numbers and map. Explain counts and thresholds. Do not silently elevate spec detail above architecture.

The alternative of a higher hard directory cap still eventually blocks necessary invariants; the warning instead requests editorial review. Counting diagrams in per-file limits penalizes the schema diagram maintained by a separate drift check.

## Risks / Trade-offs

- [Warnings can be ignored] → Make threshold, count, and requested review visible and document the review practice; retain the file limit and other guards.
- [Runner suppresses successful test output] → Exercise the actual root-style Vitest invocation with an over-threshold fixture or equivalent and select a reporting mechanism that remains visible.
- [Malformed or non-Mermaid code fences] → Count non-Mermaid fences as ordinary text; keep existing Mermaid recognition semantics and test multiple blocks and whitespace cases.

## Migration Plan

Update the README and guard together during apply, then verify targeted behavior and root checks. The accepted spec is synchronized through the normal OpenSpec lifecycle. Reverting the change restores the old check and policy; no data migration is needed.
