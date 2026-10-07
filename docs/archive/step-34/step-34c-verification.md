# Step 34C — local operations and owner handoff

Recorded 2026-10-08. Change: `step-34c-local-operations-owner-handoff`.
Completion: **19/19 tasks**, local implementation and acceptance complete.
Neither the active 34B nor 34C change was archived or synchronized.

## Release and provenance

The running CMS version now appears in administrator Settings → Site status. Node and Worker use portable generated literals from their own public manifests; release validation rejects stale literals. The required bounded `engineVersion` status DTO and admin ship together. Prerelease text, loading, unavailable/stale refresh, successful refresh, expired-session clearing and narrow-screen layout have coverage. Anonymous, editor, viewer and build-token callers remain denied. Node's explicit embedding metadata override is retained.

Candidate `0.1.0-alpha.4`, generator alpha.4, template **0.20.0** was prepared from clean revision `770cf336a6bd71728104d8091ebd31ebcd0ce5f0`, fingerprint `b7ccf588515ecef3c0757aabc998dfd0ccf36b161a8c25b017c50f77a97406d7`. All 15 package checksums and four API/builder image identities/smokes passed. Full consumer execution is native `linux/arm64`; `linux/amd64` coverage is emulated image smoke, not a full consumer run. Nothing was published or remotely deployed. Historical 34A/34B artifacts retain their original identities.

[Separate artifact/result inventory](step-34c-artifacts.json) retains exact identities, command outcomes and sanitized restoration comparisons. Acceptance harness additions after candidate preparation only add setup phases, operational-log assertions, installed-consumer ownership capture and the corrected generator test expectation; they do not change shipped package/image behavior. The candidate's source revision and the later verification/bookkeeping revisions are deliberately separate.

## Local operations outcomes

The complete expanded `pnpm verify:34c` ran from clean harness revision `b47a047a2a2373c682205de077b287fc2a680f17`, using the new native candidate images for generated Node setup. All **7 phases / 71 tests** passed without skips: Docker prerequisites, workspace build, harness/guide contracts (10), actual generated Node setup, actual generated Worker setup, health/restore/rotation plus builder recovery (14), forward migration/upgrade/rollback (47). Reports: `.lace-acceptance/step-34c-results-4kB3xP`. Earlier five-phase runs are historical diagnostics, not the final runner result.

SQLite uses its WAL-safe backup API and paginated MinIO object copies at a quiescent point. Worker snapshots the complete stopped Miniflare D1/R2 persistence with simulator `5.20260903.0-alpha`; it does not export remote D1. Restores use isolated databases, object storage, origins, replacement secrets and build destinations. Canonical SQL fingerprints compare roles, draft/published data, ordered blocks, routes and media references. Object checksums, sign-in, public media and two reference-Astro builds pass on both paths; missing/corrupt bytes fail. Original installations resume unchanged. Timings and consistency points are retained in the inventory; they measure these small fixtures, not production backup windows.

Auth-secret and build-token replacement reject old credentials and permit fresh sign-in/export/build. Real MinIO credentials rotation preserves the data volume, denies the old client and restores object access. Builder shared-secret and controlled hook/Pages token tests prove old denial/new acceptance; hook acceptance remains distinct from deployment success. The full exact consumer verifies failed builds preserve the last complete served release and corrected retries replace it atomically.

Health tests distinguish 200 liveness from migration/database readiness failures (503). Authenticated request IDs correlate response and completion logs with method/path, status, duration and actor. Operational build logs assert bounded component/build ID/reason records and exclude token sentinels. Readiness does not prove config/object/build health; invalid settings can prevent startup. Doctor is a setup observation, not an online WAL probe. Entry/model/publication context and a durable complete audit trail remain documented observability gaps.

## Final consumer journey

`pnpm acceptance:release --artifacts .release-artifacts/alpha-4-34c` passed with the prepared archives/images, packed generator and exact dependency overrides. Real Node and Worker admin browsers show `0.1.0-alpha.4`. Installed tarball platform exports also execute the 34C health/restore/rotation tests; their private runtime backups include the generated consumer's config, manifest and lockfile metadata. Restore Astro checks use the repository reference site; generated starter and independent Astro source ownership/builds are separate full-consumer scenarios, not a claim that the reference fixture is a restored generated site.

| Final-roadmap action | Exact local evidence |
| --- | --- |
| Generate with one command | Packed generator; all six byte-stable modes |
| Start Node/Docker or Worker | Generated development/production Compose and local Wrangler |
| Migrate, sync, bootstrap | Extracted scenario commands and real CLI/runtime execution |
| Edit, media, reorder | Packaged admin onboarding/media, block-order browser journey |
| Editor denied/admin publish | Role and scoped-token probes plus cross-runtime restored seed |
| Published-only API/Astro | Authenticated export and generated/reference static builds |
| Later draft isolation | Node/Worker API and Astro comparisons |
| Build failure/recovery | Node durable failure/retry with old served HTML retained; controlled Worker hook/Pages outcomes and local static output |
| Upgrade/block conflict | 0.4.0/0.14.0 upgrade journeys; user-owned source preserved; edited block conflict without overwrite |

## Checks and owner handoff

Passed: root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check`, `pnpm release:check`, `pnpm release:verify --output .release-artifacts/alpha-4-34c`, `git diff --check`, and strict OpenSpec validation. Focused contract/server/release/guide tests: 103; generator tests: 16; full admin suite: 405; focused Settings/client repeat: 29. The narrow accessibility browser cases also passed. Existing DB/builder lint warnings remain; there are no lint errors. No database migration or dependency change was introduced.

Generated operations/scenario guides now define coordinated backup/restore, maintenance windows, private backup handling, rotation, forward migration, filesystem rollback and troubleshooting. [Local operations](../../local-operations-verification.md), [MVP traceability](../../mvp-traceability.md) and [owner plan](../../real-application-verification.md#post-roadmap-owner-evidence) explain coverage and limits. Traceability enumerates all 14 Included scope items and all nine §14 security requirements.

Real VPS/Cloudflare deployment, TLS/proxy behavior, remote D1 capacity and coordinated D1/R2 restore, real provider permissions/rotation/publication, independent published installation and stable-release approval remain **pending**. The two 34B restricted tooling advisory dispositions and finite simulator budget observations remain visible in [34B evidence](step-34b-verification.md); this operations session does not erase them. Local roadmap completion authorizes none of the owner actions.
