## Context

See proposal.md for motivation and boundaries. `packages/server/src/app.ts` already receives `ServerEnvironmentMetadata.engineVersion`, uses it in OpenAPI and exposes an administrator-only settings-status route. That route currently returns only `ready` and `configuredModels`; `packages/contracts/src/index.ts` validates a strict response object. `SiteStatusCards` in admin Settings renders three cards and already has loading, refresh and error patterns. Both platform roots currently default engine metadata to `0.0.0`, although their public package manifests identify alpha.4.

Readiness checks the migration ledger through bounded local SQL in each adapter. It does not verify object storage, synchronized content or public deployment. The existing request completion logger emits actor ID when resolved, duration, method, path, request ID and status; dispatcher loggers add component/reason information. No new broad logging system is needed to document these fields truthfully.

Scenario guides live under `packages/create-lace/templates/docs/`; `scripts/consumer-guides.mjs` and acceptance tests already compare and execute selected fenced setup commands. The operations reference contains substantial guidance but needs coordinated operational drills and consistent version statements. Existing 34A/34B runners and exact-artifact acceptance provide phase/result and cleanup patterns. 34B is complete but still active; its source fixes and template 0.19.0 form the baseline, while its accepted-spec synchronization is a separate owner-requested action.

## Goals / Non-Goals

**Goals:** bind release identification to installed artifacts, reuse the existing authorized status and UI boundaries, execute documented local operations against isolated realistic persistence, and leave reviewable evidence and an accurate owner checklist.

**Non-Goals:** new storage/domain ports solely for tests, remote execution, a general backup product, online cross-system snapshots, a public diagnostics endpoint, or expanding readiness into expensive network probes. The operator checklist can combine Settings, Builds, explicit CLI/SQL observations and a bounded object roundtrip; it is not a new admin dashboard.

## Decisions

### 1. Artifact-bound release metadata

Add a small portable release-version module in each platform package. Generate its literal from that package's manifest using shared repository tooling, and check that committed/generated values match `release/alpha.json` and the public manifests in release validation. Keep the generated literal available to ordinary typecheck/test/build and include compiled output in packed artifacts. Worker runtime code reads no filesystem or checkout path; Node uses the same approach for parity. Add generation/check ordering to package build/release preparation so changing a release cannot silently leave stale metadata. Preserve Node's explicit environment override for embedding callers.

Rejected alternatives: private root/app versions identify the workspace, not the engine; operator-maintained variables drift from installed artifacts; reading release JSON at runtime assumes a checkout; Vite-only substitution identifies browser assets and misses Worker/Node server defaults. No new package dependency or Node import is introduced in portable code.

### 2. Extend the existing Settings contract

Add required nonempty bounded `engineVersion` to `adminSettingsStatusSchema` and populate it from server environment metadata. The exact installed release, including prerelease suffix, is the displayed string. Update contract fixtures, client fixtures, OpenAPI output/checks and server tests together. Strict old clients reject unexpected response keys, so release API/contracts/admin together; this is additive within the supported coherent release set, not a claim that mismatched versions interoperate.

Use an additional card labelled "CMS version" in `SiteStatusCards` with the existing responsive layout and tokens. Initial loading, unavailable response, stale refresh and session recovery have explicit coverage. Keep Settings administrator-only and verify editor, viewer, anonymous and build-token denials at the API. Show the last confirmed version with a stale indication when refresh fails; do not continue to describe cached status as current. No sidebar request or extra role-visible endpoint is needed.

### 3. Local operations runner and evidence

Add `scripts/operations-verification.mjs` exposed as `pnpm verify:34c`, with focused test modules for phase bookkeeping, runtime health/logs, coordinated restoration and rotation. Reuse compatible phase orchestration from existing runners, but do not change their historical results. Each run owns a unique temporary project, persistence roots, Compose project/container labels and loopback ports. Cleanup tracks owned resources and runs in success/error/signal paths; retain sanitized evidence separately from disposable secrets/backups. Report required phases as passed/failed/not-run and reject skips or zero assertions.

Run guide command paths through the existing guide extraction/acceptance helpers. Use local explicit targets and environment allowlists; reject remote target/provider credentials for the operations runner. Provider rotation and build tracking use controlled local endpoints. Execution evidence includes runtime/tool/source/artifact identity, named assertions, timing and redacted comparison hashes. Failed prerequisites never become accepted skips.

### 4. Coordinated backup and isolated restore

Seed independent installations with accounts/roles, an edited draft differing from published content, ordered blocks and referenced media with known hashes. Quiesce API writes, dispatch, deletion and builder/provider activity; settle claims before capturing a snapshot. Record this consistency point and explain downtime implications. On SQLite use supported SQLite backup tooling against the stopped database, including WAL handling, and copy MinIO objects through its supported object API. On local Worker stop the isolate and capture the complete isolated Miniflare persistence state for D1/R2, including SQLite journals and object backing data; restore only into separate local persistence with the same pinned simulator version. This is a local simulator snapshot, explicitly distinct from remote D1 export/restore and R2 object tooling.

Back up config/site ownership metadata separately from private runtime settings. Start the restore in a new identity/origin with local replacement secrets and isolated build destinations. Compare canonical SQL/API values and every referenced object's hash before exercising sign-in, public media and an Astro rebuild. Include a negative missing-object/changed-byte case; SQL success alone must fail overall restore acceptance. Resume the original and confirm its data and publication remain intact. Backups contain credentials/hashes and content, so keep them private and out of committed evidence.

Rejected alternatives: live DB-only copies and simultaneous uncoordinated object copies cannot prove consistency; simulator snapshots cannot verify remote provider backup semantics. Remote procedures remain owner-operated and cite current official provider tooling during implementation when concrete remote commands are documented.

### 5. Rotation, migrations and recovery

Use isolated fixtures to replace/revoke build tokens, rotate the auth secret and check old session rejection/fresh sign-in, update Node builder credentials on both sides and rotate MinIO access credentials without deleting object data. Verify stale credentials are denied and replacements recover the applicable operations. Simulate deploy-hook/provider credential rotation through controlled endpoints; real permissions and deployment remain pending. Update forward-migration and filesystem-upgrade guidance using existing CLI/upgrade acceptance; no SQL downgrade is introduced. Run failed/corrected build recovery against actual persisted build state and assert the previous complete static release stays available until atomic replacement.

### 6. Documentation, traceability and candidate refresh

Complete existing generated scenario/operations guides and repository references, keeping the Cloudflare handoff and owner plan consistent. Provide an operator observation table with commands, actual meaning, limitations and safe next actions for migration/config hashes, object storage, latest build and engine version. Do not claim completion logs contain entry/model/publication identifiers unless actually emitted and verified. Architecture §21's wider observability aspirations remain explicit gaps if current code lacks them; any new behavior needed beyond this plan requires an artifact revision.

Create `docs/mvp-traceability.md`, `docs/local-operations-verification.md`, a 34C verification record and a separate exact-artifact/result inventory under `docs/archive/step-34/`. Map architecture §3 Included and §14 security requirements to named test files/scenarios, documentation, observed local status and owner evidence requirements. Reuse historical evidence only for unaffected behavior with attributable artifact identity.

Advance ownership template to 0.20.0 coherently for managed operational-guide changes, retaining the selected unpublished alpha.4 package/image release. Update generator/upgrade fixtures, manifest metadata and version statements together. Do not archive or synchronize 34B implicitly. Prepare a refreshed clean-source candidate and run both-platform image smokes and the complete existing exact-artifact consumer suite, adding release-display/operations assertions and the roadmap final journey. Native full-consumer execution and emulated image smokes must be described separately, as in 34B. If a clean source snapshot cannot be prepared under the available Git permissions, preserve source results and report candidate acceptance incomplete.

## Risks / Trade-offs

- [Version literals drift] → generation plus release checks and independent packed/image assertions; never accept `0.0.0` in candidate verification.
- [Strict mixed-release clients reject the new field] → coordinated API/contracts/admin deployment and explicit compatibility documentation.
- [Restore appears successful while media is lost] → canonical metadata and object hash comparison plus negative fixtures and static rebuild.
- [Snapshot resumes pending work against the original site] → quiesce dispatch and reconstruct isolated secrets/hooks/build destinations before restarting restored services.
- [Local simulator evidence is overstated] → name simulator version/method and leave remote backup/restore and D1 limits pending.
- [Docs repeat historical template versions] → verify rendered managed guides for every generated mode and ownership upgrade conflict preservation.
- [Large acceptance requires Docker/tool availability] → fail/incomplete phase reporting; no skipped required phase or relabelled old artifact can close 34C.

## Migration Plan

No database migration is needed. Release the status contract, platform metadata and admin together. Existing consumers obtain guide changes through the normal hash-checked template upgrade; user-owned files stay protected. Back up before any deployment migration/upgrade. Filesystem rollback retains its existing journal semantics; database rollback uses a verified coordinated backup and a compatible engine, never automatic down migrations. Close only local roadmap status after refreshed exact-artifact verification; publication, real deployments and archive actions require their separate user requests.
