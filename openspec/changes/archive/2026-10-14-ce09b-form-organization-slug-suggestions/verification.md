# CE9B verification — 2026-10-14

Implementation is complete. The six added requirements were synchronized into
five accepted capability specs and the change was archived on 2026-10-14 at
the owner’s request. All 72 main specs passed strict validation after sync.

## Delivered behavior

- Portable ordered sections/tabs on model, block data/settings and recursive group field maps, including list-item groups up to the six-container bound. Unknown properties/references, malformed modes and ambiguous placement fail normalization/transport validation; TypeScript fixtures restrict immediate sibling keys.
- Layout affects projection identity only. Pinned no-layout fixtures remain compatible; content/default keys named like layout metadata remain structural. Normalized metadata is detached/frozen.
- Persistent tab panels retain field/rich-text/media/list identity and values. Unlisted fields follow in declaration order. Summary links open every ancestor tab/disclosure and focus exact controls; problems follow visual order and hidden-block publication rules. Viewer navigation, absence, dirty state, busy locks, save/failure/conflict/reload/discard/revert flows are covered.
- Collection creation sends an initially automatic title-derived slug through the existing atomic create API. Manual changes/clear disable automatic mode, explicit re-enable resumes it, failures retain input and close/success resets it. NFKD/ASCII normalization trims after the 100-character boundary. Non-Latin/empty suggestions remain absent. Existing entry/duplicate behavior and route-conflict authority remain intact.
- Reference configuration demonstrates sections. Architecture, form/compatibility guides, starter managed guidance and upgrade instructions are updated; template ownership version is 0.28.0. No dependency or DDL migration was introduced.

## Planning correction

The initial change incorrectly promised that layout-only sync would leave published version/outbox unchanged. The accepted `configuration-synchronization` requirement requires all changed public projections to advance published state and create/coalesce a build atomically. The owner confirmed the correction on 2026-10-14. Delta spec, design, tasks and proposal now preserve that rule. SQLite/D1 tests prove unchanged snapshots, revisions and media references, one version advance/coalesced build, no-op repeat and atomic stale-plan refusal.

## Checks

| Check | Result |
| --- | --- |
| `pnpm --filter @lacecms/content test` | 106 passed, including malformed layouts and maximum-depth layout fixture |
| `pnpm --filter @lacecms/content type-test` | Passed, including group/block immediate-reference rejection |
| `pnpm --filter @lacecms/config test` | 58 passed, including projection/hash/content-key compatibility |
| `pnpm --filter @lacecms/config type-test` | Passed |
| `pnpm --filter @lacecms/contracts test` | 73 passed, including recursive model/block/settings metadata round-trip/rejection |
| `pnpm --filter @lacecms/application exec vitest run src/configuration-evolution.test.mjs` | 29 passed |
| Node repository contract filtered to CE9B | 2 passed (file-backed and in-memory SQLite) |
| Cloudflare repository contract filtered to CE9B | 1 passed (local D1) |
| Node `form-layout-product.test.mjs` | 1 passed; actual API metadata, atomic slug create/save, duplicate, slugless draft and route conflict retention |
| Worker `worker.test.mjs -t CE9B` | 1 passed; real Worker composition with auth and local D1/R2, metadata and matching slug lifecycle |
| `pnpm --filter @lacecms/app-admin test` | 169 files / 746 tests passed; after the final added busy-lock case, the focused `EntryPageLayout.test.tsx` suite passed all 7 cases |
| Focused create-dialog, entry-layout and browser-client tests | 34 passed before the final added busy-lock case |
| `pnpm --filter create-lace test` | 64 passed, including generation/ownership, marker hygiene and Astro onboarding build/dev |
| Root block-source and consumer-guide checks | Passed |
| Playwright `form-layout`, `field-guidance`, `block-envelope`, `composites`, `rich-text`, `editor`, `--workers=2` | 42 passed, including five CE9B cases and WCAG audits at 1280/390px plus viewer inspection |
| `pnpm typecheck` | Passed (root Turborepo plus project config) |
| `pnpm lint` | Passed (Oxlint, package boundaries and admin color guard) |
| `pnpm format:check` | Passed |
| `pnpm exec openspec validate ce09b-form-organization-slug-suggestions --type change --strict` | Passed |
| `git diff --check` | Passed |

Local D1 and browser/onboarding checks ran with sandbox escalation because the harnesses open loopback listeners; their first sandboxed attempts were blocked by `listen EPERM`. The first combined 42-case browser run overlapped root dependency builds and two pages reloaded mid-interaction; the complete rerun after builds settled passed 42/42 without test retries or product-code changes. These checks exercise local runtimes, not remote deployments.

A final repeated root typecheck briefly reported stale generated platform release
version files while platform build/typecheck tasks ran together. The same
`pnpm typecheck` command then passed all 35 tasks plus the root config check
without implementation changes. Final lint, format and strict validation also
passed.
