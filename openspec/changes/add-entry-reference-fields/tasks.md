Implement in the six session boundaries below. Mark each task after its
verification and record the checkpoint evidence in this change. Each later
session builds on the preceding ones. The feature ships after REL1F.

## 1. REL1A — Field descriptors and configuration

- [x] 1.1 Add `field.reference({ models })`, its static string type and portable capability declarations in content/config/contracts. Verify nested inference, positive and negative type fixtures, schema round trips and rejected options at builder and forged-metadata boundaries.
- [x] 1.2 Resolve page/collection target keys after full registry normalization. Verify forward and same-model declarations, route-less selection, global/unknown/duplicate rejection, and stable hashes for reordered model sets and existing configurations.
- [x] 1.3 Extend the descriptor traversal to collect reference occurrences, including materialized defaults, hidden values, stable block keys and escaped pointers. Cover repeated IDs and the 200/201 combined URL/typed boundary with independent media/list/byte limits.
- [x] 1.4 Classify widening, narrowing, renames and text-to-reference changes in the sync planner. Verify prospective model/block diffs, existing version requirements, and a documented additive text-author migration fixture. Verify REL1A with focused content, config, contract and planner tests.

## 2. REL1B — Persistence and acyclic writes

- [x] 2.1 Add the forward migration, Drizzle schema/metadata and indexes for usage purpose. Verify fresh and populated supported SQLite/local D1 databases, legacy URL row identity, indexed lookups, and unchanged public version/outbox after migration.
- [x] 2.2 Compile purpose-aware row diffs and phase-specific graph checks in the shared DB plans. Exercise self, mutual, long, diamond and hidden-field cycles, repeated IDs, unknown/wrong-model targets, a staged reversal, and the exact graph-work boundary on both runtimes. Show that a budget-limited proof never admits a write.
- [x] 2.3 Wire create/save/publish/revert/duplicate through the guarded plans, including authorized REST/MCP callers and the in-memory contract store. Verify retained orphan handling, expected-revision and replay precedence, exact block/list remapping and zero reference writes on a title-only save.
- [x] 2.4 Guard configuration backfills, pruning, renames and resumable block migrations using the same per-phase evidence. Verify check-only failure for cyclic final overlays and acyclic final overlays with unsafe intermediate units, staged-migration guidance, atomic multi-source overlays, intervening edits, safe intermediate commits and restart. Demonstrate that only URL usages can add a reference-based guard to route removal.
- [x] 2.5 Run shared repository races and injected rollbacks on SQLite and D1. Capture query plans and complete Worker statement/bind counts for maximum mixed-reference input, deep/wide DAGs and rejected writes. Verify that two valid-looking concurrent additions cannot commit a cycle, and record REL1B evidence.

## 3. REL1C — Removal, direct impact and admin API

- [x] 3.1 Add the authenticated paginated reference-target catalog and batch resolver. Test literal title prefixes, continuations, selected model filtering, draft-only targets and published route-less records, missing IDs, invalid input and read-only permissions on both adapters.
- [x] 3.2 Add direct impact reads with bounded source/location pages, phase, visibility, stable source identities and pointers. Verify Page → Review → Anna lists only the review for Anna, plus tests for hidden uses, a changing graph, high fan-in and many locations in one source.
- [x] 3.3 Guard delete/unpublish in the same transaction as target preconditions and outbox effects. Verify an absolute delivered blocker, release after source republication, draft-only acknowledged deletion, hidden-only cases, mixed URL/typed usages, stale/cross-actor receipts and unchanged permissions/singleton rules.
- [x] 3.4 Expose path-addressed target/cycle failures, a verified publish-first hint and separate hard-block/review errors through the shared contracts and OpenAPI. Exercise positive, denied, stale and idempotent requests on Node and Worker, including source publish racing target removal. Record REST and runtime parity for REL1C.

## 4. REL1D — Published SDK, Astro and saved-draft preview

- [x] 4.1 Index eligible targets after complete format-2 export traversal in the shared site view and implement `site.reference(id)`. Verify cross-page resolution, immutable records without paths, duplicate-ID contract failures, ordered/repeated IDs, unknown IDs, cache/304 reuse and no per-target request.
- [x] 4.2 Carry the lookup through render-core and Astro to site-owned blocks. Build a route and block showing three selected testimonials in authored order, and verify an existing minimal render caller and site without reference fields still work.
- [x] 4.3 Apply publication-grade reference checks at preview admission with frozen public-version/capture-epoch guards. Verify a selected draft-only testimonial or wrong-order cycle fails before replacement or dispatch, a hidden selection succeeds, and publishing the missing testimonial enables preview of the same saved page.
- [x] 4.4 Exercise the Node and Cloudflare preview inputs against the same site components. Assert that the author's draft photo never enters the article preview, a later author publication updates the next public build, the ready preview keeps its capture, and ordinary public reads remain published-only. Record REL1D evidence.

## 5. REL1E — Editor and repair workflows

- [x] 5.1 Add single selection and ordered multi-selection to model, global and block forms using recursive list/group controls. Test debouncing/cancellation, later pages, batched status resolution, viewer access, draft badges, cancellation, order, repeated IDs, keyboard movement and list limits.
- [x] 5.2 Render field-addressed errors and missing selections in saved drafts. Verify that unrelated edits and reordering survive, a deleted selection can be repaired, and a blocked reversal identifies the source to publish first while preserving form state.
- [x] 5.3 Integrate direct “Where used” and draft-only confirmation into editor and collection-row lifecycle actions. Test paging, focus on the exact nested field, stale/moved list indices, pending source republication, conditional/hidden locations, unsaved-change protection, mixed acknowledgments and inaccessible override actions.
- [x] 5.4 Run a browser journey as editor, publisher and viewer where appropriate: select and reorder route-less reviews, follow the author blocker, fix and republish its source, acknowledge a draft-only deletion, and repair the resulting missing selection. Record observations and accessibility checks for REL1E.

## 6. REL1F — Import, adoption and end-to-end verification

- [ ] 6.1 Extend `lace import` offline/online validation and `$entry` lowering by descriptor. Verify literal IDs, URL tokens, repeated route-less package targets, invalid positions/models, hidden-edge cycles and draft-only import without network access in `--validate-only`.
- [ ] 6.2 Compute safe draft-save and publish order, including reversals between existing publications and target-first first publication. Verify reversed package order, pre-write refusal for package-known cycles, server-side external graph conflicts, partial failure/resume, and a no-write rerun.
- [ ] 6.3 Update public modeling, editing, import, API, Astro, preview and upgrade guidance and their reference/fixture contracts. Show an ordered reviews block, direct vs transitive use, strict removal, the two-step reversal, explicit migration from a text author, and the matching backup/artifact restore procedure.
- [ ] 6.4 Exercise a packed consumer and the shared Node/local Worker acceptance journeys with old and reference-enabled site configurations. Verify schema upgrade, route-less cards, protected preview, public rebuild after author publication, and preservation of independent CE10 URL behavior, permissions and query budgets.
- [ ] 6.5 Record evidence and the roadmap checkpoint status. Run the narrowest affected suites, then `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm exec openspec validate add-entry-reference-fields --type change --strict`. Check all six sessions before marking the implementation complete.
