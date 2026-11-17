# Preview implementation verification

## PV1A verified on 2026-11-17

Tasks 1.1–1.8 passed. The shared application and SQL layers implement admission,
immutable input capture, runner claims, finalization, expiry, invalidation and
recovery. Invalidation shares the guarded publication, content removal, model
removal and media deletion transactions. Preview runtime creation and routes
remain disabled. The next unchecked task is 2.1 (PV1B).

The approved capture fence uses a preview-only epoch. The migration trigger
advances the epoch when a committed in-place write updates the current published
snapshot's revision or timestamp. Resumable published block migration changes
that epoch before the usual public version advances. Admission and the atomic
input seal check the epoch, configuration and public version. The race contract
runs an actual repository block migration between pages and verifies failure
with `PREVIEW_CONTEXT_CHANGED`, without sealing or automatically recapturing.

### Test results

- `pnpm --filter @lacecms/platform-node test src/repository-contract.test.ts`:
  295 passed across file-backed and in-memory SQLite.
- `pnpm --filter @lacecms/platform-cloudflare test src/repository-contract.test.ts
  src/d1-migration.test.ts src/d1-content-repository.test.ts src/d1-sync-batch.test.ts
  src/repository/publication-race.test.ts src/repository/media-budget.test.ts`:
  171 passed on local D1 using Miniflare with loopback access.
- Final focused reruns passed 30 preview cases on SQLite and 16 cases on local
  D1, including the preview migration. Additional schema and migration, shared
  read, SQLite publication race, conditional publication, route policy, schema
  validation and packaged entry point suites passed.
- `pnpm typecheck`, `pnpm lint` (including boundary and Drizzle checks),
  `pnpm format:check`, `pnpm openapi:check` and
  `pnpm exec openspec validate add-protected-draft-preview --type change --strict`
  passed.

### Limits observed in PV1A

One capture reads up to three pages of up to 100 published entries and records
per page, with globals in the first page. The 301-entry fixture rejected the
fourth page with `PREVIEW_RESOURCE_LIMIT` after 36 D1 statements and 7,320 rows
read. Oversized globals were rejected after the three preflight statements.
Capture also caps the configuration at 128 models, stored input at 8 MiB and
media dependencies at 2,000. These are implementation limits of PV1A.

Maintenance processes at most three deadlines and two private namespaces per
pass, deleting at most 64 objects per namespace operation. The recovery contract
covers unconfirmed termination, object store failure, and a SQL failure after
the objects are gone. It verifies that an unconfirmed executor retains the slot
and that recovery retries cleanup without restarting the build. The object
store and executor were injected fixtures. Session handoff, private delivery
and real runtime execution are later checkpoints.
