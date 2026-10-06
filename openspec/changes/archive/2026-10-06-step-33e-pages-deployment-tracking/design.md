## Context

See `proposal.md`. Observed after 33D:

- `BuildTriggerResult` already has `tracking{providerBuildId}`; `SiteBuildDispatcher` maps it to `recordSiteBuildTracking`, which keeps the row `running`, stores the provider ID, sets `provider_check_after = now` and completes the outbox event atomically. No adapter returns it yet.
- `completeTrackedSiteBuild({buildId, providerBuildId, now, outcome, reason?})` is guarded by ID, provider ID, `running`, and a processed event; it is idempotent and rejects conflicts. `trackedOutcomeError` stores a reason only for `failed`.
- `site_builds` already has `provider_stage`, `provider_checked_at`, `provider_check_after` and `site_builds_tracking_idx (status, provider_check_after)`; nothing reads them.
- `DeployHookSiteBuildTrigger` returns `accepted` with an optional validated ID. The Worker's `scheduled` handler runs site-build dispatch (1 claim) then media deletion (5 claims) under a 50-query budget; the cron is `* * * * *`.
- Admin Builds detail renders `buildFailureGuidance[error]` in a destructive alert for any stored error and shows the provider ID.

Pages API (official reference): `GET /client/v4/accounts/{account_id}/pages/projects/{project_name}/deployments/{deployment_id}` with a Bearer token holding *Pages Read*. `result.latest_stage.name ∈ {queued, initialize, clone_repo, build, deploy}`, `result.latest_stage.status ∈ {idle, active, success, failure, canceled, skipped}`, `result.is_skipped`. The body also contains `env_vars`, `build_config`, `deployment_trigger` etc., so it is never stored or logged.

## Goals / Non-Goals

**Goals:** proof-based terminal outcomes for Pages deployments started by the hook; a hard overall deadline; bounded, restart-safe, idempotent polling isolated from the outbox; secrecy of token and provider responses; parity of the new repository ports on Node and D1; visible stage, last check and next action in Builds.

**Non-Goals:** CI callbacks for generic hooks (deferred, see Decision 9); Workers Builds or other providers; Pages dashboard deep links; new database migration; changes to outbox leases, retry policy, coalescing or 33C diagnostics; CLI credentials (33F).

## Decisions

### 1. Settings

| Variable | Kind | Rule |
| --- | --- | --- |
| `LACE_PAGES_ACCOUNT_ID` | variable | 32 lowercase hex characters |
| `LACE_PAGES_PROJECT_NAME` | variable | Pages project name: `^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$` |
| `LACE_PAGES_API_TOKEN` | secret | non-empty, no whitespace, ≤ 512 chars; token with only *Account · Cloudflare Pages · Read* |
| `LACE_PAGES_TRACKING_TIMEOUT_MINUTES` | variable | integer 5–1440, default 60 |
| `LACE_PAGES_API_BASE_URL` | variable | development mode only; `https:` or loopback `http:` URL ending in `/`; default `https://api.cloudflare.com/client/v4/` |

The three identity settings are all-or-none: any one present makes the others required, and each problem is reported by variable name only. Timeout or base URL without identity settings are validated but unused. A base URL in production mode is an `invalid` issue (prevents sending the token elsewhere). `CloudflareSettings.pagesTracking?: { accountId, projectName, apiToken, apiBaseUrl, timeoutMs }`. The D1 operator token (`CLOUDFLARE_API_TOKEN`) is never read by the Worker.

Default deadline 60 minutes: a Pages build is limited to 20 minutes, plus queueing behind the project's concurrent-build limit and deploy; 60 minutes covers normal queues while bounding a stuck `running` to one hour. Operators with long queues raise it up to 24 hours.

### 2. Deploy hook

`DeployHookSiteBuildTrigger` gains `tracked?: boolean`. A 2xx with a valid ID returns `{status: "tracking", providerBuildId}` when `tracked`, else `accepted`; without an ID it is always `accepted` (untracked, terminal). The Worker passes `tracked: settings.pagesTracking !== undefined`.

### 3. Domain vocabulary and policy

`@lacecms/domain`:

- `siteBuildFailureReasons` (the closed diagnostic vocabulary used by `error`) appends `provider_build_failed`, `provider_deploy_failed`, `provider_cancelled`, `provider_skipped`, `tracking_forbidden`, `tracking_not_found`, `tracking_rejected`, `tracking_timeout`, `tracking_unconfigured`. Appending keeps the source-reason slice intact.
- `trackedOutcomeReasons: Record<TrackedSiteBuildOutcome, readonly reason[]>` — `succeeded: []`, `failed: [provider_build_failed, provider_deploy_failed, provider_failed]`, `cancelled: [provider_cancelled, provider_skipped]`, `unknown: [tracking_*]`. `normalizeTrackedOutcomeReason(outcome, reason)` returns the reason when allowed, `provider_failed` for any other `failed`, otherwise `undefined`. `trackedOutcomeError` in `@lacecms/db` uses it, so `cancelled`/`unknown` store only their own codes (33D contract cases with foreign text still store nothing).
- `siteBuildProviderStages = [queued, initialize, clone_repo, build, deploy]` with `isSiteBuildProviderStage`.

### 4. Ports

`SiteBuildDispatchPort` (both repositories) gains:

```ts
claimTrackedSiteBuildChecks({ now, limit, leaseMs }): Promise<readonly TrackedSiteBuildCheck[]>;
// { buildId, providerBuildId, trackingStartedAt, lastCheckedAt? }
recordTrackedSiteBuildCheck({ buildId, providerBuildId, now, checkAfter, stage? }): Promise<boolean>;
completeTrackedSiteBuild({ ..., stage? }) // stage recorded with provider_checked_at = now
```

New port `ProviderDeploymentReader.read(providerBuildId): Promise<ProviderDeploymentObservation>`:
`progress{stage}` | `outcome{outcome: succeeded|failed|cancelled, reason?, stage}` | `forbidden` | `not_found` | `rejected` | `transient`.

### 5. Repository semantics (Node transaction / D1 statements)

- **Claim checks:** select `site_builds b join outbox_events e on e.id = b.id` where `b.status = 'running'`, provider ID not null, `b.provider_check_after <= now`, `e.processed_at is not null`, ordered by `provider_check_after, id`, limited (1–25). For each row a guarded `update site_builds set provider_check_after = now + leaseMs where id = ? and status = 'running' and provider_build_id = ? and provider_check_after = <selected value>`; only rows with one change are returned. D1 does the updates in one batch (2 queries per claim call). `trackingStartedAt` = `e.processed_at` (the tracking acceptance commit), `lastCheckedAt` = `provider_checked_at`. The check lease (60 s) prevents overlapping runs from polling the same deployment and makes a crashed check due again — restart recovery without in-memory state.
- **Record check:** `update ... set provider_check_after = ?, provider_stage = ?, provider_checked_at = now` (stage variant) or only `provider_check_after` (transient variant) guarded by ID, provider ID and `running`; returns whether one row changed.
- **Completion:** unchanged guards and idempotence; additionally sets `provider_stage`/`provider_checked_at` when a stage is supplied, and clears `provider_check_after`.

### 6. Tracker algorithm (`SiteBuildTracker.runOnce(limit)`)

Constants (domain/application): poll interval 30 s (below the 60 s cron so every run sees due rows), check lease 60 s, maximum backoff 10 min, not-found grace 5 min, default deadline 60 min.

For each claimed check (sequentially; one failure is logged and never stops the rest):

1. No reader configured → complete `unknown` / `tracking_unconfigured`.
2. `observation = await reader.read(id)`; a thrown error is `transient`. `t = clock.now()`, `deadline = trackingStartedAt + timeoutMs`.
3. `outcome` → complete with its outcome/reason/stage. `forbidden` → `unknown`/`tracking_forbidden`. `rejected` → `unknown`/`tracking_rejected`. `not_found` after the grace → `unknown`/`tracking_not_found` (inside the grace it is treated as transient: the deployment may not be listed yet).
4. Otherwise, if `t >= deadline` → `unknown`/`tracking_timeout` (with the last observed stage when progress).
5. `progress` → record stage, `checkAfter = min(t + 30 s, deadline)`.
6. `transient` → `gap = t − (lastCheckedAt ?? trackingStartedAt)`, `checkAfter = min(t + clamp(gap, 30 s, 10 min), deadline)` — the interval roughly doubles while the API keeps failing, without extra state, and the deadline is never skipped.

A rejected completion (`CONTENT_INVALID_STATE`, e.g. a concurrent run already finished it) is logged as `tracking_conflict` and ignored. Logs carry build ID and closed reason only.

### 7. Pages reader

`PagesDeploymentStatusReader({ accountId, projectName, apiToken, apiBaseUrl, fetch?, timeoutMs = 10 000 })`. One `GET` with `authorization: Bearer`, `accept: application/json`, `redirect: manual`, `AbortSignal.timeout`. The provider ID is path-encoded; IDs are already restricted by the hook pattern. Body read with a 256 KiB cap (larger → `transient`) and never surfaced.

| Response | Observation |
| --- | --- |
| network error, timeout, `408`/`425`/`429`/`5xx`, oversize, invalid JSON, `success !== true`, `result.id` ≠ requested ID, unknown stage name/status | `transient` |
| `401`, `403` | `forbidden` |
| `404` | `not_found` |
| other non-2xx (incl. 3xx) | `rejected` |
| `is_skipped: true` or stage status `skipped` | `outcome cancelled / provider_skipped` |
| stage status `canceled` | `outcome cancelled / provider_cancelled` |
| stage status `failure` at `build` | `outcome failed / provider_build_failed` |
| stage status `failure` at `deploy` | `outcome failed / provider_deploy_failed` |
| stage status `failure` at another stage | `outcome failed / provider_failed` |
| `deploy` + `success` | `outcome succeeded` |
| `idle`/`active`, or `success` before `deploy` | `progress{stage}` |

### 8. Worker composition and scheduling

`CloudflareRuntime` gains `buildTracker`. `scheduled` runs site-build dispatch, then tracking (`SCHEDULED_TRACKING_CHECKS = 5`), then media deletion, each through the existing isolated `dispatch()` wrapper (new name `site-build-tracking`). Post-commit passes do not poll. Worst-case D1 queries per run: dispatch ≤ ~6, tracking 2 + 5 × 1 (+1 on a rare conflict re-read), media ≤ 5 × 4 — within 50; a Worker test asserts the bound with tracked rows due. Five Pages subrequests at 10 s timeout stay far below scheduled-handler limits.

### 9. CI callback decision

Deferred. A callback after `pnpm build` cannot prove publication, a callback after deploy needs a new credential type, route and replay protection, and Pages tracking covers the supported Cloudflare path. Generic hooks remain honest `accepted`; documented as a non-goal.

### 10. Contracts and admin

`siteBuildRecordSchema` gains optional `providerStage` (picklist of the five stages) and `providerCheckedAt` (ISO timestamp); `SiteBuildRecord`, `siteBuildRecord()` (ignores unknown stored stage) and `toSiteBuildRecordDto` carry them; OpenAPI regenerated. Builds detail adds "Provider stage" (human label) and "Last checked" rows when present, refetches detail every 5 s while the build is `pending`/`running`, and renders the reason panel as destructive only for `failed`/`pending` (warning-neutral styling for `cancelled`/`unknown`). `buildFailureGuidance` adds explanations/next actions for the nine reasons, e.g. `tracking_forbidden`: "Give LACE_PAGES_API_TOKEN Pages Read on the account, check the deployment in Pages, then retry if needed."; `tracking_timeout`: "Check the deployment in Pages; retry, or raise LACE_PAGES_TRACKING_TIMEOUT_MINUTES for long queues." The running status guidance mentions tracking with a deadline.

### 11. Verification

Domain unit tests (reason/stage vocabulary, normalization); application tracker tests with fake port/reader/clock covering every observation, grace, deadline, backoff growth and cap, unconfigured, conflict isolation; shared repository contract cases on Node SQLite and local D1 (claim lease exclusivity and expiry, exact-provider guards, stage recording, completion with stage, late result, parallel builds, terminal rows ignored); Pages reader tests against a stub `fetch` for every table row plus token/URL secrecy; settings tests; Worker tests on Miniflare D1 with stubbed global `fetch` for hook + Pages API: success, Astro build failure, deploy failure, cancel/skip, transient outage then success, insufficient permission, parallel builds and late results, restart recovery with a fresh Worker object, hook without ID, deadline, tracking removed, query budget; contract/OpenAPI tests; admin Builds tests for stage/last check and new reasons.

## Risks / Trade-offs

- Pages API shape drift (new stage or status) → treated as transient and ends `unknown`/`tracking_timeout` at the deadline instead of a false outcome.
- Deadline too short for slow queues → configurable; `unknown` is retryable and truthful.
- Deploy hook ID is assumed to be the deployment ID (Pages envelope `result.id`) → a mismatch yields `not_found` → `unknown` with guidance, never `succeeded`.
- A token with broader permissions still works; least privilege is documented, not enforceable.
- `trackingStartedAt` relies on the processed outbox event row; events are never purged today. A future purge must keep events of `running` builds (noted in §9.8).

## Migration Plan

No schema migration. Deploy the new Worker and admin together. Existing `accepted` rows stay terminal. To enable tracking: create a Pages Read token, `wrangler secret put LACE_PAGES_API_TOKEN`, set `LACE_PAGES_ACCOUNT_ID` and `LACE_PAGES_PROJECT_NAME` in `vars`, deploy. Rollback: remove the settings — tracked rows then end as `unknown`/`tracking_unconfigured` on the next run; downgrading the Worker leaves them `running` (older code has no tracker), so remove settings and let one run finish them first.
