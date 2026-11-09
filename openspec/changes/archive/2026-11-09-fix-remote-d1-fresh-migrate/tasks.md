## 1. Missing-ledger recognition

- [x] 1.1 Add `MissingLedgerError` (SCHEMA_OUTDATED, exit 5, fixed message) to `packages/cli/src/diagnostics.ts` and make `missingLedger()` recognize it before raw messages
- [x] 1.2 In `packages/cli/src/d1-transport.ts`, keep 401/403 as `d1-auth` with the body cancelled; parse other non-2xx bodies, raise `MissingLedgerError` for the ledger query's `no such table: d1_migrations` signature at any status, otherwise map 4xx to `d1-response` and 5xx or 429 to `d1-unavailable`

## 2. Recovery advice

- [x] 2.1 Make the `d1-unavailable` reason and recovery in `failureDiagnostic` target-specific: remote names Cloudflare connectivity and the selected account/database, local keeps `LACE_CLOUDFLARE_PERSIST_TO`

## 3. Tests

- [x] 3.1 `d1-transport.test.ts`: HTTP 400 missing ledger raises `MissingLedgerError`; HTTP 400 other SQL error raises `d1-response` without provider text; HTTP 503 and 429 raise `d1-unavailable`
- [x] 3.2 `migrate.packaged.test.mjs`: `runCommand` `db migrate --target cloudflare-remote` against a stubbed provider that answers the first ledger read with HTTP 400 `no such table: d1_migrations` runs the stub Wrangler and returns MIGRATED with the installed versions
- [x] 3.3 Assert remote `d1-unavailable` diagnostics omit `LACE_CLOUDFLARE_PERSIST_TO` while local diagnostics keep it

## 4. Verification

- [x] 4.1 Run the CLI unit and packaged tests, root typecheck, Oxlint, Oxfmt check and `openspec validate fix-remote-d1-fresh-migrate --type change --strict`
