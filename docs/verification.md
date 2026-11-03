# Verification (internal)

This maintained guide describes verification commands and coverage. Each execution
writes its own results; release readiness belongs to the archived release change.
See the [internal index](README.md) for document status and the
[architecture](mvp-architecture.md) for controlling invariants.

## Commands

Use the pinned verification toolchain, Node 24.12.0 and pnpm 12.3.4, with dependencies installed using
`pnpm install --frozen-lockfile`. Run commands from the engine checkout.
The [script catalog](../DEVELOPMENT.md#script-catalog) lists all root commands.
Verification runners build their required packages. Docker/Compose, a local
MinIO image and Playwright Chromium are required for runtime/browser drills;
ordinary pure unit checks and the public docs checks need no running CMS.

| Command | Proves / prerequisites | Evidence |
| --- | --- | --- |
| `pnpm test` | Source and packaged-output tasks through Turbo, then root governance/integration tests; SQLite/local D1 repository contracts and server integration are included; native SQLite and local Worker execution must work. It does not run the separate verification projects or full browser/release journeys. | Console and Turbo task results; request a Vitest JSON reporter for retained focused results. |
| `pnpm --filter @lacecms/content test`, `pnpm --filter @lacecms/content test:watch` | Build-free source tests or watch mode; all packages and apps use the same separation. The site has no source test files. | Vitest output; tests must pass without package `dist/` directories. |
| `pnpm exec turbo run test:packaged --filter @lacecms/content` | Builds prerequisites and checks the exact public export list of the built package. Published packages have the same task; Astro also checks component subpaths. CLI/generator process consumers, API Worker bundles, platform admin assets and the site fixture build run only here. | Packaged-test results; these tests have no source aliases. |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:validate` | Types, package/admin boundaries, token styles, formatting and strict accepted/active specifications. | Command output; these do not prove runtime or artifact acceptance. |
| `pnpm openapi:check` | Committed OpenAPI matches generated REST contracts; requires the relevant package builds. | Command output and snapshot comparison. |
| `pnpm verify:cross-runtime --artifacts <prepared-directory> --baseline <reviewed-inventory.json>` | Repository parity; shared Node/Worker API, import, conditional-field and video scenarios; SDK/render/Astro; exact candidate release acceptance. Requires Docker, Chromium and a prepared candidate with matching reviewed checksums/images. Always supply the reviewed baseline explicitly: the runner's historical fallback is no longer retained. | `.lace-acceptance/verify-cross-runtime-*/result.json` and phase Vitest JSON, plus the candidate acceptance receipt. |
| `pnpm verify:security` | Local cookie/origin/role/token/upload attacks, repository/restart faults, provider faults, Compose host safety, storage/admin recovery, static secret exclusion, authenticated D1 budgets and dependency audit. Requires explicit local API/builder images, Docker and Chromium; npm advisory/license metadata needs network access, not infrastructure credentials. | `.lace-acceptance/verify-security-*/result.json`, phase Vitest JSON and `dependency-audit.json`. |
| `pnpm verify:operations` | Build, guide extraction, generated Node/Cloudflare-local setup, health/log checks, coordinated restore/rotation and forward migration/managed-file upgrade/rollback. Requires Docker and Chromium for setup; refuses remote credentials/settings. | `.lace-acceptance/verify-operations-*/provenance.json`, `results.json`, phase Vitest JSON and restore evidence. |
| `pnpm acceptance:generated` | Generated Node, starter, Cloudflare-local, existing-site and builder diagnostic journeys; packages current workspace assets when no prepared inventory is selected. Requires Docker, Chromium and package installation access. | Owned OS temporary `lace-generated-acceptance-*` directory and console; workspace packaging is not final candidate acceptance. |
| `pnpm acceptance:starter`, `pnpm acceptance:existing-site` | Packed starter or independent Astro source installation, source ownership, static builds, media and rendering. | Console and isolated generated-consumer work directories (cleaned unless `LACE_ACCEPTANCE_KEEP_TEMP=1`). |
| `pnpm acceptance:cloudflare`, `pnpm acceptance:builder-diagnostics` | Packaged local Worker/admin/D1/R2 or fixed builder diagnostics/recovery respectively. Requires local Worker execution or Docker; browser paths require Chromium. | Console and isolated generated-consumer work directories (cleaned unless `LACE_ACCEPTANCE_KEEP_TEMP=1`). |
| `pnpm acceptance:release --artifacts <prepared-directory>` | Full exact-artifact consumer journeys after inventory/checksum/image verification: generated Node, starter, independent Astro, local Worker, security probes, guide contracts and `template-upgrade`. Requires Docker, Chromium and the saved inventory's local image platform. | Candidate `acceptance.json` with completed journey labels and artifact identities. |
| `pnpm release:check`, `pnpm release:plan` | Source/release identity and planned package/image inventory, without publication. | Console and planned inventory. |
| `pnpm release:packages`, `pnpm release:images`, `pnpm release:prepare` | Package archives and both-platform API/builder images, individual platform smokes and preparation validation. Images need Docker/buildx. These prepare artifacts rather than authorize release. | Selected `.release-artifacts/` directory, inventory, checksums, logs and image manifests. |
| `pnpm release:verify --output <prepared-directory>` | Independent saved-artifact integrity, package contents and image/runtime identities; does not rerun every product journey. | Artifact verification reports in the selected output directory. |
| `pnpm proxy:probe` | Actual nginx upload request-size boundary, including an upload above 1 MiB. Requires Docker. | Probe output; real ingress remains an owner check. |
| `pnpm docs:check` | Public docs types, static build, links/resources, locale/version identity and focused docs tests, without CMS services. Root tests separately guard changed-input publication and internal links/indexes. | Console and built static docs output. |

Security fixture environment:

```sh
LACE_VERIFY_API_IMAGE=<local-api-image-id> \
LACE_VERIFY_BUILDER_IMAGE=<local-builder-image-id> \
LACE_VERIFY_MINIO_IMAGE=<optional-local-minio-image-id> \
pnpm verify:security
```

`LACE_VERIFY_MINIO_IMAGE` optionally selects a cached MinIO image; otherwise
fixtures build the generated service. `LACE_VERIFY_EVIDENCE` is set by the
operations runner to its output directory; `LACE_VERIFY_PACKED_ROOT` is set by
exact-consumer acceptance so restore/rotation uses installed tarball exports.
Neither turns source verification into candidate acceptance. Normal development
`.env` files and remote secrets are not verification inputs. Operations rejects
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `LACE_D1_DATABASE_ID`,
`LACE_CLOUDFLARE_OPERATOR_ENV`, `LACE_PAGES_API_TOKEN` and `LACE_DEPLOY_HOOK_URL`.

Required phases execute sequentially. Missing prerequisites or failed, skipped,
empty or unavailable tests fail the run; later phases stay `not-run`.
Interruption fails the run and forwards termination to owned child processes.
Fixtures clean only their owned containers, volumes, listeners and temporary
persistence; they retain sanitized evidence and leave ordinary development state
alone. Keep plaintext credentials and backups private and out of Git.

The dependency audit records lock hash, timestamp/data source, all locked
licenses, affected versions, advisory reachability, mitigation and review trigger.
Only explicitly reviewed restricted tooling dispositions are allowed; new
advisories or unknown/missing licenses fail acceptance. Retain required native
and font distribution notices. A passing historical audit does not cover a new
lockfile or newly disclosed advisory.

Operations restore compares roles, draft/public snapshots, ordered blocks, routes,
references and all referenced object checksums, then signs in, downloads media
and builds Astro twice. Missing/corrupt objects fail. SQLite uses its WAL-safe
backup API plus paginated MinIO copies; local Worker backup stops Miniflare and
captures its complete version-labelled D1/R2 persistence. Auth and build tokens
rotate on both paths; Node also rotates real MinIO credentials. Builder shared
secrets and hook/Pages replacements use controlled local adapters. The reference
Astro restore drill is distinct from the generated starter/independent-site build
journeys. Filesystem upgrade rollback does not roll back SQL or object data.

## Limits

Local Docker, Miniflare, controlled proxy and hook/Pages responses prove finite
local behavior. They do not prove remote permissions, D1 query/runtime capacity,
production memory/timing, real TLS/proxy/client identity, remote D1 export/restore,
R2 consistency or actual provider deployment and served output. Export fixtures
of 100/201/501 entries and near-1MB JSON are finite measurements, with no global
export cap or verified unbounded maximum.

Liveness only proves the listener responds. Readiness checks migration-ledger
availability, not configuration synchronization, object access, build-token
validity or successful site deployment; invalid configuration may prevent
startup before health endpoints exist. Doctor is read-only: Node migration
checks require a stopped SQLite consumer; local Worker readiness comes from the
running API. Configuration check, object access and latest build need separate
observations. Administrator Settings shows the platform's generated engine
release, not the root/template version. Request logs include request ID,
method/path, status, duration and resolved actor ID; a complete durable mutation
audit trail and §21 entry/model/publication context remain gaps.

Source tests identify source/tree state and tool versions. Exact-candidate claims
also require saved verified checksums and image identities, a coherent clean
source and newly reviewed artifacts after shipped behavior changes. Older
artifacts cannot be relabelled as containing a correction. Publication,
independent registry installation, real deployment and beta/stable approval are
separate explicit gates. Archived release changes retain release-specific
readiness; no local command above publishes a release.

## Coverage

Named automated evidence covers local behavior only. Each row points to an owner
scenario below for external verification. The dated owner attestation keeps its
original scope and does not establish later candidates' readiness.

### Included product scope (§3)

| Architecture §3 item | Named local evidence | Documentation | Coverage / owner check |
| --- | --- | --- | --- |
| One installation per website | `tests/cross-runtime-product.acceptance.mjs`; `scripts/build-site-acceptance.mjs` selected-site isolation | Architecture §4.1; generated operations | Covered / owner scenarios 1–3 |
| Pages and collections | `scripts/cross-runtime-api.mjs` home/article creation and route/export comparisons | Architecture §8; configuration-synchronization.md | Covered / owner scenario 4 |
| Code-first definitions | `packages/config/src/index.test.mjs`; CLI sync tests; `scripts/cross-runtime-api.mjs` | configuration-synchronization.md | Covered / owner scenarios 2–3 |
| Draft and published snapshots | `scripts/cross-runtime-api.mjs`; `scripts/publication-visibility-acceptance.mjs` | Architecture §4.4; generated publication guidance | Covered / owner scenario 4 |
| Ordered block content | `scripts/block-order-acceptance.mjs`; cross-runtime API/Astro ordered-block comparison | Architecture §9.5; personal-site-guide.md | Covered / owner scenario 4 |
| Tiptap rich text | Admin editor tests; `packages/content/src/fields/rich-text.test.ts`; render tests | Architecture §11; site-styling.md | Covered / owner scenario 4 |
| R2 or MinIO media | `tests/operations.acceptance.mjs` object API backup, hashes, negatives and download; platform storage tests | [Operations and restore](#commands) | Covered locally / owner scenario 7 |
| Better Auth email/password | `packages/auth/src/index.test.mjs`; both generated browser onboarding journeys; operations fresh sign-in | auth-operations.md | Covered / owner scenarios 2–5 |
| Admin/editor/viewer roles | `scripts/cross-runtime-api.mjs` role denials; `packages/server/src/app.test.mjs` status boundary | Architecture §14; auth-operations.md | Covered / owner scenarios 4–5 |
| Optional OAuth MCP content assistance | `packages/mcp/src/index.test.mjs`; auth security and repository contracts; `scripts/journeys/list-settings-mcp-proxy.mjs` | [MCP](mcp.md); ADR 0015 | Local contracts; owner scenarios 4–5 cover consent, scope, publication and revocation |
| Optional transactional email | `packages/platform-node/src/smtp-email.test.mjs`; `packages/platform-cloudflare/src/email.test.mjs`; auth/account tests | [Authentication operations](auth-operations.md) | Local provider behavior; real configured delivery requires owner scenarios 2–5 |
| Versioned validated REST API | Contracts/server tests; `pnpm openapi:check`; exact-consumer API probes | Architecture §12; node-api.md | Covered / owner scenario 5 |
| Astro build-time SDK | `scripts/cross-runtime-astro.mjs`; exact starter/independent-site journeys; weak ETag journey | personal-site-guide.md; generated Astro guide | Covered / owner scenarios 2–4 |
| Outbox build dispatch | Builder runner tests; `scripts/generated-project-acceptance.mjs` failure/recovery; Worker controlled hook/Pages journey | Architecture §9.8; generated operations | Covered with controlled provider / owner scenario 6 |
| Node/Docker and Cloudflare adapters | Exact Node consumer and local Worker journeys; operation restore/rotation on both | node-api.md; cloudflare-worker.md | Covered locally / owner scenarios 2–3, 7 |
| CLI init and upgrade-safe layout | Six byte-stable generator snapshots; `scripts/template-upgrade-acceptance.mjs`; CLI upgrade-command/rollback tests; block conflict journey | Architecture §7; generated operations | Covered / owner scenarios 1, 7–8 |

### Security requirements (§14)

| Architecture §14 requirement | Named local evidence | Documentation | Coverage / owner check |
| --- | --- | --- | --- |
| Secure HTTP-only production cookies | `packages/auth/src/index.test.mjs`; Node production smoke | auth-operations.md; generated production guide | Covered locally / owner scenario 5 |
| CSRF and origin protection | `tests/security-boundary.test.mjs`; `scripts/journeys/consumer-security-probes.mjs` foreign/null/cross-site denials | [Security and resilience](#commands) | Covered / owner scenario 5 |
| Explicit trusted origins | Auth/server security tests; generated origin settings | auth-operations.md | Covered / owner scenario 5 |
| Auth/upload rate limiting | Node/Worker security-contract tests; security acceptance actor/proxy identity probes | [Security and resilience](#commands) | Covered / owner scenario 5 |
| Upload MIME/size/filename validation | Platform security-contract tests; exact-consumer polyglot rejection | [Security and resilience](#commands) | Covered / owner scenarios 3–5 |
| No secrets in client bundles | `scripts/consumer-security.mjs` static/image scans; `scripts/cross-runtime-astro.mjs` sentinel scan; complete release acceptance | [Security and resilience](#commands) | Covered / owner scenario 5 |
| Same-origin admin/API default | Node/Worker browser journeys; generated proxy/Worker assets | node-api.md; cloudflare-worker.md | Covered / owner scenarios 2–3, 5 |
| Actor IDs on content mutations | `tests/operations.acceptance.mjs` correlated request log assertions; server application actor permissions | [Operations and restore](#commands) | Actor context covered; complete durable audit trail and §21 entry/model/publication context remain a documented gap / owner scenario 5 |
| Worker Better Auth AsyncLocalStorage compatibility | Worker bundle/smoke tests and generated `cf:build`/local onboarding | cloudflare-worker.md | Covered locally / owner scenario 3 |

## Recorded D1 budget measurements

Recorded local measurements from 2026-10-23 justify the internal-link query
limits in architecture §8/§9.6/§16; these are fixture context, not a new run or
production capacity evidence. Design rationale remains in the
[archived internal-link change](../openspec/changes/archive/2026-10-24-ce10-internal-url-links/).

### Indexed reads

Fixture: 1,000 published incoming sources; one source has 200 locations.
Local D1 metadata reports the following actual work (all are read-only):

| Read | SQL statements | Rows read | Rows written |
| --- | ---: | ---: | ---: |
| impact-50-sources | 3 | 1024 | 0 |
| impact-50-locations | 4 | 62 | 0 |
| picker-50-prefix | 1 | 254 | 0 |
| resolve-200 | 1 | 1399 | 0 |

These are local D1 counters. Source groups and locations have independent
keyset pages, with at most 50 groups/locations and ten initial locations per
source. There is no incoming total/count query. Query-plan review found two
joins that could scan entries; both now join through the snapshot's entry ID
and check the current draft/publication pointer after the primary-key lookup.

Observed indexed plan steps:

```text
SEARCH e USING INDEX sqlite_autoindex_content_entries_1 (id=?)
SEARCH e USING INDEX sqlite_autoindex_content_entries_1 (id=?) LEFT-JOIN
SEARCH r USING COVERING INDEX content_entry_link_references_target_idx (target_entry_id=? AND snapshot_id>?)
SEARCH r USING INDEX content_entry_link_references_target_idx (target_entry_id=? AND snapshot_id=? AND (source_key,area,field_path)>(?,?,?))
SEARCH r USING INDEX content_entry_link_references_target_idx (target_entry_id=? AND snapshot_id=?)
SEARCH r USING INDEX content_entry_link_references_target_idx (target_entry_id=?)
SEARCH s USING INDEX content_snapshots_title_prefix_idx (title>? AND title<?)
SEARCH t USING INDEX sqlite_autoindex_content_entries_1 (id=?) LEFT-JOIN
```

The picker uses a literal escaped title prefix with the title/ID index; `%`
and `_` are tested as literal input. The 200-ID resolver uses one JSON rowset.
Foreign/malformed cursors fail before reads; graph drift fails the page rather
than mixing dependency revisions.

### Complete authenticated Worker invocations

Fixture: maximum 200 blocks, 200 media references and 200 internal-reference
occurrences. Counts include Better Auth and post-response dispatch/context work.

| Invocation | Total statements | Largest atomic batch |
| --- | ---: | ---: |
| create | 36 | 26 |
| save | 42 | 29 |
| stale-save | 38 | 29 |
| publish | 28 | 13 |
| duplicate | 41 | 28 |
| revert | 22 | 12 |
| unpublish | 22 | 10 |
| delete | 13 | 4 |

Every invocation asserts at most 50 statements, every mutation batch at most 40,
and every statement at most 100 bound parameters. Title-only saves are checked
with SQL write probes: zero reference writes and zero graph revision updates.

A 100-entry export page, including entries with maximum media/internal links,
remains two batches and at most ten reads (below CE10's twelve-read ceiling).
Delivered manifests are correlated only to the selected local snapshots, are
included in page byte accounting and do not fetch destination aggregates.
Published version guards/ETags cover both export batches and continuation pages.

## Owner checks on real infrastructure

Use the selected version's generated scenario guides and
[operations reference](../packages/create-lace/templates/docs/lace-operations.md)
for commands and the [Cloudflare handoff](cloudflare-deployment-handoff.md) for
permissions, provisioning and cleanup. The following eight scenarios condense
the real-application plan; run shared scenarios in both environments. Private
credentials, resource IDs, backup files and full provider responses stay private.

| Scenario | Required check and retained evidence |
| --- | --- |
| 1. Baseline and independent application | Select a coherent candidate: source, package/generator/template versions, checksums, image digests, Worker revision, site revision, config hash, migration/block versions, toolchain, architecture and browser/device. Use an independent Astro site with user-owned styling/block source, pages, collections, required fields, rich text and shared media. Record URLs, publication mode and initial dataset; installations have independent storage. Reuse prior evidence only when version/configuration/scenario match, and rerun affected cases. |
| 2. VPS deployment | Fresh generated CMS; select and verify the Astro source mount, persistent SQLite/MinIO, runtime data separation, secrets, canonical origin, HTTPS/proxy and fixed builder/static release settings. Migrate/sync/bootstrap, verify setup closure across restart, health, doctor with its stopped/running requirements, engine/migrations/config/object/build observations. Build and inspect public assets/media through HTTPS; restart API/builder/host and prove persistence and last-release continuity. |
| 3. Cloudflare deployment | Record intended account/Worker/D1/R2 targets and remote migrate/sync/deploy/bootstrap order. Exercise Wrangler OAuth and separately loaded D1-only operator credentials without shell/.env shadowing; record a broader-token path if used. Verify health, same-origin admin, sessions, persistence/media, optional KV and redeploy recovery. Deploy Astro separately on Git-connected Pages with read-only build token, Worker hook and separate Pages-Read tracking token. Correlate exact deployment IDs, deploy-stage success and served output; test compressed strong/weak ETags. Measure real maximum-block/export workload and provider limits. |
| 4. Shared editorial journey | Admin/editor/viewer UI and direct API permissions; create/edit/validate required fields and slug conflicts, render rich text, add/insert/duplicate/reorder/remove/restore blocks through save/reload/publish/export/served output. Two-session stale-save conflict preserves edits. Upload/reuse media, referenced deletion protection and asynchronous unreferenced deletion. Publish/draft isolation, coalesced builds, sign-out/session expiry and safe reauthentication; compare environments allowing origins/IDs. Exercise current optional MCP consent, delegated scopes, publication and revocation, and configured email delivery. |
| 5. Security and diagnostics | Real HTTPS/cookies/origins, cross-origin denials, anonymous/role/setup/build-token permissions, trusted proxy/client-IP separation and forged-forwarding rejection. Representative invalid uploads, unsafe URLs/rich text, path/command attempts leave safe errors and protected state. Inspect browser, static output, logs and diagnostics for secret leakage; retain safe request/build IDs and sanitized reasons. |
| 6. Failure and build recovery | In a maintenance window or disposable installation, interrupt API/builder and deny DB/storage; prove truthful health, bounded retries and lease/restart recovery with host DB concurrency guards. Fail/correct Astro while the last complete release stays served. On Cloudflare break/restore hooks, fail/correct real Pages builds, test cancellation/tracking authorization loss/deadlines, disable/restore tracking (`accepted` alone is not deployment proof). Rapid retries/late results must correlate to exact Lace/provider IDs without losing committed publication. Restore each fault before the next. |
| 7. Backup, restore, upgrade and rotation | Quiesce writes/builds/background deletion and settle in-flight work; record time and copy matching SQL, objects and project/config/ownership metadata. Use WAL-safe SQLite and supported remote D1/R2 procedures. Restore to isolated matching-version targets with private settings and isolated hooks; compare roles/counts/draft/public values/order/references/object hashes, sign in and rebuild the independent site. Record durations/data-loss window/caveats and original resumption. Forward migration/upgrade dry-run/apply preserves user-owned hashes; edited blocks conflict while unedited blocks update. Rotate auth/build/storage/builder/hook/provider credentials, proving old denial, replacement recovery, session consequences and retained data; no automatic DB downgrade. |
| 8. Results and owner decision | One row per scenario/environment with artifact/site revision, date, status and private evidence/next action. Use `passed`, `failed`, `pending`, or explained `not applicable`. Record owner/impact/mitigation for accepted risks without relabelling failures as passed. Require both environments, shared independent-site journey, credential separation, real Pages ETag/outcomes and usable SQLite/MinIO plus remote D1/R2 restore evidence. Identify pending/failed checks, tested version set and explicit release decision. Shipped fixes require a coherent new candidate and affected local/remote reruns. Check targets before cleanup and retain needed evidence/backups. |

Suggested private result row:

| Scenario | Environment | Artifact/site revision | Date | Status | Evidence / next action |
| --- | --- | --- | --- | --- | --- |
| Published snapshot isolation | VPS | To record | To record | pending | Private evidence reference |

### Owner-confirmed status — 2026-10-10

The owner confirmed in the project chat that `0.1.0-alpha.4` packages are
published and that pre-beta real VPS/Cloudflare application testing,
backup/isolated restore, upgrade, credential rotation and failed-build recovery
are complete, including real D1 limits and Pages deployment status behavior.
This is an owner attestation, not a rerun, a new security/registry audit, attached
per-scenario measurements, GHCR manifest verification or beta/stable approval.
Exact deployment IDs, image digests, logs and backup checksums were not supplied;
retain them privately. Scenario reference rows do not override this dated
completion or claim that individual evidence files were attached. Later
candidates need affected scenarios checked against their own artifact identities.

| Gate | Required owner evidence | Status |
| --- | --- | --- |
| Real VPS | Exact artifact identity; TLS/secure cookies; trusted ingress/proxy rate limits; origin denials; editor/admin journey; MinIO media and failed/corrected build with previous release preserved | Complete — owner-confirmed 2026-10-10 |
| Real Cloudflare | Selected account/Worker/D1/R2 IDs; credential preflight; deployment and sign-in; real query/row/payload/capacity observations; object access; provider tracking with served output | Complete — owner-confirmed 2026-10-10 |
| Coordinated remote restore | Quiescence time; private D1 SQL/SQLite and object backup identities; separate restore targets; metadata/object checksums; fresh sign-in and static rebuild; original resumption | Complete — owner-confirmed 2026-10-10 |
| Production rotations | Old credential denial and replacement recovery for auth/build token, storage, builder or hook/provider; retained data and last served release | Complete — owner-confirmed 2026-10-10 |
| Publication/install | Reviewed source/inventory/checksums; explicit npm/image publication; independent clean install from published coordinates | Packages and real installation confirmed; GHCR manifests not separately verified |
| Stable approval | Reviewed local and owner evidence, residual security/dependency risks, observability gaps and explicit release decision | Pending |
