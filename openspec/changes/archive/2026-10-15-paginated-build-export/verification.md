# Verification: paginated-build-export

Run on 2026-10-15, branch `feat/rc-export-contract`, macOS arm64, Node
24.12.0, pnpm 12.3.4. Prerequisite `public-contract-forward-compat` is
archived (`openspec/changes/archive/2026-10-15-public-contract-forward-compat`).

## Focused tests

| Package / command | Result |
| --- | --- |
| `@lacecms/domain` | 26 passed |
| `@lacecms/contracts` | 112 passed: page shapes, `globals`/`seo` required or forbidden per page, query rejections (`limit` 0/101/non-integer, empty or oversized `after`, unknown keys), 409 envelope with versions, strict/tolerant page parity |
| `@lacecms/application` | 86 passed, including page selection by limit and byte budget (oversized entry alone, globals counted on the first page) |
| `@lacecms/db` | 18 passed: cursor round-trip, empty-path cursor, foreign and malformed cursors, stored-byte expression (UTF-8, SEO, hidden blocks excluded), range SQL |
| `@lacecms/test-utils` | 47 passed, including in-memory paging, budget, stale and foreign cursors |
| `@lacecms/platform-node` | 239 passed: shared contract fixtures (path order, per-page media, hidden/draft exclusion, equivalence, byte budget, stale cursor after publish/unpublish/delete/media edit/sync, foreign cursors), 7 fixed statements per page, and a second-connection commit during a page read |
| `@lacecms/platform-cloudflare` | 165 passed: the same fixtures on local D1, a 100-entry page with two 200-block entries in 2 batches / ≤10 statements / ≤100 parameters, and a publication injected between the batches (first and continuation page) |
| `@lacecms/server` | 81 passed: keyset pages, per-page media, continuation ignores `If-None-Match`, 409 details, 422 before any read, authorization before conditional reads, OpenAPI parameters and 409 response |
| `@lacecms/sdk` | 99 passed: assembly and media merge, first-page-only conditional, restart once then fail, `restart: false`, page disagreement (version, repeated/earlier path, media, continuation `globals`/`seo`, empty page with cursor, ETag mismatch), single-page reads, first-page hook; loader static/revalidate traversal, expected-version fail-fast and 409/exhaustion mapped to `version_mismatch` |
| `@lacecms/astro` | 38 passed, including a paged static build and expected-version fail-fast |
| `apps/builder` | 50 passed; the version probe requests `?limit=1` |
| `apps/api` (`pnpm test`) | 24 passed: Node listener and workerd smoke read the export through `readCompleteBuildExport` |
| `apps/site`, `create-lace` onboarding | 3 / 3 passed |
| `pnpm exec vitest run tests …` (root `tests/`) | 27 files, 156 passed |
| `pnpm exec vitest run --config vitest.cross-runtime.config.mjs` | 1 passed; the API journey follows one-entry pages on both runtimes |
| `pnpm exec vitest run --config vitest.d1-budgets.config.mjs` | 2 passed (see evidence below) |
| `pnpm acceptance:starter` | passed: packed starter built with and without published globals |
| `apps/admin`: `playwright test block-order.e2e.ts` | 1 passed |
| `apps/admin`: `pnpm test:acceptance` (`acceptance.e2e.ts`) | 1 passed (31 s) on a fresh Docker stack, which was then stopped and removed. The old step-34 artifacts were moved to `.lace-acceptance-old/` so the stack could start. The spec had drifted before this change and needed three test-only fixes: `exact: true` on the "Title" textbox (CE4C added "SEO title"); the note step now asserts the slug suggested by the create dialog (CE9B) and edits `summary` so "Save draft" is enabled; and the member visibility checks match "Users"/"Settings" exactly, because the "Site settings" global link also matched. Its export reads now use `readCompleteBuildExport` |

## D1 page evidence

Every page request below includes build-token verification. Two batches per
page; first pages use 8 statements, continuation pages 7. Rows read are
constant per page after the global reads were driven from `content_models`.

| Site | Page entries | D1 queries | Rows read (page 1 / later) | Wall clock (local) |
| --- | --- | --- | --- | --- |
| 100 entries | 3, 97 | 10, 9 | 3411 / 1941 | 47 ms / 21 ms |
| 201 entries | 3, 100, 98 | 10, 9, 9 | 3417 / 2012 | 37 ms / 17–24 ms |
| 501 entries | 3, 100 × 4, 98 | 10, 9 … | 3417 / 2012 | 34 ms / 11–19 ms |

Entries 0–3 hold near-1 MB JSON, so the 4,000,000-byte budget ends the first
page after three entries; the following pages end at the 100-entry limit.
Wall-clock times come from Miniflare on a laptop and are evidence only; the
Workers Free 10 ms CPU limit stays best effort, as documented.

## Root gates

| Command | Result |
| --- | --- |
| `pnpm typecheck` | 35 of 35 tasks passed |
| `pnpm lint` | passed; the remaining warnings are pre-existing (db and test-utils tests, admin `BlockSettingsPanel`, builder test) |
| `pnpm format:check` | passed |
| `pnpm openapi:check` | passed with the regenerated `apps/api/openapi/api-v1.json` staged: `after`/`limit` parameters, a first/continuation page union and a 409 response |
| `pnpm exec openspec validate paginated-build-export --type change --strict` | valid |

## Implementation notes

- A page always holds at least one entry while entries remain, including a
  first page whose globals already exceed the byte budget. This follows the
  `rest-contracts` and `application-ports-and-commands` deltas; design D2's
  zero-entry first page therefore never occurs. The cursor codec still
  accepts the empty path.
- The snapshot, block and media statements cover the page's entries and, on
  a first page, the globals, so a first page needs 8 statements (2 + 6)
  rather than separate global snapshot, block and media reads.
- The SDK checks that each continuation page starts after the highest path
  already delivered; order inside one page stays the server's guarantee.
- `BuildExportCursorError` and `BuildExportVersionChangedError` are domain
  errors re-exported by `@lacecms/application`, so the server keeps its
  dependency boundary. `@lacecms/test-utils` may now depend on
  `@lacecms/contracts` for the strict raw-export reader.
- `apps/admin/e2e/block-order.e2e.ts` read a draft-shaped export
  (`entries[0].entry.published`); it now reads public blocks through the
  shared reader.
