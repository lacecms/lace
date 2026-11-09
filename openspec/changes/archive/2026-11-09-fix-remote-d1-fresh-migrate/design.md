## Context

`lace db migrate --target cloudflare-remote` (`packages/cli/src/commands.ts`)
first calls `assertD1Baseline` (`migrate.ts`), which runs
`select name from d1_migrations` through `RemoteD1Database`
(`d1-transport.ts`), then runs the project's Wrangler
`d1 migrations apply DB --remote` and reads the ledger again.

Two defects block a fresh remote database:

1. `RemoteD1Database.execute` throws `d1-unavailable` for every non-2xx status
   other than 401/403 before it parses the body. Cloudflare's D1 query API
   answers a SQL error, including `no such table: d1_migrations`, with HTTP
   400 and an `errors` array, so the missing-ledger branch is never reached.
2. When the body is parsed (2xx), the transport raises a sanitized
   `CliError("SCHEMA_OUTDATED", "D1 migration ledger is missing.")`, but
   `missingLedger()` (`diagnostics.ts`) only matches the raw SQLite message
   in an error chain. `assertD1Baseline` therefore rethrows it, and the command
   still fails with SCHEMA_OUTDATED.

Existing tests stub the missing-ledger answer with HTTP 200 and exercise only
`content sync`/`auth bootstrap`, where SCHEMA_OUTDATED is the correct
outcome, so neither defect was caught. `doctor` already parses the body
regardless of status and is not affected. The local target uses Miniflare,
whose raw SQLite error `missingLedger()` recognizes, and is not affected.

## Goals / Non-Goals

**Goals:**

- A fresh remote D1 migrates in one `lace db migrate` run.
- The transport recognizes the missing ledger independently of HTTP status.
- Remote advice no longer points at local persisted state.

**Non-Goals:**

- Changing preflight, doctor, Wrangler invocation, credentials resolution or
  the Node/local D1 paths.
- Bounding or otherwise reworking how successful D1 bodies are read.
- Shipping a release; the fix is carried by rc3.

## Decisions

- **Typed missing-ledger error.** `diagnostics.ts` exports
  `MissingLedgerError extends CliError` (code `SCHEMA_OUTDATED`, exit 5,
  fixed message). The transport throws it, and `missingLedger()` returns true
  for it before checking raw messages. `assertD1Baseline` then counts it as a
  fresh database, and `assertD1Schema` still converts it into its own
  SCHEMA_OUTDATED result, so sync/bootstrap behavior is unchanged. The class
  lives in `diagnostics.ts` (which already owns ledger recognition and imports
  `CliError` from `index.ts`) so `migrate.ts` needs no new dependency on the
  Miniflare-backed transport module. Rejected: matching the sanitized message
  string (fragile) and catching every `SCHEMA_OUTDATED` in the guard (would hide
  a future outdated-schema signal).
- **Parse error bodies except authorization.** For 401/403 the body stays
  unread and cancelled, keeping `d1-auth`. For any other non-2xx status the
  transport tries `response.json()`; a missing-ledger signature for the
  ledger-only query raises `MissingLedgerError`. Otherwise it raises
  OPERATION_FAILED with `d1-response` for 4xx (the provider rejected the query)
  and `d1-unavailable` for 5xx and 429 (throttling), keeping the existing `HTTP <status>` message.
  An unparsable error body falls back to the same status mapping. Provider text
  is inspected only for the fixed regular expression and never returned.
- **Target-specific unavailable advice.** The `d1-unavailable` catalog entry in
  `failureDiagnostic` selects its recovery line from `target`: remote advice
  names Cloudflare connectivity and the selected `CLOUDFLARE_ACCOUNT_ID` and
  `LACE_D1_DATABASE_ID`; local keeps the `LACE_CLOUDFLARE_PERSIST_TO` text.
  The reason line becomes target-specific too.

## Risks / Trade-offs

- [Cloudflare changes the error status or wording] → recognition depends only
  on the existing `no such table: d1_migrations` regular expression shared with
  doctor; status no longer matters.
- [A 4xx previously reported as "unavailable" now reads "unsuccessful
  response"] → codes and exit statuses are unchanged; only the advice text
  differs, which the spec now requires.

## Migration Plan

No data or configuration migration. rc2 operators can apply migrations once
with `wrangler d1 migrations apply DB --remote --config worker/wrangler.jsonc`
and then rerun `lace db migrate`; after rc3 the single command suffices.
