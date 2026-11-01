# Verification — sm05c-conditional-field-admin-forms

Date: 2026-11-01. Node 24.12.0 (pinned) for root test and build.

| Check | Result |
| --- | --- |
| Admin unit (`vitest run` in `apps/admin`) | 196 files, 975 tests passed (new: `visibility`, `FieldRendererVisibility`, `BlockCardVisibility`, `EntryPageVisibility`; extended: `validation-problems`, `item-summary`, `media-list`, `block-presentation`, `MediaItemPreview`) |
| `conditional-fields.e2e.ts` | 6/6 passed, including axe WCAG A/AA at 320 px and no horizontal overflow |
| Full admin Playwright suite | 164/165 passed. Eight failures in the first run happened while root `pnpm test` ran at the same time and all passed on a quiet rerun. `composites.e2e.ts` "pointer drag changes only the selected list" fails, as already recorded on HEAD in the SM3B/SM3C log rows |
| `@lacecms/content` conditional-fields tests | 37 passed, including the public documentation example |
| Root `pnpm test` | 44/44 tasks passed |
| `pnpm typecheck`, `pnpm lint`, `oxfmt --check .` | passed |
| `scripts/check-boundaries.mjs`, `scripts/check-admin-colors.mjs` | passed |
| `pnpm build` | 22/22 tasks passed |
| `pnpm docs:check`, `pnpm docs:build` | passed (21 pages, links and fragments verified) |
| `pnpm openapi:check` | passed (no API change) |
| `openspec validate sm05c-conditional-field-admin-forms --type change --strict`, `pnpm spec:validate` | valid; 86 items passed |

Not run: generated-project and existing-site acceptance (no template, registry or
API change in this session).
