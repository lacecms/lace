# Verification

## Restart regression

The migrated, file-backed SQLite test reopens the database with two distinct
due events and drives the production VPS poller and its builder HTTP adapter
with fake time. Build A stays in flight for 60,001 ms and renews its lease.

| Configuration | Calls for A | Calls for B | B while A runs |
| --- | ---: | ---: | --- |
| Original batch claim and dispatch | 1 | 2 | Leased at poll start and marked running |
| One VPS claim and trigger-time lease check | 1 | 1 | Unleased with no started build row |

With the fix, both builds reached `succeeded`, both events were processed
with zero failed attempts, and later polls made zero additional calls.
Restoring the batch limit with the trigger-time check in place still failed
the regression because the poller leased B while A was running.

## Focused tests

| Coverage | Passed |
| --- | ---: |
| Application dispatch, build outcomes and registered handlers | 13 |
| Node dispatcher and builder trigger | 8 |
| VPS poll loop and Node production recovery | 6 |
| Repository build and lease contracts on file-backed and in-memory SQLite | 48 |
| Worker dispatch, mixed D1 query budget and outbox reporting | 17 |
| Repository build and lease contracts on local D1 | 24 |

The Worker tests verified the one-build limit for scheduled and post-commit
passes and the 50-query ceiling for mixed scheduled dispatch. The VPS tests
verified in-flight renewal, a peer taking B while A runs, and recovery of the
same build ID at expiry with the previous token rejected.

## Root checks

- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm format:check` passed.
- `pnpm exec openspec validate claim-site-builds-at-dispatch --type change --strict` passed.
