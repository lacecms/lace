## Why

Roadmap Step 33, Session 33D — Truthful site-build outcome model — addresses alpha.2 field-trial defect §5 ([`lace-alpha-2-feedback.md`](../../../docs/lace-alpha-2-feedback.md)): Cloudflare builds stay `running` forever because nothing tracks the provider after acceptance, and a successful deploy-hook response without a deployment ID is recorded as `succeeded` although nothing proves the site was published. A VPS build, by contrast, stays `pending` while it actually builds. Operators cannot tell from Admin what a recorded status proves about the public site. The status model must become truthful before 33E adds Pages deployment tracking on top of it.

## What Changes

- **BREAKING (persisted/DTO enum widening):** `site_builds.status` becomes one closed seven-value enum — `pending`, `running`, `accepted`, `succeeded`, `failed`, `cancelled`, `unknown` — exactly as decided in the roadmap. `succeeded` requires proof of publication (VPS release switched, or later a tracked Pages deploy stage succeeded). `accepted`, `failed`, `cancelled`, and `unknown` are terminal with `succeeded`.
- The dispatcher marks every claimed build `running` at claim on both runtimes (`pending → running`). A build whose process terminated is recovered after lease expiry by a guarded `running → running` claim on the same row. A retryable failure returns the row to `pending` with its safe reason; terminal failure is `failed`; VPS success is `succeeded`.
- A deploy-hook 2xx response becomes `accepted` (terminal, untracked), recording the provider deployment ID when present. A hook response without an ID never becomes `succeeded`. The portable trigger port gains a distinct tracked outcome and repository transitions (`running` with a provider ID, ended by `succeeded`/`failed`/`cancelled`/`unknown`) so 33E can add Pages polling without another status or schema change; no runtime adapter returns the tracked outcome in this session.
- Administrator retry is allowed from `failed`, `cancelled`, `unknown`, and `accepted`. The site's current version is defined as the highest `target_version` among `succeeded` builds; late provider results never reopen `unknown`.
- Forward migration `0003` rebuilds `site_builds` with the new status check, nullable provider tracking fields (`provider_stage`, `provider_checked_at`, `provider_check_after`) and a tracking index. Existing rows are reclassified: everywhere `running` becomes `accepted`; on D1 (deploy-hook runtime) `succeeded` rows without `provider_build_id` become `accepted`; on Node SQLite `succeeded` came from the builder and stays. Coalescing, retries, leases, and timeouts are unchanged.
- Shared contracts and OpenAPI widen the admin build status enum. Builds and the entry publication details show, beside every build status, an info button opening the design-system `Popover` with what the status means, what it proves about the public site, and the next action, all from one shared status map that the tour and generated operations guide match. The 33C safe failure reason stays visible beside it. Nothing claims a deployed site from provider acceptance.
- Update architecture §9.8, the Cloudflare/operations guidance that described `running`/`succeeded` for hooks, and the roadmap entry after verification.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `site-build-dispatch`: seven-status lifecycle, claim-time `running`, guarded reclaim, accepted/tracked outcomes, retry sources, current-version rule.
- `application-ports-and-commands`: trigger outcomes distinguish proven success, untracked acceptance, tracked acceptance and failure; tracked completion port.
- `cloudflare-deploy-hook-trigger`: 2xx maps to `accepted`, never `succeeded`.
- `sqlite-schema-and-migrations`: seven-value status constraint, tracking fields/index, runtime-aware reclassification migration.
- `node-content-repositories`: atomic claim-to-running and guarded transitions on Node.
- `d1-content-repositories`: the same transitions in D1 batches.
- `rest-contracts`: widened admin build status enum in DTOs and OpenAPI.
- `admin-application-shell`: status info popovers on Builds and retry from every retryable terminal status.
- `publication-visibility`: entry publication details and Builds guidance never infer deployment from acceptance; VPS builds are `running` while building.
- `admin-introductory-tour`: tour status wording matches the shared status map.

## Impact

Governing architecture: §§4.5, 5, 9.8, 12, 15, 17 and 21. §9.8 changes (status enum, tracking columns, current-version rule) and is updated before code. Single-site, atomic release, fixed-command builder, server-only build credential, and outbox lease/retry invariants are preserved.

Code: `@lacecms/domain` status vocabulary; `@lacecms/application` trigger result, dispatch port and dispatcher; `@lacecms/db` schema, migration `0003`, inventory and SQL helpers; Node and D1 repositories; Cloudflare deploy-hook adapter; contracts/OpenAPI; admin Builds, entry publication details, tour and a new shared build-status entity; repository contract suite, dispatcher, adapter, admin unit, Playwright and axe tests; operations/Cloudflare docs and generated `lace-operations.md`.

Compatibility: API, dispatcher, admin and Worker must be upgraded together with the migration; mixed versions are unsupported. External API clients must accept the three new status values. No new dependency, secret, or setting. Downgrade requires restoring a pre-migration backup.

Depends on 33A–33C (33C diagnostics remain intact). Non-goals: Pages API polling, Worker tracking settings or secret, CI callbacks (all 33E); new failure/cancellation reason codes for tracked outcomes (33E); credential handling (33F); scenario guides beyond keeping existing status text truthful (33G); alpha candidate and real Cloudflare verification (33H).
