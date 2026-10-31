# SM3A verification

Date: 2026-10-31. Change: `sm03a-media-tag-storage-api`.

## Implemented behavior

- Shared ASCII normalization: reject controls before trimming, trim surrounding
  spaces, lowercase ASCII A–Z, require `[a-z0-9-]{1,40}`. No NFKC,
  transliteration or internal-space replacement. Deduplicate and sort tags;
  enforce 20 distinct item tags and five input filter tags.
- Generated additive migration `0014_media_tags`, inventory and Drizzle snapshot:
  composite primary key, cascading FK, reverse tag index, length/alphabet/NUL
  constraints. Existing items start without tags.
- Atomic create, replacement and final removal on SQLite and D1; optimistic
  concurrency, tags-only edits without public-version/build changes, combined
  descriptive edits retaining the previous build behavior.
- Admin DTO tags, upload text parts, AND filtering with query-bound cursors,
  prefix catalog with counts and keyset continuation. Public DTOs and build
  exports keep their existing projection; MCP gains no media access.
- Admin client/type compatibility without UI changes. Template `0.42.0`,
  migration/backup/rollback instructions and six generated-project snapshots.

## Focused checks

| Check | Result |
| --- | --- |
| Domain normalization tests | 27 passed |
| Application tests, including validation-before-I/O and build effects | 115 passed |
| DB tests, including canonical filters and prefix cursors | 24 passed |
| Contracts, including exact tag issue positions and strict DTOs | 152 passed |
| Server, including invalid-upload storage count, auth, repeated tags and ETags | 97 passed |
| Shared tag repository cases on file SQLite, memory SQLite and local D1 | Passed without skipped runtime-specific assertions |
| Migration and schema tests | SQLite and local D1 passed; ASCII/length/duplicate/FK checks covered by the shared suite |
| Full `vitest.d1-budgets.config.mjs` | 3 passed |
| Full `vitest.cross-runtime.config.mjs` | 3 passed, including Node/Worker tag API parity and existing API/Astro/browser journey |
| Admin tests | 859 passed; required DTO fixtures updated and catalog/filter client test added |
| Full Node adapter suite | 292 passed |
| Full Cloudflare adapter suite | 208 passed |
| Packed starter acceptance | Passed |
| Packed existing-site acceptance | Passed |
| Generated project snapshots | All six variants match two independent byte-stable regenerations |

The 500-item D1 case uses five AND filters, first and continuation pages and a
prefix catalog; each HTTP invocation is bounded to ten D1 statements and at
most 100 parameters. The existing scheduled deletion test continues to process
five items within 50 statements: final deletion checks the event lease and
payload inside its mutation guard instead of making a redundant preliminary
read. Tags are explicitly removed in the same guarded batch, independently of
foreign-key enforcement. Failed guards and injected checkpoints preserve tags.
D1 batch transaction behavior was cross-checked against the official
[D1 database documentation](https://developers.cloudflare.com/d1/worker-api/d1-database/).

## Root and CI checks

- `pnpm build`: passed, all 22 tasks.
- `pnpm typecheck`: passed, all 38 tasks plus project configuration.
- `pnpm lint`: passed, Oxlint and repository boundary/color checks.
- `pnpm format:check`: passed.
- `pnpm docs:check`: passed.
- `pnpm --filter @lacecms/app-docs test:variants`: passed.
- `pnpm acceptance:starter` and `pnpm acceptance:existing-site`: passed against
  locally packed packages, including consumer frozen installs.
- `pnpm spec:validate`: 84 items passed.
- `pnpm exec openspec validate sm03a-media-tag-storage-api --type change --strict`:
  passed.
- `pnpm openapi:check`: generation is byte-stable. The ordinary working-tree
  invocation fails only at its final `git diff --exit-code` because this change
  updates the tracked artifact. The complete command passes with a temporary
  Git index containing the proposed OpenAPI JSON; the real staging index is
  unchanged. Repeated artifact SHA-256:
  `64a1c29a86391138360db3085be8546926ee51d014b9aeb004f425018da37164`.
- `git diff --exit-code -- pnpm-lock.yaml`: passed; dependency declarations and
  lockfile are unchanged. CI toolchain/browser installation steps are environment
  provisioning; existing local dependencies and browser executables were used.

The first full `pnpm test` invocation on Node 24.22.1 passed all 44 package
build/test tasks and 221/222 root tests. The remaining release-artifact test
requires exactly Node 24.12.0, failing before its injected pack failure on any
other Node version. The full suite is rerun with the installed pinned Node
24.12.0 and pnpm 12.3.4: **passed**, all 44 package build/test tasks and
**222/222 root tests**, 3015 tests in the combined summaries.

No production database was migrated and no release was published. Sync and
archive remain separate explicit owner actions.
