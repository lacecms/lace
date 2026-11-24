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
- describe the uploaded image with alt text and a focal point through the media metadata API, publish an edit containing all five built-in blocks at their current block versions with the uploaded media (the `image` block with its own alt text), issue a read-only build token, build the Astro site and confirm it contains the published content and browser-facing media URLs that return the uploaded bytes, that the hero image carries the media alt text and the `image` block its own alt text, that both carry `width` and `height` equal to the uploaded image's dimensions, and that both carry the focal-point `object-position` style.

It SHALL redact credentials from failure diagnostics after the one intentional bootstrap reveal and SHALL never place the bootstrap token in a URL.

#### Scenario: Published content journey
- **WHEN** a fresh generated Node project is installed and started by following its development guide
- **THEN** the operator commands prepare its environment and database, an administrator created in the browser setup screen can log in, tour the admin and publish an edit, and the Astro build contains the published content and media with effective alt text, dimensions and focal point

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
Continuous integration SHALL, in addition to building the reference site, pack the Lace packages the generated project depends on, generate a project, install it from those tarballs outside the source workspace, and build its starter site against a local published-export server. The phase SHALL build the starter once from an export with a published `settings` global, stored SEO values and a configured `LACE_BUILD_SITE_URL`, and once from an export without globals and without a site URL. The phase SHALL fail when the install resolves a Lace package from the source workspace, when the build emits fewer than the five built-in block types, when a build makes more than one export read, when the site header does not show the published site name with a published global or the static fallback without one, when the head metadata, `sitemap.xml` or `robots.txt` output differs from the expectations below, or when the build token appears in any static output file.

#### Scenario: Shipped starter builds
- **WHEN** the starter phase runs on a clean checkout
- **THEN** the packed generated project installs, builds all five blocks from the served export, and contains no build token in its output

#### Scenario: Starter builds with and without a published global
- **WHEN** the starter phase serves an export with a published `settings`
  global and then one without globals
- **THEN** the first build shows the published site name and tagline, the
  second shows the static fallback site name, and each build reads the export
  once

#### Scenario: Starter builds with a site URL
- **WHEN** the starter is built with a published `settings` global, a post
  with a stored SEO description and `LACE_BUILD_SITE_URL`
- **THEN** the home page title is formatted with the published site name, the
  post has the stored description, `og:type` `article` and a canonical URL
  under the site URL, `sitemap.xml` lists the home page and the post, and
  `robots.txt` names the sitemap

#### Scenario: Starter builds without a site URL
- **WHEN** the starter is built from an export without globals and without
  `LACE_BUILD_SITE_URL`
- **THEN** the build succeeds, pages have a title and no canonical link or
  `og:url`, no `sitemap.xml` is written, and `robots.txt` allows everything
  without a `Sitemap:` line

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

### Requirement: Acceptance verifies rendered block envelopes
The packed starter phase SHALL fail when the starter built from the served
export with a site URL does not render the home call to action's anchor as
its root `id`, its class name merged into its root `class`, and the home
hero's in-page link to that anchor. The generated Node journey SHALL publish,
through the admin API, an edit whose blocks include one with an anchor and a
class name and one hidden block with distinguishable text, and SHALL fail
when the built page lacks the anchor `id` or the merged class, or contains
the hidden block's text or block key.

#### Scenario: Starter renders an in-page anchor
- **WHEN** the packed starter is built from the export with a site URL
- **THEN** the home page contains `href="#get-started"` and the call to
  action's root with `id="get-started"` and class `cta cta--highlight`

#### Scenario: Node journey hides a block
- **WHEN** the Node journey publishes an edit with a hidden quote and an
  anchored hero and builds the site
- **THEN** the built page carries the hero's anchor and class name and does
  not contain the hidden quote's text or block key

### Requirement: Acceptance verifies Gallery and site navigation in the packed starter
The packed starter phase SHALL serve an export whose post contains a
published gallery and whose `navigation` global is published with a
navigation block that has a submenu, and SHALL fail when the built post
lacks the gallery root with one figure per item and the effective alt text,
when any built page lacks the global's navigation root in its header, its
links, its `details` submenu or `aria-current="page"` on the link to that
page, or when the fallback navigation is also present. The build from the
export without globals SHALL fail the phase when any page lacks the static
fallback navigation or contains a navigation block root in its header.

#### Scenario: Starter renders published navigation and a gallery
- **WHEN** the packed starter is built from the export with a published
  navigation global and a post gallery
- **THEN** every page's header contains the navigation block with its submenu
  disclosure, the home link carries `aria-current="page"` on the home page,
  and the post contains the gallery figures with their alt text

#### Scenario: Starter falls back without the navigation global
- **WHEN** the packed starter is built from the export without globals
- **THEN** every page shows the static fallback navigation and no navigation
  block root in its header

### Requirement: Packed consumers import the documented sample package
Acceptance SHALL prove `lace import` from the packed CLI in a generated project,
using the documented sample package copied outside the project directory and
the generated project's own `lace.config.ts`:

- the CI starter phase SHALL run `pnpm exec lace import <sample> --validate-only`
  from the generated project root with no token and no running API and require
  exit code 0;
- the generated Node journey, after its existing publication and build checks,
  and the packed Cloudflare consumer journey, after its existing build checks
  and before stopping the Worker, SHALL issue an import token with publishing
  through the admin REST API, run `pnpm exec lace import <sample> --publish`
  with the token only in `LACE_IMPORT_TOKEN` and the runtime's origin in
  `--url`, require exit code 0, require the sample's posts and the `settings`
  global in the authenticated published export, then rerun the same command
  and require every item reported `unchanged`.

Failure diagnostics SHALL NOT contain the import token.

#### Scenario: The packed CLI validates the sample offline
- **WHEN** the starter phase validates the sample package from the generated
  project root
- **THEN** the command exits 0 without network access or a token

#### Scenario: The sample imports into a generated Node project
- **WHEN** the generated Node journey imports the sample package with
  `--publish` and reruns it
- **THEN** the published export contains the sample's posts and settings and
  the rerun reports every item `unchanged`

#### Scenario: The sample imports into a local Cloudflare Worker
- **WHEN** the packed Cloudflare consumer journey imports the sample package
  into its running local Worker with `--publish` and reruns it
- **THEN** the published export contains the sample's posts and settings and
  the rerun reports every item `unchanged`

### Requirement: Scenario guides and published-template upgrades remain verifiable
Focused generated-contract verification SHALL check scenario file presence, local links/anchors, command scripts and ordered lifecycle sequences for every site mode with and without Cloudflare. Current packed-consumer acceptance SHALL use the development guide's reviewed command sequence. Retained published-template fixtures SHALL keep their original managed bytes/hashes and origin evidence rather than be reconstructed from changed templates; upgrade verification SHALL cover default and Cloudflare consumers, edited user README/configuration/site source, managed documentation conflicts, new-guide path collisions, successful managed-guide delivery and a no-op repeat plan. Existing-site mode SHALL prove its outer README remains unchanged. These checks SHALL NOT require a real Cloudflare account.

#### Scenario: Guide command or local link drifts
- **WHEN** a scenario guide refers to an absent file, anchor or package script, or its setup sequence differs from the reviewed consumer sequence
- **THEN** the focused contract check or acceptance fails and identifies the guide and discrepancy

#### Scenario: Published-template upgrade evidence
- **WHEN** the current packed CLI upgrades the retained exact published-template fixture
- **THEN** guide delivery, conflict refusal, protected user bytes and a repeat no-op plan are verified against its recorded original manifest

### Requirement: Generated production ingress is verified
Acceptance SHALL inspect resolved production Compose bindings for the
repository example and for every generated site mode with and without
Cloudflare support. It SHALL check the default loopback port, a custom
`LACE_HTTP_PORT`, an explicit alternate Nginx bind and the absence of API,
builder, object store and dispatcher host mappings. It SHALL verify that
only the explicitly selected generated development configuration adds the
API's loopback host mapping.

The packaged Node consumer SHALL exercise the production setup and full-stack
start through Nginx. It SHALL verify readiness, admin setup or sign-in, and
authenticated build-export access through the documented ingress. For a site
deployment it SHALL also verify the served static release. When a consumer is
transitioned from the development command to production startup, acceptance
SHALL verify the development API host mapping is removed from the running
stack.

#### Scenario: All rendered variants resolve safe ingress defaults
- **WHEN** Compose resolves the repository example and all six generated production variants
- **THEN** only Nginx has a host binding, and the default port is bound to `127.0.0.1`

#### Scenario: A packed production consumer bootstraps before the builder
- **WHEN** the setup command runs with the packed images and the initial generated environment
- **THEN** Nginx serves health and the packaged admin before the build token is created, and production startup serves the protected build export and built site through the documented ingress

#### Scenario: A development consumer switches to production
- **WHEN** the production command recreates the stack after `pnpm dev:api`
- **THEN** the API has no host mapping and its previous host endpoint cannot be used

### Requirement: Acceptance verifies the bundled SILO deployment and volume transition

Acceptance SHALL compare the repository and generated Compose image defaults and check the resolved optional override, private network access, and persistent storage mount in every generated variant. The packed Node consumer SHALL exercise a pull or reuse of the declared prebuilt storage image through development and production startup. It SHALL verify private bucket initialization and media write and read behavior. The storage transition check SHALL start the previously shipped MinIO image on an isolated named volume, store media, replace only the storage image under the same project, and verify that the original media bytes and keys and new media persist across recreation and restart. Checks SHALL use locally owned state and clean up only resources they own.

#### Scenario: Generated development and production start from a pinned image
- **WHEN** a packed consumer starts against a newly initialized store with the default image
- **THEN** the current Compose definition uses SILO without building MinIO, and a private media upload can be read through Lace

#### Scenario: All generated variants resolve the same default and use an explicit override
- **WHEN** Compose resolves the repository development and VPS configurations and all generated variants with unset, empty, and explicitly supplied image values
- **THEN** the same pinned default or the explicitly supplied image is selected while the media mount and private network remain available

#### Scenario: A named volume written by the former release is reused
- **WHEN** the controlled MinIO-to-SILO transition and storage restart run
- **THEN** previously recorded object keys and bytes match on readback, the new write round trip succeeds, and the test leaves ordinary development and deployed volumes untouched

### Requirement: Packed consumer acceptance verifies standard preview activation
Acceptance SHALL start generated Node development and VPS deployments and the
generated Cloudflare Worker using their shipped entry points and configured
preview prerequisites. Local Worker acceptance can simulate the GitHub
transport by substituting provider responses at its external boundary.
Tests SHALL exercise the real persisted Lace session and route composition.
Activation SHALL use only deployment settings and the documented startup
workflow.

#### Scenario: Supported entry points are off or incomplete
- **WHEN** packed deployments start with the flag absent or false, or are explicitly enabled with incomplete prerequisites
- **THEN** preview is unavailable while sign-in, ordinary editing and publication behavior remain functional

#### Scenario: Supported entry points opt in
- **WHEN** each deployment is opt-in configured and an authorized editor requests a saved draft preview
- **THEN** the pinned Astro build produces a viewable page and private assets, unauthorized requests remain denied, and the published export and public site output do not change

#### Scenario: Opt-in is withdrawn
- **WHEN** an enabled deployment with a ready preview is restarted with preview disabled and its persistent data is preserved
- **THEN** existing viewer access and runner requests are rejected while the published output and ordinary operations remain available

### Requirement: The packed CLI upgrades the supported published template

The repository SHALL keep fixtures holding the exact default and `--cloudflare` projects generated by the supported published origin, recording that package's published digests and source revision, and a test SHALL verify each retained fixture's manifest version, provenance and managed-file digests without naming a template version in the test. The active fixture set SHALL contain only the selected origin. Acceptance SHALL materialize each fixture, add a user README and user edits to `lace.config.ts` and a `site/` source file, generate the current template with the same options, and upgrade with the packed CLI:

- a modified managed file SHALL be reported as a conflict, and apply SHALL fail without changing any project file other than its conflict-review and recovery records under `.lace/`;
- after the operator restores that file, the plan SHALL have no conflict, apply SHALL make every changed or new managed file equal the current template, record the current template version, and leave the README, `lace.config.ts` and all `site/` files byte-for-byte unchanged without adding files under `site/`;
- a following plan SHALL report no changes.

Each fixture SHALL be generated from the actual immutable published package
with recorded source revision, archive hash and registry integrity, never
reconstructed from the current workspace. Generic upgrade conflict,
user-file preservation, digest-tampering, recovery, idempotence and
image-identity tests SHALL remain when fixtures are replaced.
An independent synthetic upgrade test SHALL verify that an unmodified retired
managed file is removed. The historical RC5-to-1.0.0 qualification also verified removal of the managed storage Dockerfile and conflict refusal on an edited copy.

#### Scenario: Published-template project upgrade
- **WHEN** a project on the latest published template with user edits is upgraded to the current template
- **THEN** managed infrastructure is current and the user's README, configuration and site source are unchanged

#### Scenario: Modified managed infrastructure
- **WHEN** a managed file of the published-template project was edited by the operator
- **THEN** the upgrade reports the conflict and apply writes nothing

#### Scenario: Fixture integrity
- **WHEN** a retained fixture's managed file bytes no longer match the digests in its recorded manifest
- **THEN** the fixture test fails naming the fixture and file

#### Scenario: The supported origin replaces superseded fixtures

- **WHEN** the release fixture suite runs after the supported published origin changes
- **THEN** exactly the two authenticated variants for the selected origin supply the projects, and stale or additional template directories fail fixture verification

### Requirement: The executable upgrade suite covers the supported release floor

The current release acceptance SHALL exercise the supported direct upgrade origin. Superseded projects, seeded databases, block conversions, release-specific assertions, runners, snapshot expectations and CI jobs SHALL be removed or rewritten to cover current behavior. Previous verification records SHALL remain attributable to their release. RC5 is the historical direct upgrade origin for 1.0.0. Generic ownership, journal recovery, unknown ledger refusal, migration idempotence, content synchronization and fresh-install coverage SHALL remain executable.

#### Scenario: Reviewing release migration coverage

- **WHEN** the release-specific tests, fixtures, assertions, acceptance entry points and CI jobs are inventoried for 1.1.0
- **THEN** the active upgrade journeys start at 1.0.0 and each retained generic case has a current behavioral assertion

### Requirement: The 1.1.0 template upgrades published 1.0.0 projects

The 1.1.0 upgrade suite SHALL retain default and `--cloudflare` fixtures generated by the published `create-lace@1.0.0` package and validate the recorded source revision, npm integrity, archive checksum, ownership manifest and managed digests. It SHALL plan and apply the packed upgrade from `0.52.0` to `0.53.0` in both variants. The suite SHALL preserve README, `lace.config.ts`, every user-owned site file and the Cloudflare project's `worker/wrangler.jsonc`, including operator changes. The upgrade SHALL adopt new managed files and matching dependencies and image references, and SHALL preserve the existing conflict, recovery and repeat no-op guarantees.

#### Scenario: A generated project has local edits
- **WHEN** a published 0.52.0 fixture with edited user-owned files is upgraded with the packed 1.1.0 CLI
- **THEN** the manifest records 0.53.0, changed managed guides match the new template, operator files remain byte-for-byte intact, and a second plan reports no managed changes

#### Scenario: A managed guide was edited
- **WHEN** both the operator and the incoming release have changed a managed guide
- **THEN** the plan reports a conflict and apply leaves project files unchanged apart from the conflict-review records
