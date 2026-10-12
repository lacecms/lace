## 1. Architecture and compatibility contract

- [x] 1.1 Before production code, update `docs/mvp-architecture.md` sections 8, 9.3–9.7, 10–13, 17, 20 and 22 for bounded composites, semantics, path encoding, transitional sync/editor support and unchanged flat blocks; add a short ADR under `docs/adr/`. Verify both documents agree with this design and the CE7 owner decisions without assigning a DB migration.
- [x] 1.2 Update the CE7A roadmap record to in progress and document the CE7B/CE7C boundaries (recursive evolution and authoring remain separate). Verify no later session is marked implemented or pre-created.

## 2. Portable definitions and recursive validation

- [x] 2.1 Add group/list definitions, public options-object builders, recursive inference and exhaustive visitor cases in `packages/content`. Verify content/config type fixtures preserve nested keys, required/default properties, scalar-list types and literal select unions through depth six, rejecting incorrect values and direct list-of-list typing.
- [x] 2.2 Add bounded recursive descriptor normalization at builder/metadata boundaries with detached immutable JSON, key/option checks, cycle detection, defaults and nested-hint refusal. Verify runtime cases for depth 6/7, groups 2/3, reset at a list, shared acyclic children, malformed/forged descriptors, cycles, accessors, invalid bounds and invalid defaults.
- [x] 2.3 Implement shared recursive mode-aware normalization and exact typed issue paths, preserving scalar behavior. Verify absent optional groups, present `{}`/`[]`, required presence, partial defaults, minItems draft/publish differences, unknown children, unsafe leaves, null/undefined/hole rejection and item-default behavior in content unit tests.
- [x] 2.4 Add shared per-list/aggregate counters and normalized byte checks to field/block/entry validation. Verify 100/101 and 500/501 boundaries, stricter maxItems, nested total 210, defaults, independent snapshot budgets, hidden-block draft semantics/counting, rich-text exclusion and post-default byte overflow.
- [x] 2.5 Add a descriptor-guided media traversal with typed relative paths, plus legacy-root/nested-pointer encoding and decoding. Verify nested scalar/media lists, shared IDs at different locations, exact numeric indices and byte-identical scalar paths without detecting media in arbitrary text.

## 3. Configuration, metadata and transport

- [x] 3.1 Integrate recursive definition validation into model/block normalization and projection; retain the CE6 settings allowlist, root scalar listFields and SEO mappings, and block migration-only rename behavior. Verify accepted model kinds, forged descriptor refusals and rejected composites/nested paths in restricted options in config/content tests.
- [x] 3.2 Make canonical field identity traverse descriptor positions only. Verify nested label/description changes are projection-only, child/default keys named label/description remain structural, and existing scalar canonical/hash/legacy-recognition fixtures remain unchanged.
- [x] 3.3 Extend contracts metadata validation and recursive OpenAPI descriptor schemas without changing content JSON envelopes or usage DTO shapes. Verify metadata round trips, negative forged metadata, nested content/empty-value transport and exact 422 JSON Pointers in contracts/server tests; regenerate and check OpenAPI with the repository scripts.
- [x] 3.4 Add CE7A's explicit sync safety rules for composites while preserving scalar CE1 behavior. Verify new models, unchanged/display-only composites and version-bumped optional root additions without defaults succeed, while populated composite structural/default/hint changes are refused by check/apply without writes and with an explicit nested-evolution report.

## 4. Application lifecycle and atomic persistence

- [x] 4.1 Replace shallow use-case media collection with the shared traversal; validate active IDs in batches and enforce 200 locations including SEO/hidden data. Verify nested paths, 200/201 occurrences, missing/deleting media, authorization-before-read and stale draft revisions in application tests.
- [x] 4.2 Adapt shared SQL/path mapping, Node and D1 adapters and the fake as needed to persist nested JSON and pointer locations in existing tables. Verify save/load, reordered/removed item projection replacement, publication/revert copies, duplicate block-key remapping and rollback of partial/reference-chunk failures in shared repository contracts.
- [x] 4.3 Extend bounded block-migration scan ports/readers with model fields and unchanged block data needed for budget counting; overlay all migrated normalized results and check resulting snapshot budgets before guarded writes. Verify exactly 500 and rejected 501 totals, defaults/hidden/unchanged data, precise invalid-migration evidence, prior-media-only rules, envelopes, stale guards and resumable reruns on Node and D1.
- [x] 4.4 Extend shared repository fixtures for nested model/block media, current draft/published usage, final-reference deletion release and metadata-triggered builds (including hidden published references). Verify public page/collection/path/global/export dictionaries and media eligibility exclude draft-only and hidden-only locations on the fake and both runtimes.
- [x] 4.5 Extend D1 budget instrumentation with 200 blocks, 200 nested media locations and 500 total elements. Verify a complete save/reload stays within 50 queries, each statement stays within 100 binds, every mutation remains one guarded batch and there is no item-proportional query loop.

## 5. SDK, render and existing admin consumers

- [x] 5.1 Verify/extend SDK public parsing and published-site fixtures for nested objects/arrays, empty composites, ordered collection merging and globals/exports. Verify existing media/image helpers resolve nested IDs without adding content/render dependencies to SDK.
- [x] 5.2 Integrate shared composite publish validation and inferred types in render core. Verify nested defaults/props, exact numeric leaf errors with cause/context, list limits, scalar parity and hidden-before-resolution behavior in render unit/type tests.
- [x] 5.3 Add explicit interim read-only composite inspection and exhaustive consumer handling in the admin; preserve composites through initialization, cleaning, dirty checks, save/discard, revert, conflict JSON and block copy. Verify scalar editing alongside nested content, `{}`/`[]` preservation, draft-mode missing/minimum rules, summary visibility and viewer read-only behavior in focused admin tests.
- [x] 5.4 Format nested media usage paths as readable group/item/leaf locations with one-based item labels and unchanged stored zero-based pointers. Verify legacy usage labels and model/block/list-of-media nested labels in focused admin tests.

## 6. Documentation and completion verification

- [x] 6.1 Add composite model/block examples, semantics, limits, pointer paths, sync restrictions and temporary editor behavior to the existing content guides and `docs/compatibility.md`. Verify examples use public builders, describe coordinated engine/admin/site adoption and backup-based rollback after storing composites, and defer registry/starter adoption to CE7D.
- [x] 6.2 Run the focused changed-package tests, content/config/render type fixtures, shared Node/D1 repository suites and OpenAPI check after dependency builds. Record passing commands and confirm all schema/data boundary, lifecycle/media, migration/concurrency and scalar regression scenarios above are covered.
- [x] 6.3 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm exec openspec validate ce07a-composite-field-data-contract --type change --strict`. Verify all pass, update task checkboxes immediately after their verification, and record CE7A implementation evidence in the roadmap without marking it archived or starting CE7B.
