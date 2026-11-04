# Verification

## Baseline (before implementation)

Clean builds of `@lacecms/db` and `@lacecms/config` completed. Raw runtime
keys, declaration names, Vitest lists and Drizzle export were retained in a
session scratchpad for comparison and deleted after the comparisons passed.
The initial declaration inventory records declaration kind as well as name.

- Runtime keys: db 202; config 10.
- Declaration inventory: db 241; config 34.
- Vitest listed cases: db 27; config 50; platform-cloudflare 79.
- Drizzle export SHA-256: `42bcf8608c7fc5cbee6ed1e2ba92fef348a974bb8e5a6bbff041c3da88f1fc0a`.
- OpenAPI SHA-256: `2d27764152253af8a9616208077f59a64ddd896bdc114f46885bce155825a8d5`.

## Schema split

The seven table modules changed Drizzle export ordering and therefore its bytes. The decision 5 fallback retains the original table definitions in `schema/tables.ts`; its export SHA-256 matches the baseline and `db:check` passes.

## Completed comparisons

After clean builds, the runtime exports (202 db, 10 config) and declaration
names and kinds (241 db, 34 config) match the recorded baselines. The sorted
Vitest title multisets match for db (27 original plus one drift case), config
(50) and platform-cloudflare (79). The collection-list snapshot was moved
byte-for-byte. Drizzle export and OpenAPI SHA-256 values match the baselines.
Only the package entry remains at the root of either clean `dist/`.

The moved Worker safety test passes and detects a temporary side-effect
`node:fs` import in a moved db module. The migrated-schema column test passes
and reports the list, table and column for an injected missing media column.
`db:check` passes and reports a pending migration for an injected schema
column without changing the checked-in migration directory.

The existing config type test's `@ts-expect-error` for an invalid site name was
moved to the property where TypeScript reports the error; the assertion and
input are unchanged.

## Workspace gates

Root `typecheck`, `lint` (including `db:check`), `format:check`, `build`,
`test`, `openapi:check`, `spec:validate` (87 items) and strict change validation
passed. The full test run completed 64 Turbo tasks, then 35 root files / 284
cases; db has 28 cases, config 76, Node SQLite 309 and Cloudflare D1 218.
The first sandboxed attempt could not bind a loopback port, so the full run used
local socket access. A subsequent run on Node 24.22.1 passed, with the package
results cached; the preceding uncached package run also used Node 24.22.1.

At the owner's request, the release-failure unit test simulates the pinned
release Node version so it tests cleanup without requiring that exact runtime;
release preparation still enforces its production toolchain. The root test
passes on Node 24.22.1 as well as on the pinned toolchain.
