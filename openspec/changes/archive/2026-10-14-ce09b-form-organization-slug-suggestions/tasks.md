## 1. Architecture and portable layout metadata

- [x] 1.1 Update architecture sections 8 and 17 and the CE9B roadmap status for the specified layout grammar, recursion and creation-dialog slug boundary before production code; verify consistency with the five delta specs and no changed lifecycle invariant.
- [x] 1.2 Add shared layout types/normalization to content and typed options to group, block data/settings and model inputs; verify positive recursive/list-item examples and negative shape, reference, duplicate-placement, unsupported-owner and TypeScript fixtures in content/config tests.
- [x] 1.3 Retain normalized detached layouts in model/block/group projections and exclude them only at metadata owner positions from structural identity, including legacy compatibility paths; verify changed projection hashes, pinned no-layout hashes, caller-mutation resistance and structural content/default keys named like layout metadata.
- [x] 1.4 Extend strict contracts and DTO converters for model/group/block layouts and settingsLayout; verify ordered JSON round-trips and invalid-reference/shape rejection at every supported depth with content transport unchanged.

## 2. Projection-only synchronization

- [x] 2.1 Add application and shared SQLite/D1 contract coverage for layout-only sync on populated model/block/group/settings forms; verify unchanged snapshots, data/settings, media references, revisions and model/block versions, one atomic published-version advance with a created/coalesced build request, no-op repeat and atomic stale-plan refusal.

## 3. Form organization and validation navigation

- [x] 3.1 Add the shared entity-level field-map layout renderer using existing Tabs and UI tokens; verify sections, tab/field ordering, unlisted fields, independent instances, persistent hidden panels and keyboard selection in focused component tests.
- [x] 3.2 Integrate layout rendering into EntryPage model fields, BlockCard data, BlockSettingsPanel declared settings and recursive group/list-item forms; verify absent values stay absent, navigation is clean, original field paths/annotations survive and rich-text/media/list identities survive tab changes and moves.
- [x] 3.3 Add recursive problem indicators, visual-order summary traversal and synchronous ancestor-tab reveal through the existing reveal event; verify exact focus through nested tabs, block Content/Settings and collapsed groups/items, including hidden-block publication exemptions and list reordering.
- [x] 3.4 Verify viewer inspection and lifecycle recovery with layouts in entry/component tests: keyboard/disclosure access, no mutation affordances, busy locks, successful save, failed save, discard/revert and revision-conflict retention; assert presentation state never enters dirty comparisons, payloads or conflict JSON.

## 4. Creation-time slug suggestions

- [x] 4.1 Share the deterministic slug normalizer across creation and entry editing and remove boundary hyphens after truncation; verify accents, punctuation, whitespace/underscore runs, empty/non-Latin/emoji-only input and maximum-length boundaries with pure tests.
- [x] 4.2 Add Slug and initially automatic suggestions to CreateEntryDialog and optional slug transport to the browser client's existing create call; verify follow-title, manual clear/override, explicit re-enable, empty guidance/omission, failure retention, reset on close/success and atomic persistence with a clean editor on success.
- [x] 4.3 Verify existing entries, slugless duplicates, pages/globals and viewers retain their behavior; cover explicit entry-editor opt-in, save/reload stability and server validation/route-conflict feedback with local values retained and no generated suffixes in focused entry/API lifecycle tests on both runtimes.

## 5. Browser acceptance, documentation and quality gates

- [x] 5.1 Add focused browser acceptance for nested tab editing/reordering with rich text/media, exact error reveal, keyboard navigation, narrow viewports, read-only inspection and creation/manual slug flows; run the relevant existing accessibility audits and verify no page overflow, unreachable controls or state loss.
- [x] 5.2 Update configuration examples, reference configuration, starter managed guidance and compatibility documentation for layout syntax, unsupported references, unchanged JSON and the creation-time suggestion boundary; update ownership/template metadata when required and verify affected template/parity checks.
- [x] 5.3 Run the narrow content/config/contracts/application/repository/admin tests and browser suites, then root `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm exec openspec validate ce09b-form-organization-slug-suggestions --type change --strict`; record command results in verification.md and update the roadmap implementation record without archiving.
