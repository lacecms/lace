## 1. Governing policy and portable metadata

- [x] 1.1 Update architecture sections 8/17 and backlog to select LIST2 as the explicit user-requested scalar-settings exception to LIST1's all-visible policy; verify the bounded scope, retention, unconditional validation and reachable errors agree with this change's five capability deltas while full conditional forms stay deferred.
- [x] 1.2 Add `SettingsVisibility`, normalization, block input/metadata projection and strict sibling-select rule validation (D1); verify unit/type tests cover detached/frozen JSON, omitted-property compatibility, valid custom blocks, missing/optional/non-select controllers, self/chained/cyclic dependencies, unknown targets/options, duplicate values, extra keys, nonportable metadata and unsupported owners.
- [x] 1.3 Exclude `settingsVisibility` only at block-definition positions in config structural/legacy identity and preserve projection metadata (D3); verify pinned unopted hashes, content/default namesake keys, unchanged option/default classification and display-only application plans without content writes.
- [x] 1.4 Extend forged REST block metadata checks and OpenAPI for visibility rules; verify valid/invalid transport fixtures through shared normalization and regenerate the OpenAPI artifact with deterministic root-script output.

## 2. Reusable list adoption and generic settings presentation

- [x] 2.1 Export `listLayoutSettingsVisibility()` and adopt it in Gallery v4 and a custom card-list fixture (D2); verify both use the same rules and that Gallery versions, migrations, scalar defaults, authored types and Astro/CSS/lock bytes remain unchanged.
- [x] 2.2 Compose settings visibility reactively for editor and viewer with per-block watched settings (D4); verify grid shows only its preset, both flex modes show only Wrap items, the mode remains visible, default-controller behavior works and an unrelated custom select/boolean example has no built-in-name branches.
- [x] 2.3 Preserve mounted controls/registration and support empty layout sections/tabs without empty navigation or unexpected focus changes; verify inactive values survive repeated mode switches, Save/Publish, duplicate/move, discard/revert, server reload and revision-conflict recovery, and lifecycle locks/viewer permissions retain existing behavior.
- [x] 2.4 Reveal relevant invalid hidden settings with associated explanatory text and reuse summary/disclosure/tab focus (D4/D5); verify switch and card errors are reachable without changing mode, correction restores conditional visibility, ignored hidden-block publication issues do not force reveal, and unrelated fields/forms retain their existing behavior.

## 3. Runtime parity, browser acceptance and documentation

- [x] 3.1 Verify visibility-only sync and unconditional invalid-setting validation on file/in-memory SQLite and local D1; assert stored draft/published values, revisions and audit/media references stay unchanged, verify existing published-version advancement and build-outbox coalescing, and ensure invalid saves and stale projection plans fail without partial writes.
- [x] 3.2 Add focused browser acceptance at 320px/desktop in light/dark: test grid and both flex modes, hidden controls absent from accessibility/Tab order, retained values after save/reload, multiple independent blocks, summary-focus recovery, visible focus and no overflow or media-preview requests.
- [x] 3.3 Update internal/public field and content-modeling guidance plus generated consumer guidance for mode-specific controls, value retention, validation-error reveal, optional metadata compatibility and projection-only synchronization; verify documentation checks/build and examples use the public DSL without site or SQL migrations.

## 4. Completion checks

- [x] 4.1 Run focused content/config/contracts/application/admin and cross-runtime tests, type tests, browser acceptance and applicable Gallery/site-source regressions; record exact commands/results and preserve unrelated local edits.
- [x] 4.2 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm exec openspec validate add-list-layout-control-visibility --type change --strict`; review each checkbox against evidence and report completion, leaving synchronization/archive for separate explicit requests with LIST1 synchronized before LIST2.


## Verification evidence (2026-10-22)

- `pnpm exec vitest run packages/content/src/index.test.mjs packages/config/src/index.test.mjs packages/contracts/src/index.test.mjs packages/application/src/configuration-evolution.test.mjs tests/block-sources.test.mjs` — 318 passed.
- `pnpm --filter @lacecms/content type-test` — passed.
- `pnpm --filter @lacecms/astro exec vitest run src/registry-blocks.test.mjs` — 17 passed; run with its Astro-aware package configuration.
- `pnpm --filter @lacecms/app-admin exec vitest run src/widgets/block-editor/BlockSettingsFields/BlockSettingsFields.test.tsx src/widgets/block-editor/BlockSettingsPanel/BlockSettingsPanel.test.tsx src/entities/content/FieldLayout/FieldLayout.test.tsx src/pages/entry/EntryPage/EntryPageListLayouts.test.tsx src/pages/entry/EntryPage/EntryPageLifecycle.test.tsx` — 31 passed; final focused EntryPage rerun: 9 passed.
- `pnpm exec vitest run packages/platform-node/src/repository-contract.test.mjs packages/platform-cloudflare/src/repository-contract.test.mjs -t LIST2` — 3 passed (file SQLite, in-memory SQLite, local D1); requires loopback access.
- `pnpm --filter @lacecms/app-admin exec playwright test list-layouts.e2e.ts --workers=2` — 5 passed, including 320/1280px light/dark, reload, independent blocks and error focus.
- `pnpm exec vitest run tests/existing-astro-site.test.mjs apps/site/src/fixture-build.test.mjs` — 6 passed with loopback access.
- `pnpm docs:check` and `pnpm docs:build` — passed; 19 pages, links and OpenAPI verified.
- `pnpm openapi:generate` — successive output byte-identical.
- Local `pnpm content:sync` applied four label updates after SQLite backup; subsequent `pnpm content:sync --check` reports no changes. Entries, snapshots, blocks and media-reference rows match the backup. API/admin restarted; all five development services healthy and `/admin/` returns HTTP 200.
- Existing metadata-sync published-version advancement and build coalescing retained by explicit user decision. No runtime sync classification or SQL schema change.
- Root quality gates: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `git diff --check`, strict OpenSpec change validation. Existing independent local edits preserved.
- Strict validation passes; eventual synchronization/archive must apply LIST1 before LIST2 because main specs do not yet contain its prerequisite requirements. Neither synchronization nor archive performed.
