## Context

See `proposal.md` for motivation and session boundary. Observed behavior today:

- `@lacecms/domain` `SiteBuildStatus` and the shared SQL `site_builds_status_check` allow `pending | running | succeeded | failed` (migration `0000`). Contracts repeat that picklist in `siteBuildSchema` and `siteBuildRecordSchema`.
- Both repositories insert the build row as `pending` at claim and keep it `pending` during a synchronous VPS build. Outcomes are guarded by the live outbox lease (`locked_by`, unexpired `locked_at`) and `status = 'pending'`.
- `BuildTriggerResult` is `accepted{providerBuildId}` | `succeeded` | `failed{reason,path?}`. `DeployHookSiteBuildTrigger` returns `accepted` with a Cloudflare `result.id`, otherwise `succeeded`. `recordSiteBuildAccepted` sets `running` and completes the event; nothing ever calls `completeAcceptedSiteBuild` outside the contract suite, so such rows stay `running` forever (feedback §5).
- Retry is allowed only from `failed` (Node transaction check, D1 guard row).
- Node SQLite migrations run through Drizzle's migrator (`__drizzle_migrations` ledger created before any file runs). D1 runs the same files through `wrangler d1 migrations apply` (ledger `d1_migrations`); the Miniflare test harness executes the split statements directly and creates `d1_migrations` afterwards. Node never has a deploy-hook trigger; D1 never has the VPS builder.
- Admin `BuildStatus` renders a `Badge`; `coveringBuildState`/`publicationBuildDescription` drive the entry publication card; the tour and generated `lace-operations.md` describe `running` as provider acceptance and VPS builds as `pending` while building.

## Goals / Non-Goals

**Goals:** a seven-status lifecycle where only proof yields `succeeded`; claim-time `running` and orphan-free reclaim on both runtimes; repository and port transitions complete enough that 33E only adds a tracking adapter/poller; a safe one-shot reclassification of existing history; status explanations that are identical wherever a status is shown.

**Non-Goals:** polling the Pages API, tracking settings/secret, cron selection of due rows, backoff, deadlines, and new reason codes for cancellation/unknown outcomes (33E); exposing tracking stage/check times in DTOs (33E); CI callbacks; changes to coalescing, retry policy, lease length, timeouts, or 33C diagnostics.

## Decisions

### 1. One portable status vocabulary

`@lacecms/domain` exports `siteBuildStatuses` (the seven values, in lifecycle order), `SiteBuildStatus`, `terminalSiteBuildStatuses` (`accepted`, `succeeded`, `failed`, `cancelled`, `unknown`), `retryableSiteBuildStatuses` (`failed`, `cancelled`, `unknown`, `accepted`), `trackedSiteBuildOutcomes` (`succeeded`, `failed`, `cancelled`, `unknown`), and small predicates. Application, contracts, SQL helpers and admin derive from these; the SQL CHECK and retry SQL lists are written literally and covered by a parity test. `siteBuildRecord` keeps validating row statuses (an unrecognized stored value fails loudly rather than being shown).

### 2. Trigger outcomes and dispatcher mapping

`BuildTriggerResult` becomes:

| Result | Meaning | Dispatcher records |
| --- | --- | --- |
| `{ status: "succeeded" }` | Publication proven synchronously (VPS release switched) | `running → succeeded` |
| `{ status: "accepted", providerBuildId? }` | Provider accepted; outcome not tracked | `running → accepted` (terminal, completion time) |
| `{ status: "tracking", providerBuildId }` | Provider accepted; this runtime will track the exact deployment | `running` stays, provider ID stored, `provider_check_after = now`, event completed |
| `{ status: "failed", reason, path? }` | Failure | `running → pending` (retry) or `running → failed` (8th attempt) |

`DeployHookSiteBuildTrigger` returns `accepted` for every accepted 2xx, with the ID when valid. No adapter returns `tracking` in 33D; 33E makes the deploy-hook adapter return it when Pages tracking is configured. Ports: `recordSiteBuildAccepted({ leaseId, now, providerBuildId? })`, new `recordSiteBuildTracking({ leaseId, now, providerBuildId })`, and `completeTrackedSiteBuild({ buildId, providerBuildId, now, outcome, reason? })` replacing the unused `completeAcceptedSiteBuild`. `reason` is honoured only for `failed` (normalized through the 33C vocabulary, otherwise `provider_failed`); `cancelled`/`unknown` store no error in 33D — 33E adds their reason codes with the DTO change that displays them.

Rejected: keeping `completeAcceptedSiteBuild` from `accepted` — `accepted` is terminal by decision and late results must not reopen terminal rows. Rejected: letting the dispatcher decide tracking from configuration — the adapter knows whether it can track the returned deployment, matching the existing port style.

### 3. Repository transitions

Both adapters implement the same table; the shared contract suite proves parity.

- **Claim** (in the same Node transaction / D1 batch as the outbox lock): `insert or ignore` the row as `running` with `started_at = now`; then `update ... set status = 'running', started_at = coalesce(started_at, now) where id = ? and status in ('pending','running')` guarded by the new lease. A lease is returned only when the lock and this update each changed one row. This is the guarded `pending → running` (retry) or `running → running` (reclaim after a terminated process) step; the original start time survives reclaim. If the row is already terminal (defensive: inconsistent history), the same batch marks the event processed without dispatch, so it can never loop.
- **Outcomes** require the live lease and `status = 'running'` (was `pending`): success → `succeeded`; non-terminal failure → `pending` + structured error; terminal failure → `failed`; accepted → `accepted` with optional provider ID, `completed_at = now`, error cleared; tracking → stays `running`, sets provider ID and `provider_check_after = now`, clears error. All complete or reschedule the event atomically as today.
- **Tracked completion** has no lease: guard `id`, `provider_build_id`, `status = 'running'`, and the build's event being processed (`outbox_events.processed_at is not null`), so a dispatcher-owned `running` row can never be completed by a provider result. Sets status, `completed_at`, error (failed only), and clears `provider_check_after`. An identical repeat is a no-op; anything else on a terminal row is `CONTENT_INVALID_STATE`, so late results never reopen `unknown`.
- **Retry** guard becomes `status in ('failed','cancelled','unknown','accepted')`; the refusal message lists the retryable statuses.

Lease length, renewal, coalescing, debounce, eight-attempt policy, structured 33C errors and code-only outbox `last_error` are unchanged.

### 4. Migration `0003_site_build_outcomes`

SQLite cannot alter a CHECK constraint, so the migration rebuilds `site_builds` (nothing references it; it references `content_snapshots`, which stays valid): create `__new_site_builds` with the seven-value check and nullable `provider_stage TEXT`, `provider_checked_at INTEGER`, `provider_check_after INTEGER`; `INSERT ... SELECT` every row with reclassification; drop; rename; recreate `site_builds_history_idx`; add `site_builds_tracking_idx (status, provider_check_after)`. No `PRAGMA foreign_keys` statements (D1 rejects toggling them and none are needed). Drizzle schema and a generated snapshot keep `db:generate` clean; the SQL file is hand-finished and listed in `checkedInMigrations`.

Reclassification in the `SELECT`:

- `running` → `accepted`, `completed_at = coalesce(completed_at, started_at, requested_at)` on every runtime (no runtime ever tracked it).
- `succeeded` with `provider_build_id is null` → `accepted` **only on D1**, detected as the absence of Drizzle's `__drizzle_migrations` ledger in `sqlite_master`. Node's migrator always creates that ledger before running files; wrangler and the Miniflare harness never do. On Node, builder `succeeded` stays.
- Everything else is copied unchanged.

Rejected: a runtime data fix in Worker code (would run on every invocation and depend on deployment order); two migration files per runtime (the migration inventory is shared); heuristics on timestamps (Node and D1 rows are indistinguishable). Risk: a Node database migrated by hand outside the Drizzle migrator would be treated as D1; that path is unsupported and documented.

The tracking fields are added now so 33E needs no schema migration; no code reads them in 33D apart from setting `provider_check_after` on tracking and clearing it on completion.

### 5. Contracts and API

`siteBuildStatusSchema = v.picklist(siteBuildStatuses)` is used by both build schemas and `toSiteBuildRecordDto`; OpenAPI is regenerated. The status enum widening is the only DTO change, so mixed old/new admin bundles are unsupported (they ship together). External clients must tolerate the three new values; noted in operations docs.

### 6. Shared status map and popover

New admin entity `entities/site-build` owns `siteBuildStatusGuidance: Record<SiteBuildStatus, { label; badge; meaning; proof; next }>` and `BuildStatusBadge` (badge + info button + `Popover`). Builds rows, Builds detail and the entry publication details render it; the tour builds its Builds paragraph from the same map's labels and a fixed sentence about proof. The trigger is a `ghost` icon `Button` with `aria-label="About status <Label>"`, Radix popover content has `aria-label` and a heading, so pointer/touch/Enter/Space/Escape and focus return come from the primitive. `PopoverContent` width is capped at `min(18rem, 100vw - 2rem)` for 375px layouts. The 33C failure alert stays in the detail panel next to the status.

Status text (map is the single source; guide/tour use matching wording):

| Status | Meaning | Proves about public site | Next action |
| --- | --- | --- | --- |
| pending | Queued, debouncing, or waiting for an automatic retry | Nothing yet | Wait; see any failure reason shown |
| running | Lace is building, or tracking a provider deployment | Not yet updated by this build | Wait for a terminal status |
| accepted | Provider accepted the request; outcome not tracked | Not confirmed | Check the provider's deployment; retry if it failed |
| succeeded | Release switched or provider deploy succeeded | Published for this target version | None |
| failed | Build failed with a proven reason | Previous release still served | Apply the correction, then retry |
| cancelled | Provider cancelled or skipped the deployment | Not updated by this build | Check provider settings, then retry |
| unknown | Tracking stopped without proof | Unknown | Check the provider, then retry if needed |

`coveringBuildState` precedence: `succeeded`, `running`, `pending`, `accepted`, `unknown`, `cancelled`, `failed`; polling stops at any terminal state. Retry is offered to administrators for the four retryable statuses.

### 7. Verification

Shared repository contract cases (Node file/in-memory SQLite, local D1): claim-to-running, reclaim keeps start time and blocks the stale lease, retryable failure to `pending`, accepted with/without provider ID, tracking then completion (idempotent, mismatch, conflict, late result after `unknown`, refusal while dispatcher-owned), retry sources, terminal row with unprocessed event. Migration tests on both runtimes seed pre-`0003` rows and assert reclassification. Dispatcher unit tests cover each trigger result; deploy-hook tests cover acceptance without ID; Worker/Node composition tests update expectations. Admin unit tests cover the map, covering-state precedence, retry visibility and popover; Playwright opens every status popover by keyboard, runs axe with one open, and checks 375px overflow.

## Risks / Trade-offs

- Widening the enum breaks strict external API clients → documented as a coordinated upgrade; DTO shape otherwise unchanged.
- Runtime detection through `__drizzle_migrations` is implicit → covered by migration tests on both harnesses and documented in `docs/database-migrations.md`.
- Existing D1 `running`/`succeeded` history becomes `accepted` even if Pages actually deployed → truthful (Lace never proved it); operators can retry or verify in Pages.
- Tracking ports exist before an adapter uses them → exercised by the contract suite so 33E builds on tested behavior.

## Migration Plan

Stop the API/dispatcher (Node) or deploy during a quiet period (Worker), back up the database, apply migration `0003` with the matched engine version, then start/deploy the new API, dispatcher and admin together. In-flight Node builds whose rows were `pending` resume as `running` on reclaim. Downgrade = restore the pre-migration backup; older code rejects the new status values. Update §9.8 before code; update roadmap 33D and operations guidance after verification; archive after strict validation and syncing the ten deltas.
