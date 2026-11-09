## Why

`lace db migrate --target cloudflare-remote` cannot initialize a fresh D1
database in 0.1.0-rc2. The baseline guard added by RF8X reads `d1_migrations`
before Wrangler applies anything. Cloudflare answers that query on an empty
database with HTTP 400 and a `no such table: d1_migrations` error. The REST
transport rejects every non-2xx status before inspecting the body, so the
operator sees "Cloudflare D1 or its local persisted state is unavailable" with
advice about `LACE_CLOUDFLARE_PERSIST_TO`. Even a 2xx missing-ledger answer
fails, because the guard only recognizes the raw SQLite message while the
transport raises a sanitized `SCHEMA_OUTDATED` error. The accepted
`operational-cli` requirement already says a missing ledger counts as a fresh
database, so first deployment on Cloudflare is blocked by a defect, found while
the owner onboarded an existing Astro site.

This is an owner-requested fix outside the refactoring roadmap's session units;
it ships with the next prerelease (rc3) and does not reorder the roadmap.

## What Changes

- The remote D1 transport inspects the bounded JSON body of non-2xx responses
  other than 401/403 for the missing-ledger signature of the ledger query and
  reports it as a missing ledger, independent of the HTTP status.
- The migration baseline guard treats the transport's missing-ledger result as
  a fresh database, so `db migrate` proceeds to Wrangler on a new remote D1.
- Other non-2xx provider answers that are not 401/403 keep sanitized
  OPERATION_FAILED/6. A 4xx query rejection reports an unsuccessful provider
  response; 5xx, 429 and network failures keep "unavailable".
- Remote-target recovery advice for an unavailable D1 names Cloudflare
  connectivity and the selected account/database, not
  `LACE_CLOUDFLARE_PERSIST_TO`; the local target keeps its persisted-state
  advice.
- Regression tests reproduce the provider's HTTP 400 missing-ledger answer for
  the transport and for the full `db migrate` command.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `operational-cli`: the migration requirement gains a scenario for a fresh
  remote D1 whose provider reports the missing ledger as a failed query; the
  recovery requirement makes D1 unavailability advice target-specific.

## Impact

- Code: `packages/cli/src/d1-transport.ts`, `packages/cli/src/migrate.ts`,
  `packages/cli/src/diagnostics.ts`.
- Tests: `packages/cli/src/d1-transport.test.ts`,
  `packages/cli/src/migrate.packaged.test.mjs`.
- Architecture: preserves deployment §Cloudflare deployment and §21
  (explicit, sanitized operations) and distribution §22 (rc1 baseline policy).
  No API, schema, package or template change; Node and local D1 behavior is
  unchanged.
- Release: users of rc2 work around it by running
  `wrangler d1 migrations apply DB --remote` once; the fix ships in rc3.
