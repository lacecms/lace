# Generated Project Acceptance

## Purpose

Proves that the generated Lace starter is a usable consumer project whose package, runtime, and deployment behavior does not depend on the Lace source workspace.

## Requirements

### Requirement: Acceptance installs an isolated generated consumer

The repository SHALL provide a repeatable acceptance command that packs the local Lace package graph, generates a disposable project, installs its dependencies from those packed artifacts, and fails if a Lace dependency resolves to a workspace link or source-workspace path. It SHALL leave the generated template and manifest unchanged while substituting local tarball references for the test installation.

#### Scenario: Local package acceptance
- **WHEN** the acceptance command runs with the supported Node and pnpm versions
- **THEN** `pnpm install` succeeds from the generated project using packed Lace artifacts, and no Lace dependency resolves to the source workspace

#### Scenario: Missing pack artifact
- **WHEN** a required Lace package cannot be packed or installed
- **THEN** acceptance fails with the affected package identified rather than falling back to a workspace import

### Requirement: Generated Node project passes an operator and content journey

Acceptance SHALL exercise a generated project's Node setup in the order its generated Compose development guide documents, against the project's own configuration and persistent state. It SHALL extract the shell commands of the development guide's installation and CMS preparation sections and fail when they differ from the reviewed sequence or name a missing package script. It SHALL then:

- prepare `.env` with the generated preparation command and change only the settings the development guide asks the operator to review (images, ports and the public/API origins), keeping every generated credential;
- run the read-only doctor at the `setup` stage and require success with the not-yet-started API and the missing database reported as expected;
- migrate without creating the database directory beforehand and require the migration to create it, then synchronize configuration, issue a bootstrap token and start the API with the documented start command;
- in a real browser against the packaged admin, open the admin while setup is incomplete, create the first administrator on the setup screen with the bootstrap token, sign in, complete the introductory tour with exactly the administrator's permitted steps, confirm that completion persists across a reload and that the tour can be replayed, and upload an image through Media;
- after setup, require a repeated bootstrap to be refused with its operation, cause and next action and without a token;
- publish an edit containing all five built-in blocks with the uploaded media, issue a read-only build token, build the Astro site and confirm it contains the published content and browser-facing media URLs that return the uploaded bytes.

It SHALL redact credentials from failure diagnostics after the one intentional bootstrap reveal and SHALL never place the bootstrap token in a URL.

#### Scenario: Published content journey
- **WHEN** a fresh generated Node project is installed and started by following its development guide
- **THEN** the operator commands prepare its environment and database, an administrator created in the browser setup screen can log in, tour the admin and publish an edit, and the Astro build contains the published content and media

#### Scenario: README sequence drifts
- **WHEN** the generated development guide's setup commands differ from the sequence acceptance executes
- **THEN** acceptance fails at the guide stage naming the differing command

#### Scenario: Directory pre-created
- **WHEN** the database directory exists before the first migration
- **THEN** acceptance fails rather than accepting a migration that did not create it

#### Scenario: Operator failure
- **WHEN** an acceptance step fails after bootstrap
- **THEN** diagnostics identify the failed step without repeating the bootstrap token, password, or complete secret environment values

### Requirement: Generated deployment paths pass local smoke tests

Acceptance SHALL run the generated Docker Compose production configuration with locally built, versioned API and builder images, verify API readiness and serving behavior, and stop its containers and volumes after the test. For a project generated with `--cloudflare`, acceptance SHALL preview the generated static-site output locally and SHALL run the packed consumer's own Worker without requiring a Cloudflare account or importing the source-workspace Worker composition.

#### Scenario: Compose production flow
- **WHEN** the required local images and generated environment are supplied to the generated Compose project
- **THEN** its production services start and the migrated API reaches readiness without accessing engine source in the generated project

#### Scenario: Optional Cloudflare flow
- **WHEN** the generator is invoked with `--cloudflare`
- **THEN** the generated static output previews locally and the generated consumer's Worker bundles and starts without remote credentials

### Requirement: Generated output has a reviewed byte-stable contract

The repository SHALL keep a committed snapshot of the generated file tree and ownership manifest for default and Cloudflare variants. Acceptance SHALL regenerate both variants, compare their managed bytes and manifests with the snapshots, verify each managed digest, and reject editable admin or engine source, usable secrets, or unclassified generated files.

#### Scenario: Repeatable generation
- **WHEN** two projects with the same name and template options are generated in different disposable parents
- **THEN** their file trees, managed bytes, and ownership manifests match the committed contract and one another

### Requirement: CI builds a starter generated from packed packages
Continuous integration SHALL, in addition to building the reference site, pack the Lace packages the generated project depends on, generate a project, install it from those tarballs outside the source workspace, and build its starter site against a local published-export server. The phase SHALL fail when the install resolves a Lace package from the source workspace, when the build emits fewer than the five built-in block types, or when the build token appears in any static output file.

#### Scenario: Shipped starter builds
- **WHEN** the starter phase runs on a clean checkout
- **THEN** the packed generated project installs, builds all five blocks from the served export, and contains no build token in its output

#### Scenario: Template references an unpublished helper
- **WHEN** the starter imports a module that exists only in the source workspace
- **THEN** the packed install or build fails the phase

### Requirement: Packed Cloudflare consumer runs its own Worker
The repository SHALL provide a Cloudflare consumer acceptance phase, runnable without Docker or a Cloudflare account, that packs the local Lace graph, generates a project with `--cloudflare`, installs it from the packed artifacts outside the source workspace, and uses only the generated project's scripts, Worker entry and configuration. The Worker SHALL NOT import the source-workspace composition root. The phase SHALL:

- bundle the Worker and reject a bundle that references the source workspace or lacks the project's models;
- prepare local Worker variables and point the project's operator API and public origins at the local Worker;
- run the packaged `lace doctor --target cloudflare-local` before migration and require `setup` to exit 0 with the unreachable API reported as expected and migration inspection skipped, and `ready` to fail, without creating the local state directory;
- migrate, synchronize and bootstrap through the `cloudflare-local` target;
- expire the issued setup token in the stopped local state as explicit fixture preparation, start the Worker with persistent local state, and require the browser setup screen to reject that token without creating an administrator while setup stays incomplete; then issue a fresh token with the stopped Worker and continue;
- verify readiness, the packaged admin document and an admin asset;
- in a real browser against the packaged admin: create the first administrator through the setup screen, sign in, upload media, create and edit a collection entry that references the media, save it and publish it;
- configure a controlled HTTPS deploy hook in the local Worker variables, initially unavailable, and require that scheduled dispatch leaves the build pending with the sanitized `trigger_unavailable` reason while publication stays committed; after the hook recovers, scheduled dispatch SHALL deliver exactly one bodiless `POST` without cookie or authorization and the build SHALL be recorded as running with the provider deployment ID, never as succeeded;
- run `lace doctor --target cloudflare-local --stage ready` against the running Worker and require API readiness and API-derived migration evidence to pass;
- issue a read-only build token, build the generated Astro site against the Worker's authenticated published export, and require the published entry, its blocks and Worker-origin media URLs that return the uploaded bytes;
- save a later draft and require that the published export is unchanged and a rebuilt site does not contain the draft;
- stop and restart the Worker and verify sign-in, closed setup, models, the uploaded media bytes, the published export and the saved draft;
- scan the generated project files except the ignored local secret files, the Worker bundle, the static output, the Worker output and every captured diagnostic for the auth secret, setup tokens, password, session, build token and deploy-hook URL.

It SHALL redact those values from diagnostics, stop every Worker, browser and hook process and remove its temporary project unless retention is requested.

#### Scenario: Cloudflare consumer journey
- **WHEN** the Cloudflare consumer acceptance phase runs on a clean checkout
- **THEN** the packed generated project bundles and starts its own Worker, completes browser setup, editing and publication, dispatches the build to the controlled hook, builds its Astro site from the Worker's published export, and its D1 and R2 state survives a restart

#### Scenario: Worker bundle uses source-workspace code
- **WHEN** the generated Worker bundle references a path inside the Lace source workspace
- **THEN** acceptance fails at the bundle stage with that reason

#### Scenario: Worker fails to become ready
- **WHEN** the local Worker exits or does not report readiness within the bounded wait
- **THEN** acceptance fails with the stage and sanitized Worker output and stops the Worker process

#### Scenario: Expired setup token
- **WHEN** the browser setup screen is submitted with an expired operator-issued token
- **THEN** setup remains incomplete, no administrator exists, and a token re-issued with the local bootstrap command completes setup

#### Scenario: Hook accepted but not confirmed
- **WHEN** the recovered hook answers with a provider deployment ID
- **THEN** the build is running with that ID and acceptance fails if it is reported as succeeded

#### Scenario: Draft leaks into a build
- **WHEN** a draft saved after publication changes the published export or appears in the rebuilt site
- **THEN** acceptance fails at the draft-isolation stage

#### Scenario: Secret in an output
- **WHEN** any scanned file, bundle, output or diagnostic contains one of the journey's secret values
- **THEN** acceptance fails naming the surface without printing the value

### Requirement: Full acceptance is the onboarding feedback regression suite

The repository's full generated-project acceptance run SHALL, from one packed Lace package graph, run in sequence the byte-stable snapshot check, the development-guide-driven generated Node consumer, its Compose production release, the static-site preview of a generated `--cloudflare` project, the dev/manual/automatic publication visibility journey, the existing-Astro consumer, the packed Cloudflare consumer journey and the upgrade from alpha template `0.4.0`. It SHALL stop at the first failing stage with that stage's name and a non-zero exit, SHALL refuse to run while the publication-visibility observe-only mode is requested, and SHALL remove every temporary project, container, volume and process unless retention is requested.

#### Scenario: Complete regression run
- **WHEN** the full acceptance runs on a clean checkout with Docker, Chromium and the supported Node and pnpm versions
- **THEN** every consumer journey passes and the run reports success only after the last stage

#### Scenario: Observe-only visibility requested
- **WHEN** the full acceptance is started with publication-visibility observation enabled
- **THEN** it fails before generating a project, because observed mismatches would not fail the run

#### Scenario: Visibility mismatch
- **WHEN** published, draft-only or newly routed content is visible differently from the documented dev, manual-static or automatic-Compose behavior
- **THEN** the run fails at the visibility stage and lists each mismatch

### Requirement: Existing-Astro consumer follows the connection guide

Acceptance SHALL generate a CMS in a `cms/` subdirectory of an independent Astro site with the existing-site mode, without changing the site, and SHALL connect the site by following the generated connection guide: the loader, TypeScript declaration and route files SHALL be written from the guide's code blocks, the Lace site packages SHALL be installed from packed artifacts, and the block components, block map and block lock SHALL be installed only by the packaged `lace add block --all --site ..`. It SHALL:

- prepare the CMS environment and require the resolved Compose configuration to mount the parent site read-only as the build source with the site directory `.` and output `dist`, and the packaged doctor to report the site ready after blocks are installed;
- build the parent site through the CMS root build script against a controlled published export and require all five built-in blocks, the `data-lace-model`, `data-lace-entry`, `data-lace-block`, `data-lace-block-key` and `data-lace-part` styling hooks, and media URLs on the configured public origin that return the published media bytes;
- render hostile rich-text text only as escaped text inside allowlisted elements with safe links, and fail the build rather than render a `javascript:` link;
- preserve an operator edit to a block component when blocks are installed again, and, after fixture preparation records older installed bytes for two components (the state an earlier registry build leaves), update the unmodified component while reporting the edited component as a conflict with a non-zero exit and leaving its bytes unchanged;
- scan the static output for the build token.

#### Scenario: Guide-connected site builds
- **WHEN** the existing site is connected with only the guide's files and the packaged block command
- **THEN** its static output contains all five blocks, the styling hooks and working public media URLs

#### Scenario: Unsafe link in published rich text
- **WHEN** the published export contains a rich-text link with a `javascript:` URL
- **THEN** the build fails and no output contains that URL

#### Scenario: Edited block during an update
- **WHEN** an operator has edited one installed component and a newer block revision is available for it and for an unedited component
- **THEN** the unedited component is updated, the edited one is reported as a conflict, and the operator's bytes remain

#### Scenario: Wrong build site selected
- **WHEN** the resolved Compose builder does not mount the parent site read-only as the build source
- **THEN** acceptance fails at the build-site selection stage

### Requirement: Upgrade from the published alpha template is proven

The repository SHALL keep fixtures holding the exact default and `--cloudflare` projects generated by the published `create-lace@0.1.0-alpha.1` package (template `0.4.0`), recording that package's published digests, and a test SHALL verify each fixture's manifest version and managed-file digests. Acceptance SHALL materialize each fixture, add a user README and user edits to `lace.config.ts` and a `site/` source file, generate the current template with the same options, and upgrade with the packed CLI:

- a modified managed file SHALL be reported as a conflict, and apply SHALL fail without changing any project file other than its conflict-review and recovery records under `.lace/`;
- after the operator restores that file, the plan SHALL have no conflict, apply SHALL make every changed or new managed file equal the current template, remove a retired managed file that was unmodified, record the current template version, and leave the README, `lace.config.ts` and all `site/` files byte-for-byte unchanged without adding files under `site/`;
- a following plan SHALL report no changes.

#### Scenario: Alpha project upgrade
- **WHEN** a template `0.4.0` project with user edits is upgraded to the current template
- **THEN** managed infrastructure is current and the user's README, configuration and site source are unchanged

#### Scenario: Modified managed infrastructure
- **WHEN** a managed file of the `0.4.0` project was edited by the operator
- **THEN** the upgrade reports the conflict and apply writes nothing

### Requirement: Onboarding feedback is traceable to acceptance evidence

The repository SHALL keep a feedback acceptance map that lists every item of the onboarding feedback log with its resolution status, the acceptance stages, tests and documents that prove it, or an explicit decision or deferral. A repository test SHALL fail when a feedback item has no entry, when a referenced acceptance stage or file does not exist, when the deferred CMS-adoption item is not marked deferred, or when the map lists an unresolved defect. Once every item is resolved, decided or deferred, the log and its map MAY move under `docs/archive/`; the test SHALL then read them at their archived paths and keep enforcing the same rules.

#### Scenario: Unmapped feedback item
- **WHEN** a new numbered item is added to the feedback log without a map entry
- **THEN** the traceability test fails naming the item

#### Scenario: Open defect
- **WHEN** the map lists a defect found by the regressions as unresolved
- **THEN** the traceability test fails, so the regression suite is not counted as accepted

#### Scenario: Archived log and map
- **WHEN** the log and map are read from their archived location and a referenced stage or file is removed
- **THEN** the traceability test still fails naming the missing evidence

### Requirement: Scenario links and current-template upgrade remain verifiable
Focused generated-contract verification SHALL check scenario file presence, local links/anchors, command scripts and ordered lifecycle sequences for every site mode with and without Cloudflare. Current packed-consumer acceptance SHALL use the development guide's reviewed command sequence. Reviewed template `0.14.0` fixtures SHALL retain their original managed bytes/hashes and origin evidence rather than be reconstructed from changed templates; upgrade verification SHALL cover default and Cloudflare consumers, edited user README/configuration/site source, managed documentation conflicts, new-guide path collisions, successful managed-guide delivery and a no-op repeat plan. Existing-site mode SHALL prove its outer README remains unchanged. These checks SHALL NOT require a real Cloudflare account or claim complete 33H field-trial verification.

#### Scenario: Guide command or local link drifts
- **WHEN** a scenario guide refers to an absent file, anchor or package script, or its setup sequence differs from the reviewed consumer sequence
- **THEN** the focused contract check or acceptance fails and identifies the guide and discrepancy

#### Scenario: 0.14.0 migration evidence
- **WHEN** the current packed CLI upgrades a reviewed exact 0.14.0 fixture
- **THEN** guide delivery, conflict refusal, protected user bytes and a repeat no-op plan are verified against its recorded original manifest

### Requirement: Alpha.2 field-trial feedback is traceable to evidence

The repository SHALL keep an acceptance map for the alpha.2 field-trial log that lists each numbered item (§1–§6) and the general diagnostics requirement with a status (`resolved`, `decision`, `deferred` or `open`) and its evidence: acceptance stages, tests and documents, or a recorded decision. Every item whose final confirmation depends on a real Cloudflare account or real server SHALL name that check as owner input to the release gate rather than claim it was verified locally. A repository test SHALL fail when a log item has no row, when a referenced acceptance stage or file does not exist, when a row is `open`, or when a row's evidence is too short to identify proof. Each referenced acceptance stage SHALL be one that the exact-artifact suite runs.

#### Scenario: Complete map
- **WHEN** every alpha.2 item maps to existing exact-artifact stages, tests or documents with a non-open status
- **THEN** the traceability test passes

#### Scenario: Unmapped or open item
- **WHEN** an item lacks a row or is marked `open`
- **THEN** the traceability test fails naming the item

#### Scenario: Real-account confirmation pending
- **WHEN** an item's last confirmation needs a real Cloudflare deployment
- **THEN** the map names the owner check for the release gate and does not present local stub evidence as that confirmation
