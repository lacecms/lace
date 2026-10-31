# Verification — sm03c-multi-select-media-picker

Date: 2026-10-31. Branch `codex/site-migration-roadmap`.

## Focused checks

| Check | Result |
| --- | --- |
| `vitest run src/entities/content/media-list.test.ts` | 10 passed |
| `vitest run src/widgets/media-library/MediaGrid` | 7 passed |
| `vitest run src/features/upload-media` | 13 passed |
| `vitest run src/widgets/media-library/MediaPickerDialog` | 18 passed (9 single mode, 9 multiple mode) |
| `vitest run src/widgets/media-library/MediaListPicker` | 2 passed |
| `vitest run src/entities/content/FieldRenderer/FieldRendererList.test.tsx` | 23 passed (10 new) |
| `vitest run src/pages/entry/EntryPage/EntryPageListLayouts.test.tsx` | 11 passed (2 new) |
| `pnpm --filter @lacecms/app-admin test` (full admin unit suite) | 189 files, 942 tests passed |
| `node scripts/check-boundaries.mjs` | passed |
| `playwright test e2e/media-multi-select.e2e.ts` | 5 passed, including axe audits at 320 px in light and dark |
| Full admin Playwright suite | 157 passed, 1 failed: `composites.e2e.ts` "pointer drag changes only the selected list", already failing on HEAD before this change (recorded in the SM3B progress log) |

## Root and CI steps (`.github/workflows/ci.yml`)

| Step | Result |
| --- | --- |
| `pnpm format:check` | passed |
| `pnpm lint` | passed |
| `pnpm typecheck` | passed |
| `pnpm test` | 44 turbo tasks passed; root suite 221/222 under Node 24.22.1 — `tests/release-artifacts.test.mjs` requires the pinned toolchain and passes 7/7 under Node 24.12.0 with pnpm 12.3.4 |
| `pnpm build` | passed |
| `pnpm acceptance:starter` | passed |
| `pnpm acceptance:existing-site` | passed |
| `pnpm openapi:check` | passed (no API change) |
| `pnpm spec:validate` | passed |
| `pnpm docs:check` | passed |
| `openspec validate sm03c-multi-select-media-picker --type change --strict` | valid |

## Notes

- Task 5.1 audits the multiple-mode dialog with the shared axe helper inside
  `e2e/media-multi-select.e2e.ts` rather than extending the shared
  `accessibility.e2e.ts` mock, which has no media list.
- The entry-wide budget cap is covered by unit tests (`media-list.test.ts`,
  `FieldRendererList.test.tsx`) rather than end to end, because reaching it in
  a browser needs about 500 rendered list rows.
- No API, contract, database, registry or template change; no
  `TEMPLATE_VERSION` bump.
