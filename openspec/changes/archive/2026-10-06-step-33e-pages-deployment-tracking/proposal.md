## Why

Roadmap Step 33, Session 33E — Cloudflare Pages deployment tracking — closes the rest of alpha.2 field-trial defect §5 ([`lace-alpha-2-feedback.md`](../../../docs/lace-alpha-2-feedback.md)). Session 33D made build statuses truthful: a Pages deploy-hook acceptance is now terminal `accepted`, which never claims publication but also never tells the operator whether the static site was actually deployed. The ports, repository transitions and `provider_*` columns for tracking already exist and are unused. 33E adds the Cloudflare Pages adapter and a scheduled poller so a tracked deployment ends in `succeeded`, `failed`, `cancelled` or `unknown` from evidence, with an overall tracking deadline so no build can stay `running` forever when the provider, the token or the Worker misbehaves.

## What Changes

- Optional Pages tracking settings in the CMS Worker: plain variables `LACE_PAGES_ACCOUNT_ID` and `LACE_PAGES_PROJECT_NAME`, Worker secret `LACE_PAGES_API_TOKEN` (a separate token limited to *Account · Cloudflare Pages · Read*, never the D1 operator token), optional `LACE_PAGES_TRACKING_TIMEOUT_MINUTES` (overall deadline, 5–1440, default 60), and a development-only `LACE_PAGES_API_BASE_URL` for a controlled stub. The three identity settings are all-or-none; partial or invalid values fail Worker validation naming only the variables. Without them the Worker keeps recording `accepted` exactly as in 33D.
- The deploy-hook trigger returns the tracked outcome when tracking is configured and the hook returned a deployment ID; a hook response without an ID stays `accepted`.
- A portable `SiteBuildTracker` (application) and a `PagesDeploymentStatusReader` (platform-cloudflare) poll the exact deployment `GET /accounts/{account}/pages/projects/{project}/deployments/{providerBuildId}`. Only a successful `deploy` stage yields `succeeded`; build/deploy failure → `failed`; cancel or skip → `cancelled`; `401`/`403`, a deployment still missing after a grace period, other client rejections, the overall deadline, or tracking removed while builds were tracked → `unknown`. Each outcome carries a closed safe reason with a next action. Transient `429`/`5xx`/network/timeout/malformed responses back off without consuming the outbox retry budget.
- Tracking state stays in `site_builds`: each cron run claims a bounded number (5) of due `running` rows through a short check lease on `provider_check_after`, records the latest stage and last successful check time, and survives Worker restarts. All writes are guarded by build ID, provider ID and `status = 'running'`, so overlapping runs, parallel builds and late results never change another build or reopen a terminal one.
- The closed build diagnostic vocabulary gains provider/tracking reasons (`provider_build_failed`, `provider_deploy_failed`, `provider_cancelled`, `provider_skipped`, `tracking_forbidden`, `tracking_not_found`, `tracking_rejected`, `tracking_timeout`, `tracking_unconfigured`); `cancelled` and `unknown` completions may now store one of their own reasons.
- Admin build DTOs (history/detail, OpenAPI) gain optional `providerStage` (closed Pages stage name) and `providerCheckedAt`. Builds detail shows the stage, last check and reason-specific guidance. Nothing persists or displays the hook URL, API token or Pages API response bodies.
- Decision: an authenticated CI callback for generic deploy hooks is **deferred** (not in MVP scope); generic hooks remain honest `accepted`.
- Update architecture §9.8/§15 (tracking settings and secret), Cloudflare Worker/handoff docs, generated `lace-operations.md`, Worker config comments, and record 33E in the roadmap after verification.

## Capabilities

### New Capabilities

- `cloudflare-pages-deployment-tracking`: optional Pages tracking settings, exact-deployment polling, stage/outcome mapping, bounded scheduled checks with backoff, overall deadline, restart recovery, and secrecy of the token and provider responses.

### Modified Capabilities

- `cloudflare-deploy-hook-trigger`: with tracking configured an identified acceptance becomes the tracked outcome instead of `accepted`.
- `cloudflare-worker-composition`: validates the new tracking settings and composes the tracker.
- `cloudflare-scheduled-dispatch`: scheduled runs also process due tracked builds within the D1 query budget, isolated from the other dispatchers.
- `site-build-dispatch`: tracked deployments record stage/last check, finish within the overall deadline, and carry closed reasons for `cancelled`/`unknown`.
- `application-ports-and-commands`: portable tracker, deployment status reader port, check claims and check recording.
- `d1-content-repositories`, `node-content-repositories`: guarded check claims, check records, and stage-aware completion with parity.
- `rest-contracts`: `providerStage`/`providerCheckedAt` and the widened closed reason vocabulary.
- `admin-application-shell`: Builds detail shows tracking stage, last check and guidance for the new reasons.

## Impact

Governing architecture: §§4.5, 9.8, 12, 15, 17 and 21. §9.8 gains the tracking/deadline rules and §15 the new Worker secret; single-site, atomic release, fixed-command builder, server-only build credential and outbox lease/retry invariants are preserved. No schema migration: 33D already added `provider_stage`, `provider_checked_at`, `provider_check_after` and `site_builds_tracking_idx`; the tracking start is the completion time of the build's outbox event.

Code: `@lacecms/domain` reasons/stages/tracking policy; `@lacecms/application` ports and `SiteBuildTracker`; `@lacecms/db` SQL helpers; Node and D1 repositories and the shared contract suite; `@lacecms/platform-cloudflare` settings, deploy hook, Pages reader and Worker scheduled handler; contracts/OpenAPI; admin Builds; docs and generated operations guide.

Compatibility: additive optional DTO fields and new reason values (external clients must tolerate them, as in 33D); new optional Worker settings and secret. API/Worker/admin ship together. Depends on 33D. Non-goals: CI callbacks, tracking for non-Pages providers, Workers Builds, Pages dashboard links, credential handling for the CLI (33F), guides (33G), alpha candidate and real-account verification (33H/34C).
