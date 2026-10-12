## 1. Architecture and configuration contract

- [x] 1.1 Replace the temporary composite-sync restriction in architecture §8, update ADR 0013 and mark CE7B active in the content/editor roadmap before production edits; verify the documents agree with this change's nested hints, defaults, migration sequencing and CE7C/CE7D exclusions.
- [x] 1.2 Add typed schema-path parsing/canonicalization and named-child hint support in content/config, recursively stripping hints from projected descriptors; verify content/config tests and type tests cover nested groups/lists, root compatibility, item/block hint refusal, malformed/index paths, duplicates and literal default keys.
- [x] 1.3 Validate nested hints against paired baseline ancestors, including parent/child renames, removals under renamed parents, conflicts, missing ancestor context and inert applied hints; verify focused application/config tests for each accepted and refused case.

## 2. Recursive evolution and prospective values

- [x] 2.1 Extend structural comparison to group children, list items and effective list bounds with deterministic nested addresses; verify application evolution tests for all classes, model/block version rules, scalar compatibility and display/default-key identity.
- [x] 2.2 Implement the shared pure recursive transformation/evidence evaluator with ancestor-first renames, per-occurrence collisions, removals and applicable absent-key backfills; verify tests for absent parents, empty values, explicit values, partial defaults, retained item order and unchanged revisions/audit data.
- [x] 2.3 Enforce recursive media-backfill refusal and rebuild complete model-field reference sets from transformed values; verify nested leaf/container rename/removal tests, descendant defaults, unused defaults and unchanged scalar media paths.
- [x] 2.4 Replace the CE7A unsupported-composite branch with recursive evidence decisions and selective tightening validation; verify draft/published minItems and required behavior, maxItems refusal, new required-child grandfathering, scalar/composite conversion refusal and unhinted destructive protection.

## 3. Complete snapshot scans and migrations

- [x] 3.1 Extend application read contracts, shared DB row mapping and memory/Node/D1 bounded scans with complete retained block data, hidden flags and references needed for prospective validation; verify multi-page scans, cursor/count stability, bounded query behavior and fingerprint-bound evidence.
- [x] 3.2 Compose model transformations, block removals and executable block migration results before deciding the plan, with JSON-safe evidence for adapter replanning; verify combined 500/501-element and 200/201-media-location cases, fields/block JSON caps, hidden/unchanged contributions and deterministic reports without executables.
- [x] 3.3 Validate actual migration intermediates separately from final prospective snapshots and preserve existing migration media provenance/envelope/revision behavior; verify invalid nested output, combined model backfill/migration overflow, unrelated published required absence and interrupted/rerun migration tests.

## 4. Guarded persistence and reporting

- [x] 4.1 Add shared parameterized exact-snapshot rewrite helpers and application payload types for composite fields/reference replacement; verify SQLite helper tests preserve JSON types, reject unsafe addresses and preserve unrelated reference sources. Exercise representative multi-page rewrite payloads against D1 batch/binding/request limits before adapter integration; revise planning if atomic capacity requires a different design.
- [x] 4.2 Integrate composite rewrites into Node's guarded final transaction and memory doubles while retaining scalar fast paths; verify shared repository cases for atomic media usage changes, revisions/audit preservation, stale plans, injected failure rollback and idempotence.
- [x] 4.3 Integrate the same rewrite contract into D1's existing guarded final batch, including the reread-to-execution guard and reference-affecting concurrency; verify shared repository contracts and D1 harness cases for stale execution, rollback, multi-page rewrites and one final public-version/build transition.
- [x] 4.4 Extend deterministic human/JSON reports with nested schema addresses and bounded concrete snapshot paths, preserving root scalar output and check exit codes; verify application/CLI check tests prove zero writes, correct total counts, 20-snapshot truncation and identical results for equivalent insertion orders.

## 5. Cross-runtime acceptance and completion

- [x] 5.1 Run the shared CE7B acceptance matrix on Node and D1: group/list child addition/defaults, required/bound tightening, parent/child hinted moves/removals, nested media usage/deletion, unhinted loss/type refusal, combined migration limits, concurrent saves/publication/duplication, final failure rollback and interrupted migration reruns; verify runtime parity and valid repeated-sync no-op behavior.
- [x] 5.2 Document operator hint examples, version requirements, refusal recovery, media-default limits and backup/rollback behavior; record implementation evidence in the CE7B roadmap section and confirm CE7C/CE7D remain separate and unimplemented.
- [x] 5.3 Run narrow affected-package tests, then root `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm exec openspec validate ce07b-nested-schema-evolution --type change --strict`; resolve failures and record results before reporting completion, without archiving or synchronizing accepted specs unless separately requested.
