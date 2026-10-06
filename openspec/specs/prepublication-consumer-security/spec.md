# Prepublication Consumer Security

## Purpose

Proves an exact prepared alpha release supports an independent local consumer while preserving essential authorization, publication isolation, credentials and build recovery.

## Requirements

### Requirement: Acceptance consumes one verified artifact inventory
Release acceptance SHALL require a complete clean-source inventory, verify archive checksums, package contents and selected platform image identity/version/revision, and generate using the packed generator. It SHALL install the exact packed dependency graph outside the engine checkout with test-only resolution overrides, reject source-workspace resolution, and leave delivered templates and ownership metadata unchanged. Each run SHALL isolate its project, ports and volumes and clean them on success or failure.

#### Scenario: Exact clean artifacts
- **WHEN** a complete clean-source alpha inventory and supported platform are supplied
- **THEN** acceptance uses its exact packages and API/builder image IDs and records their source identity and versions

#### Scenario: Ineligible or altered artifacts
- **WHEN** the inventory is partial, preview, checksum-mismatched or has mismatched image metadata
- **THEN** acceptance fails before advertising release acceptance success

### Requirement: Consumer content and persistence journey passes
Acceptance SHALL exercise generation, installation, migration, sync, bootstrap, login, draft editing, upload and reuse of media, publication and Astro output. It SHALL check all five built-in blocks and fetch rendered media from the browser-facing URL. After stopping and recreating local services without deleting storage, database content and original object bytes SHALL remain available.

#### Scenario: Services are recreated
- **WHEN** published content and reused media exist and consumer services are stopped and recreated
- **THEN** the same content identifiers, published data and uploaded object bytes remain readable

### Requirement: Essential authorization and snapshot isolation pass
Acceptance SHALL verify editor and viewer publication denial, anonymous draft/admin denial, and build-token access to published export only without admin/draft permissions. A later unpublished draft SHALL not change public export or generated output. Setup credentials SHALL cease working after setup and token listings SHALL exclude plaintext build credentials.

#### Scenario: Restricted consumers request protected operations
- **WHEN** editor/viewer sessions attempt publication or anonymous/build-token consumers request drafts or admin resources
- **THEN** authorization fails and published state remains unchanged

#### Scenario: Draft changes after publication
- **WHEN** a later draft changes the title and blocks without publication
- **THEN** published export and rebuilt static output retain the earlier published snapshot

### Requirement: Compose build failure preserves a recoverable release
Acceptance SHALL exercise the generated dispatcher/builder path and observe a succeeded durable build with served output. A controlled subsequent build failure SHALL preserve the previous served release, reach terminal failure and permit administrator retry. A recovered retry SHALL reach success and serve the latest published content. Test-only retry scheduling acceleration SHALL be explicit and SHALL not alter production policy or content.

#### Scenario: Failed build is retried
- **WHEN** a build fails after an existing successful release and the failure cause is corrected
- **THEN** the old release remains served during failure and an explicit retry produces a new successful release

### Requirement: Secret exclusion and release evidence are explicit
Acceptance SHALL inspect generated shipping files, extracted package archives, selected image filesystems/configuration, static output and captured diagnostics for test credentials and secret material. Secret detections SHALL fail without echoing values; expected operator .env and persistent auth storage SHALL remain outside shipping scans. Evidence SHALL record exact artifact/source identities, platform, checks and results, preserve relevant local Node/D1 and Worker coverage, and explicitly exclude registry publication, real Cloudflare deployment and stable Step 26 certification.

#### Scenario: Secret reaches shipping output or diagnostics
- **WHEN** a setup password, token or deployment secret occurs in a shipping surface or captured diagnostic
- **THEN** acceptance fails with the affected surface identified and the value redacted

### Requirement: Exact-artifact acceptance runs the onboarding feedback suite
Release acceptance against a complete clean-source inventory SHALL, after the content, authorization, build-recovery, persistence and secret-exclusion journeys, run every onboarding feedback consumer journey with only that inventory's artifacts: byte-stable snapshots produced by the packed generator matching the reviewed fixtures, the README-driven Node consumer including browser setup and tour, the static-site preview of a generated `--cloudflare` project, the dev/manual/automatic publication visibility journey, the existing-Astro consumer, the packed Cloudflare consumer journey including generated Worker packaging with the packaged admin, and the upgrade of the template `0.4.0` fixtures with the packed CLI to the packed generator's template. Every consumer SHALL be generated by the packed generator and install the inventory's package archives; Compose services SHALL use the loaded saved API/builder image IDs. No journey SHALL generate from, build images from or resolve packages to the engine checkout. Host commands that open the consumer database SHALL run only while the Compose API and dispatcher are stopped, as the generated guide instructs, and a site build SHALL follow each publication in the Compose release. The run SHALL stop at the first failing stage and record the receipt (source identity, versions, platform, package checksums and image IDs) only after every journey passes.

#### Scenario: Complete candidate passes
- **WHEN** a complete clean-source inventory is supplied and every consumer journey passes with its packages and image IDs
- **THEN** acceptance prints a receipt naming the exact source, versions, platform, package checksums and image IDs and the journeys run

#### Scenario: A journey fails
- **WHEN** any consumer journey fails against the candidate artifacts
- **THEN** acceptance exits non-zero naming that stage, prints no success receipt and removes temporary consumers, containers and volumes

#### Scenario: Source resolution attempted
- **WHEN** a consumer lockfile or installed Lace package resolves to the engine checkout
- **THEN** acceptance fails rather than counting the journey as artifact evidence

### Requirement: Exact-artifact acceptance runs the alpha.2 field-trial regressions
Release acceptance against a complete clean-source inventory SHALL, in addition to the onboarding feedback suite and with only that inventory's generator, package archives and loaded API/builder image IDs, run these alpha.2 field-trial regressions and name each in the receipt:

- **Block order:** in the admin served by the loaded API image, pointer and keyboard reordering, insertion and duplication in the middle of the list, removal and undo of removal SHALL save, survive reload and publish in the displayed order, and the build export and the packed consumer's static output SHALL contain the blocks in that order. A draft whose positions do not ascend SHALL be rejected with `CONTENT_INVALID_STATE`, a safe block-order explanation and a request ID, without advancing the draft revision or changing the published export.
- **Builder source diagnostics:** an existing-site consumer running the Compose production stack with the loaded images SHALL build with excluded root service-document links, and each injected unsupported source (in-site link, escaping link, unreadable entry, missing lockfile) SHALL reach a terminal failed build with its closed reason and safe relative path in the admin while the previous static release remains served; a corrected retry SHALL succeed.
- **Weak ETags:** the packed Astro loader SHALL read the build export from the Compose API through a compressing proxy that turns the strong validator weak, in static and development modes without a custom fetch, revalidate with the received validator, receive `304` while unchanged and new content after a publication.
- **Credential separation:** the packed CLI SHALL keep remote Lace credentials in the explicit private operator file, report OAuth shadowing by dotenv or shell tokens through preflight without contacting a real account, and the generated Worker SHALL bundle without an account.
- **Pages tracking:** the packed Cloudflare Worker, configured with Pages tracking against a local Pages API stub, SHALL record a hook-accepted deployment as running and complete it as `succeeded` only after the stub reports a successful deploy stage, and as `failed` with a tracked reason when the stub reports a failed stage; an untracked hook SHALL end in `accepted`. The Pages token SHALL not appear in build history, responses or captured diagnostics.
- **Scenario guides:** the packed consumer's development, production and Cloudflare guides SHALL contain the reviewed ordered command sequences, and the journeys SHALL run the commands those guides name; a missing, renamed or reordered command SHALL fail naming the guide.
- **Upgrade from the published alpha.2 template:** the template `0.14.0` default and Cloudflare fixtures SHALL upgrade with the packed CLI to the candidate template as specified for that upgrade, in addition to the `0.4.0` fixtures.

These journeys SHALL use only local stubs and SHALL NOT contact a real Cloudflare account, registry or remote host. A failing regression SHALL stop the run at its named stage without a success receipt.

#### Scenario: Candidate carries every field-trial fix
- **WHEN** a complete clean-source inventory passes every field-trial regression journey
- **THEN** the receipt lists the block-order, builder-diagnostics, weak-ETag, credentials, Pages-tracking, scenario-guide and published-template upgrade journeys with the inventory's identity

#### Scenario: Reordered blocks lose their order
- **WHEN** the packed admin saves or publishes blocks in an order different from the displayed one
- **THEN** acceptance fails at the block-order stage

#### Scenario: Weak validator rejected
- **WHEN** the packed loader rejects a weak build-export ETag received through the compressing proxy
- **THEN** acceptance fails at the weak-ETag stage

#### Scenario: Tracking reports success without proof
- **WHEN** the packed Worker marks a tracked build `succeeded` before the stub reports a successful deploy stage, or leaves it `running` after a terminal stub result
- **THEN** acceptance fails at the Pages-tracking stage

#### Scenario: Guide drift
- **WHEN** a generated guide in the packed consumer omits or reorders a command of its reviewed sequence
- **THEN** acceptance fails naming that guide
