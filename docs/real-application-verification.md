# Real-application verification after the implementation roadmap

## Purpose and ownership

The release owner follows this plan after Step 34 against a real application
using Lace CMS in both supported deployment environments:

- VPS: Node API/admin, SQLite, MinIO, the fixed-command builder and a separately
  served static Astro site, deployed with Docker Compose.
- Cloudflare: CMS Worker/admin, D1, R2, scheduled recovery and a separate
  Git-connected Pages Astro site, with optional KV and Pages deployment tracking.

Step 34 supplies local verification, operational guides and traceability. This
plan supplies real-deployment release acceptance. Completing the roadmap does
not imply these checks passed, and local Docker/Miniflare/provider stubs do not
prove real deployment. Missing infrastructure access leaves this plan pending
without blocking roadmap completion. Publication remains a separate owner act.

Use the generated project's scenario guides and operations reference for the
exact commands supported by the selected version. For Cloudflare provisioning,
permissions, secrets and deployment order, follow
[cloudflare-deployment-handoff.md](cloudflare-deployment-handoff.md).
This plan defines scenarios and evidence rather than duplicating versioned CLI
commands. Keep credentials, account/resource IDs and private logs out of the
repository; use redacted summaries and private evidence references.

## Local 34B evidence and remaining owner checks

The local security/resilience pass is recorded in
[34B verification](archive/step-34/step-34b-verification.md) and its separate
[artifact/result inventory](archive/step-34/step-34b-artifacts.json). Use that
candidate's exact revisions/checksums when selecting a deployed baseline; the
historical 34A inventory predates these fixes. No checkbox below is satisfied by
local Docker, Miniflare, browser or controlled provider acceptance.

In particular, confirm deployed proxy/CIDR isolation, TLS/cookies, provider
client identity, real D1 query/runtime capacity, remote retry/recovery and
coordinated backups on the actual installation. Local export fixtures contain
100/201/501 entries and impose no product export cap. Retain the documented
restricted dependency risks and distribution notices when publishing. Session
34C operations verification and registry publication are separate, pending work.

## 1. Select the application and record the baseline

- [ ] Select the exact candidate package, generator and template versions; record
      source revision, API/builder image digests and deployed Worker revision
      where applicable. Use one coherent artifact set in both environments.
- [ ] Record the application/site revision, model/configuration hash, migration
      version, installed block versions and initial content dataset.
- [ ] Record Node, pnpm, Docker/Compose, Wrangler and Astro versions used, VPS
      architecture, browser/device versions, and the Pages build toolchain.
- [ ] Use an independent Astro application with its own styling, models and
      user-owned block source. Include a page, a collection, required fields,
      rich text and reusable media. Use comparable content in both environments;
      the two installations have independent databases and storage.
- [ ] Identify the CMS and public-site URLs, publication mode and expected build
      behavior. Use test content and a maintenance window for disruptive checks.
- [ ] Map existing owner verification to the scenarios below before rerunning.
      Reuse evidence only when the artifact version, relevant configuration and
      scenario match. Record the date and result. Recheck scenarios affected by
      subsequent changes; “already tested” without a baseline remains pending.

## 2. VPS deployment

- [ ] Follow the generated Compose production guide on the real VPS from a fresh
      generated CMS directory; connect the application's Astro source using the
      supported source-selection procedure.
- [ ] Configure persistent SQLite and MinIO storage, authentication secrets,
      public origins, reverse proxy/HTTPS, fixed builder settings and static
      release serving. Confirm the intended source is mounted and writable
      runtime data is separate from user source.
- [ ] Migrate, sync configuration, initialize object storage and bootstrap the
      first admin through the documented operator flow. Verify setup becomes
      unavailable after completion and after restart.
- [ ] Verify liveness, readiness and doctor using the documented stopped/running
      service requirements; check engine version, migrations, configuration hash,
      storage access and latest build. A live process alone is not readiness.
- [ ] Build and serve the independent Astro application at its public URL. Verify
      asset/media URLs and HTTPS behavior through the actual proxy.
- [ ] Restart API, builder and the host/stack under controlled conditions. Verify
      persistence, recovery and continued serving of the last static release.

## 3. Cloudflare deployment

- [ ] Follow the linked Cloudflare handoff for provisioning and ordering of
      remote migration, configuration sync, Worker deployment and bootstrap.
      Verify remote operations explicitly select the intended account/database.
- [ ] Exercise the separate-credential path: Wrangler OAuth plus a D1-only Lace
      operator token in `.lace/cloudflare-operator.env`, explicitly loaded for
      Lace commands. Remote migrate/sync followed by Wrangler deploy must not
      silently switch Wrangler to the D1-only token. Verify preflight detects
      shadowing by shell, `.env` or `.env.local` without exposing credentials.
      If the application uses a single broader token, record that path too.
- [ ] Verify deployed Worker health/readiness, browser setup, same-origin admin
      and API, secure sessions, remote D1 persistence and R2 media serving.
- [ ] Deploy the Astro application separately through a Git-connected Pages
      project. Set the Worker origin and read-only build token for the site
      build; keep the deploy-hook URL in the Worker secret.
- [ ] Enable Pages tracking with a separate Pages-Read-only Worker token and
      account/project settings. Match each Lace build to its exact provider
      deployment ID. `succeeded` requires a successful deploy stage; verify the
      actual served page separately. Record stage, last check and provider result.
- [ ] Confirm the standard Astro loader builds with provider compression and
      strong/weak ETags, including conditional reads after content changes.
- [ ] Redeploy the Worker and verify data, setup closure and scheduled recovery
      survive. Where enabled, check KV behavior after publication and redeploy.
- [ ] Confirm the remote D1 workload at the supported maximum block count and
      build-export size does not exceed query/parameter/runtime limits; record
      observed provider errors or limits rather than inferring from Miniflare.

## 4. Shared product journey — run in both environments

- [ ] Sign in as admin, editor and viewer. Confirm viewer cannot mutate content,
      editor can edit but cannot publish, and admin can publish. Check direct API
      requests as well as UI controls.
- [ ] Create and edit page/collection content, validate required fields and slug
      conflicts, and render rich text through the application's own Astro site.
- [ ] Add, insert, duplicate, reorder, remove and restore blocks. Save, reload,
      publish and verify the same order in public export and the served site.
- [ ] Edit the same entry in two sessions; confirm stale saves report a conflict
      without silently overwriting content or discarding the user's edits.
- [ ] Upload and reuse media; confirm images load on the public site. Verify
      referenced media is protected from deletion and unreferenced deletion
      reaches object storage with the documented asynchronous behavior.
- [ ] Publish, confirm the public API/export contains the published snapshot,
      and wait for the corresponding static deployment. Change the draft again:
      the public API and rebuilt site must retain the published values.
- [ ] Observe a burst of publication changes being coalesced into the intended
      build without losing the latest published content.
- [ ] Sign out and expire a session; confirm protected requests are rejected and
      the UI offers reauthentication without falsely reporting a successful save.
- [ ] Compare content, routes and media between deployments, allowing only
      expected differences such as origins and generated IDs.

## 5. Deployed security and diagnostics — run in both environments

- [ ] Confirm HTTPS, public origins, secure cookie/session behavior and rejection
      of disallowed cross-origin mutations through the actual deployed path.
- [ ] Verify anonymous, viewer and editor requests respect API permissions, and
      setup/build credentials grant only their intended access.
- [ ] Verify actual trusted-proxy/client-IP behavior: forged forwarded headers
      must not bypass request limits; distinct clients must not unexpectedly
      share one sign-in bucket. Record provider/proxy configuration used.
- [ ] Confirm rejected uploads, unsafe URLs/rich text and path/command attempts
      produce safe errors. Verify the deployed application renders accepted
      content safely; use the Step 34 negative-test cases as the reference.
- [ ] Check logs, admin diagnostics, browser/network errors and static build
      output for secret leakage. Capture safe request/build IDs, reasons and next
      actions. Do not attach full provider API responses or secrets as evidence.

## 6. Failure and build recovery

Perform these checks on disposable resources or a recoverable installation in a
planned maintenance window. Restore each fault before the next scenario.

- [ ] VPS: interrupt builder/API processes and temporarily deny DB/storage
      access. Verify truthful health/status, persistence, bounded retries and
      recovery after lease expiry/restart. Host DB operator commands must follow
      the documented protection against concurrent Compose access.
- [ ] VPS: cause an Astro build/source error. Verify the admin shows a safe cause
      and build ID, then correct it and retry. The last successful release must
      remain served until the new release is ready.
- [ ] Cloudflare: temporarily invalidate the deploy hook, publish and verify
      publication remains committed while trigger failure is reported. Restore
      the hook and retry; scheduled recovery must not lose the pending work.
- [ ] Cloudflare: cause a real Astro build failure and confirm the exact Pages
      deployment reaches `failed` in Lace. Restore the site and retry to a
      proven successful deployment; the old release stays served throughout.
- [ ] Cloudflare: exercise provider cancellation and tracking authorization loss
      where supported. Confirm cancellation/unknown status and safe next action;
      a deployment must not remain `running` beyond its tracking deadline.
- [ ] Cloudflare: temporarily disable tracking, then restore it. Confirm an
      untracked hook reports only `accepted`; do not infer deployment success.
      Confirm tracking interruption follows the documented terminal behavior.
- [ ] Verify retry and late-result handling never associates one publication
      with another build's provider outcome. Use a controlled rapid sequence
      and record the involved Lace/provider build IDs.

## 7. Backup, restore, migration and key rotation

- [ ] Establish a consistent backup point: stop writes, builds and asynchronous
      deletion as documented, allow in-flight work to settle, and record the
      snapshot timestamp. SQL metadata and objects are separate systems; a DB
      backup alone is not a complete site backup.
- [ ] VPS: back up SQLite using its supported WAL-safe procedure, MinIO objects
      and required project/configuration/ownership metadata. Restore into an
      isolated installation with matching engine and migration versions.
- [ ] Cloudflare: use supported remote D1 backup/export and R2 object backup
      procedures, with the same consistency window. Restore into isolated D1/R2
      resources and a separate Worker. Verify account-specific bindings/secrets
      are reconstructed privately, not copied into repository evidence.
- [ ] For each restore, compare entry/role counts, draft and published values,
      block order, media references and actual object contents. Sign in and
      rebuild the application's static site. Isolate restore hooks so the drill
      cannot replace the original site's deployment.
- [ ] Record backup/restore duration, any data loss window and consistency caveat.
      Resume the original installation and verify normal publication.
- [ ] Exercise the documented forward migration/upgrade path on a backed-up
      installation. Check user-owned Astro/config/block source and README hashes;
      dry-run reports changes and conflicts without overwriting edits.
- [ ] Update an unedited installed block and attempt to update an edited block;
      the latter must be a conflict, with edited source preserved.
- [ ] Rotate auth/build credentials and applicable provider/hook secrets through
      their documented flow. Verify old credentials stop working, expected
      session invalidation is explained, and publication/build recovery resumes.
      Do not assume automatic database downgrade support.

## 8. Record results and close the owner gate

Use one result row per scenario and per environment. Suggested record:

| Scenario | Environment | Artifact/site revision | Date | Status | Evidence / next action |
| --- | --- | --- | --- | --- | --- |
| Example: published snapshot isolation | VPS | To record | To record | pending | Private evidence reference |
| Example: Pages deployment tracking | Cloudflare | To record | To record | pending | Lace/provider IDs and served-page check |

Statuses: `passed`, `failed`, `pending`, or `not applicable` with an explanation
(for example, optional KV when unused). Record accepted risks explicitly with
owner, impact and decision; do not mark a failed scenario passed by accepting a
risk. Previously performed checks use the same evidence requirements.

Before claiming real-deployment release readiness:

- [ ] Both environments have results for every applicable scenario, including
      the shared application journey and independent public-site serving.
- [ ] The alpha.2 field-trial owner checks are covered: credential separation,
      the real Pages ETag build, and truthful Pages success/failure tracking
      ([historical acceptance map](archive/step-33/alpha-2-feedback-acceptance.md)).
- [ ] SQLite/MinIO and remote D1/R2 restore drills have usable evidence.
- [ ] All applicable checks pass; any pending/failed check and accepted risk is
      visible in the release decision. Local-only evidence is labelled as such.
- [ ] Record the tested version set and final owner decision. If a fix changes
      shipped behavior, prepare a coherent new candidate and repeat affected
      local and owner checks before making a readiness claim.

Keep or remove disposable test resources as the owner chooses, following the
Cloudflare handoff's cleanup procedure. Check the target before destructive
cleanup; retain the evidence and backups needed for the release record.

## Local operations evidence

See [34C local operations verification](local-operations-verification.md) for coordinated database/object restore, credential rotation, health/log interpretation and the running CMS version in administrator Settings. Remote deployment, D1 capacity/restore and provider permissions remain owner checks; local evidence does not close them.

## Post-roadmap owner evidence

The implementation roadmap's local completion leaves these owner gates pending:

| Gate | Required owner evidence | Status |
| --- | --- | --- |
| Real VPS | Exact artifact identity; TLS/secure cookies; trusted ingress/proxy rate limits; origin denials; editor/admin journey; MinIO media and failed/corrected build with previous release preserved | Pending |
| Real Cloudflare | Selected account/Worker/D1/R2 IDs; credential preflight; deployment and sign-in; real query/row/payload/capacity observations; object access; provider tracking with served output | Pending |
| Coordinated remote restore | Quiescence time; private D1 SQL/SQLite and object backup identities; separate restore targets; metadata/object checksums; fresh sign-in and static rebuild; original resumption | Pending |
| Production rotations | Old credential denial and replacement recovery for auth/build token, storage, builder or hook/provider; retained data and last served release | Pending |
| Publication/install | Reviewed source/inventory/checksums; explicit npm/image publication; independent clean install from published coordinates | Pending |
| Stable approval | Reviewed local and owner evidence, residual security/dependency risks, observability gaps and explicit release decision | Pending |

Use [MVP traceability](mvp-traceability.md) and [local operations](local-operations-verification.md) as the local baseline. Simulator snapshots and controlled hook/Pages responses cannot mark any real-account gate passed.
