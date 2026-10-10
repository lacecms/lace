## 1. Architecture and documentation of the decision

- [x] 1.1 Update `docs/mvp-architecture.md` section 8 *Configuration projection* (field `renamedFrom`, `removedFields`, `removedBlocks`, hint validation against the baseline, destructive rows of the classification table, revision-neutral move/prune with media-reference maintenance) and append a CE1B note to `docs/adr/0007-schema-evolution-during-sync.md`; verify the text matches the schema-evolution and content-model-configuration deltas

## 2. Hint options (`@lacecms/content`, `@lacecms/config`)

- [x] 2.1 Add the `renamedFrom` option to every `field.*` builder (field-key validation, kept on the definition) and reject it in `defineBlock` fields; verify with content tests for acceptance, malformed values and the block rejection, and a type test that `field.text({ renamedFrom: "a" })` compiles
- [x] 2.2 Extract field hints into runtime `renamedFields`, add `removedFields`/`removedBlocks` model options with the static validation from the content-model-configuration delta, and strip all hints from structure, hashes and the public projection; verify with config tests that hashes and public projection are identical with and without hints and that each contradictory hint fails with a message naming the model

## 3. Planning (`@lacecms/application`)

- [x] 3.1 Make `diffContentModelStructures` hint-aware (`field-renamed` with `from`, definition comparison across the rename, `hinted` removals, inert hints) and add `validateStructureHints`; verify with unit tests for rename + tightening, rename + type change, hinted removals, inert already-applied hints and both hint errors
- [x] 3.2 Extend the evidence accumulator with named holders, rename source/target holders and the transformed-record evaluation (rename → prune → backfill) for validation and size checks; verify with multi-page unit tests
- [x] 3.3 Extend the planner: hint diagnostics on the diff path, `FIELD_RENAME_TARGET_HAS_DATA`, hinted removals and renames as planned writes (`renames`, `fieldRemovals`, `blockRemovals`), named snapshots and hint guidance on unhinted refusals; add `configurationSyncContentWrites`; extend the text report; verify planner and report tests, including byte-identical CE1A plan JSON for configurations without hints

## 4. Shared SQL and adapters

- [x] 4.1 Add `configurationSyncWriteStatements` in `@lacecms/db` (rename, remove-field, remove-block-type with media-reference maintenance, backfill) with field-key checks and statements ending in a `where` clause; verify with db tests against SQLite that values of every JSON type move unchanged
- [x] 4.2 Node and D1: execute the ordered write list after the identity update (D1 statements guarded); verify Node file, Node memory and D1 Miniflare contract runs pass

## 5. Contract tests

- [x] 5.1 Add repository contract cases on all runtimes: rename keeps values (draft + published, revisions unchanged, one version bump and build); removal prunes values; removing a media field releases media usage and the deletion guard allows deletion; renaming a media field keeps usage; removing an allowed block type drops its blocks and their media references while keeping other blocks; each refusal without a hint (field, block type) and rename onto data leaves every row unchanged; model rename combined with field rename; `--check`-style preparation writes nothing and lists planned writes; inert hints after apply produce a no-op
- [x] 5.2 Update CLI command tests if report output changes; verify `pnpm --filter @lacecms/cli test` passes

## 6. Documentation and roadmap

- [x] 6.1 Update `docs/configuration-synchronization.md` (hints, validation rules, write semantics, temporary nature and removal procedure, new diagnostics) and add the CE1B session-log row in `docs/content-editor-roadmap.md`; verify links resolve

## 7. Verification

- [x] 7.1 Run the narrowest affected package tests, then root typecheck, Oxlint, Oxfmt check and `pnpm exec openspec validate ce01b-field-rename-removal-hints --type change --strict`; verify all pass
