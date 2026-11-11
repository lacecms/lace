# Project Generator

## Purpose

The project generator creates a fresh, upgrade-aware Lace project while protecting existing user files and separating user-owned source from managed infrastructure.

## Requirements

### Requirement: The generator accepts only safe project targets

The `create-lace` executable SHALL support `create <dir>` for a new project, bare `<dir>` as the `pnpm create lace <dir>` shorthand, and `init .` for the current directory. It SHALL resolve the target to an absolute path and SHALL reject a file, a symbolic-link target, an existing directory containing anything other than `.git`, `README.md`, and `LICENSE`, missing or extra positional arguments, and unsupported flags. It SHALL NOT follow an allowed entry that is a symbolic link.

#### Scenario: New directory
- **WHEN** a user runs `create-lace create my-site` and that path does not exist
- **THEN** a project is created at its resolved path

#### Scenario: pnpm create shorthand
- **WHEN** a user runs `pnpm create lace my-site` and that path does not exist
- **THEN** the executable creates the same project as `create-lace create my-site`

#### Scenario: Existing empty repository
- **WHEN** a user runs `create-lace init .` in a directory containing only `.git` and `README.md`
- **THEN** both existing entries remain byte-identical and the project files are added

#### Scenario: Existing work is protected
- **WHEN** the target has any other entry, is a symlink, or a preserved entry is a symlink
- **THEN** the command exits unsuccessfully with a clear target error and does not change the target

### Requirement: Generated projects separate owned source and managed files

The generator SHALL produce typed root `lace.config.ts`, root pnpm workspace files, `.env.example`, Docker Compose infrastructure, and `.lace/manifest.json`, and SHALL produce user-owned `site/**` Astro source only in starter site mode. It SHALL offer an optional Cloudflare CMS Worker through `--cloudflare` in every site mode: a managed Worker entry `worker/index.ts`, a user-owned Worker configuration `worker/wrangler.jsonc`, and a managed local variables example `worker/.dev.vars.example`; in starter and existing-site modes it SHALL also add the managed static-site Pages workflow. It SHALL NOT generate a root Pages `wrangler.jsonc`. The generated project SHALL reference the Lace engine and admin as versioned dependencies or images and SHALL NOT contain editable engine or admin source. Templates and manifest SHALL contain no credentials, tokens, or usable secrets.

#### Scenario: Default project
- **WHEN** a user generates a project without optional flags in a non-interactive terminal
- **THEN** the project has editable site/configuration and managed Node/VPS workspace and deployment files, with no Cloudflare Worker files or workflow

#### Scenario: Cloudflare project
- **WHEN** a user generates a starter project with `--cloudflare`
- **THEN** `worker/index.ts`, `worker/.dev.vars.example` and the Pages workflow are classified as managed, `worker/wrangler.jsonc` is classified as user-owned without a digest, and no root `wrangler.jsonc` exists

#### Scenario: Cloudflare project without a site
- **WHEN** a user generates a project with `--no-site --cloudflare`
- **THEN** the Worker files are present, no Pages workflow and no `site/` directory exist, and the Worker configuration declares no build-site identity

#### Scenario: Project without a site
- **WHEN** a user generates a project with `--no-site`
- **THEN** no `site/` directory exists and the manifest lists no `site/` path

### Requirement: Ownership metadata is deterministic and verifiable

The manifest SHALL identify its schema and template version, record the site mode and path as `site: { mode, path }` (`starter` with `site`, `existing` with the relative site path, or `none` with `null`), and classify every generated template file as `user` or `managed`. It SHALL record the lowercase SHA-256 digest of the exact bytes of each managed file and SHALL record no digest for user-owned files. The manifest itself is metadata and SHALL NOT hash itself. For the same template version, site mode, path, and options, generated managed-file bytes and manifest contents SHALL be stable apart from project-name substitutions specified by the template.

#### Scenario: Ownership audit
- **WHEN** a project is generated and each managed file is hashed
- **THEN** every digest matches the manifest and no user-owned file has a digest

#### Scenario: Repeat generation
- **WHEN** the generator creates two projects with the same name, site mode, path, and options in different parents
- **THEN** their generated file bytes and manifests are identical

### Requirement: Generation preserves the target on failure

The generator SHALL stage a complete project in a sibling temporary directory before publishing it. For an allowed existing directory, it SHALL preserve the original entries and restore the original directory if publishing fails. On any failure, it SHALL report the error and any remaining staging or backup path with cleanup or recovery instructions. A failed command SHALL never claim success.

#### Scenario: Staging failure
- **WHEN** a template write fails before publication
- **THEN** the original target is unchanged and no partial generated tree appears there

#### Scenario: Publish failure for init
- **WHEN** publication of a staged `init .` project fails after the original is moved aside
- **THEN** the original directory is restored or the command identifies the exact backup path and recovery action

### Requirement: Root README is user-owned and existing introductions are preserved

Fresh generated projects SHALL contain a root `README.md` classified as user-owned without a digest in the ownership manifest. When an allowed target already contains a regular `README.md`, generation SHALL preserve its exact bytes and classify that path as user-owned, without replacing or appending text. Successful CLI output SHALL direct fresh consumers to README and name the generated scenario guides and `docs/lace-operations.md`; when preserving a README, output SHALL explicitly identify the preserved file, the scenario guide paths, the operations reference and manual incorporation of Lace instructions. A project generated in a `cms/` directory SHALL place these files inside that installation root. The same rules SHALL apply with and without `--cloudflare`, retaining existing staged-publication and failure-recovery guarantees.

#### Scenario: Fresh root quickstart
- **WHEN** a consumer generates a fresh project in `cms/`
- **THEN** `cms/README.md` contains the Lace requirements and scenario guide links, its manifest entry has user ownership without a digest, and CLI output points to README, the scenario guides and the operations guide

#### Scenario: Existing README including arbitrary bytes
- **WHEN** `init .` succeeds in an allowed target containing a regular README
- **THEN** every original README byte remains unchanged, its manifest entry is user-owned, and CLI output directs the consumer to the scenario guides, the operations guide and manual incorporation

#### Scenario: Failure while preserving an introduction
- **WHEN** staged generation or publication fails in an allowed target with README
- **THEN** the original README and other allowed entries remain unchanged or existing recovery diagnostics identify the original backup, and the command does not claim successful setup

#### Scenario: Cloudflare ownership parity
- **WHEN** a project is generated with `--cloudflare` and an allowed existing README
- **THEN** the README preservation, ownership and fallback match the default variant, and output also names the Cloudflare guide

### Requirement: Generated deployment declares an explicit build site
Generated Compose and `.env.example` SHALL explicitly select the generated installation root, `site` project, root frozen lockfile, `dist` static output and safe default site identity. The bind mount SHALL remain read-only and SHALL reject missing source rather than create directories. API and builder SHALL receive identity from the same deployment inputs. Operators SHALL be able to select an existing standalone Astro root or a workspace Astro package alongside a separately generated CMS directory by changing deployment configuration, without regenerating or overwriting user source. The generator's empty-target rule SHALL remain unchanged.

#### Scenario: Default generated deployment
- **WHEN** an operator starts a compatible generated Compose stack without source overrides
- **THEN** it selects the generated `site` with the declared default identity and fixed release storage

#### Scenario: CMS is beside existing Astro source
- **WHEN** an operator configures the documented parent-root mount and explicit project selection from `cms/`
- **THEN** builder source resolves inside `/source` and API/admin receive the same safe identity without mounting host credentials

### Requirement: Project creation selects an explicit site mode
The generator SHALL accept at most one of `--starter`, `--existing-site <path>`, and `--no-site`; a second mode flag or a missing path SHALL be a usage error (exit 2) before any filesystem change. `--cloudflare` SHALL be accepted with every mode. An explicit flag SHALL always win. Without a mode flag, when both standard input and standard output are terminals, the generator SHALL ask for the mode and, for existing-site mode, the path; the default answer SHALL be existing site at `..` when the target's parent directory contains `astro.config.*` and a `package.json` declaring `astro` as a dependency or dev dependency, otherwise starter. Without a terminal and without a flag, the generator SHALL use starter mode and print the flags for the other modes. `init .` SHALL keep the empty-target rule in every mode.

#### Scenario: Non-interactive default
- **WHEN** `create-lace my-site` runs without a terminal and without a mode flag
- **THEN** starter mode is used and the output names `--existing-site <path>` and `--no-site`

#### Scenario: Interactive default with a detected Astro parent
- **WHEN** `create-lace cms` runs in a terminal inside an Astro project and the operator accepts the defaults
- **THEN** the project is generated in existing-site mode with path `..`

#### Scenario: Interactive default without an Astro parent
- **WHEN** `create-lace my-site` runs in a terminal in a directory that is not an Astro project and the operator accepts the default
- **THEN** starter mode is used

#### Scenario: Conflicting flags
- **WHEN** `create-lace cms --no-site --existing-site ..` runs
- **THEN** the generator prints usage, exits with code 2, and creates nothing

#### Scenario: Headless Cloudflare CMS
- **WHEN** `create-lace cms --no-site --cloudflare` runs, or the interactive answer is no site with `--cloudflare`
- **THEN** generation succeeds in no-site mode with the Cloudflare Worker files

### Requirement: Existing-site paths are validated and never modified
In existing-site mode the path SHALL be a relative POSIX path of segments containing only ASCII letters, digits, `.`, `_`, and `-`, with no empty segment, no `.`-only segment other than `..`, no segment starting with `-`, and no backslash, control character, or absolute prefix. It SHALL resolve outside the generated target, to an existing directory reached without symbolic links, containing `astro.config.*` and a `package.json` that declares `astro`. Otherwise generation SHALL fail before writing. The generator SHALL never write, move, or delete anything in the existing site.

#### Scenario: Path inside the target or escaping into a symlink
- **WHEN** `--existing-site site` or a path through a symbolic link is given
- **THEN** generation fails with an error naming the rule and the target is unchanged

#### Scenario: Directory is not an Astro project
- **WHEN** `--existing-site ..` points to a directory without an Astro config
- **THEN** generation fails and states that an Astro project root is required

#### Scenario: Existing site untouched
- **WHEN** a project is generated with `--existing-site ..`
- **THEN** every file in the parent site outside the generated target is byte-identical before and after generation

### Requirement: Managed files are rendered from the site mode
The generator SHALL render managed files from the site mode and path using the build-site variables of the generated deployment and SHALL NOT introduce a second site-selection mechanism. In starter mode managed files SHALL equal the starter layout. In existing-site mode `pnpm-workspace.yaml` SHALL list no packages, root `dev` and `build` scripts SHALL run `astro dev` and `astro build` in the site path and no `typecheck` script SHALL exist, `.env.example` and Compose SHALL default to source root `<path>`, site directory `.`, and output `dist`, and the Cloudflare Pages workflow SHALL install, build and deploy the site at `<path>`. In no-site mode `pnpm-workspace.yaml` SHALL list no packages, no `dev`, `build`, or `typecheck` script SHALL exist, `.env.example` SHALL contain no build-source or build-site identity settings, and Compose SHALL contain no builder service, no builder URL, secret, or dependency for the dispatcher, and no build-site identity for the API, so build requests fail with the existing trigger-unavailable reason and Admin shows an unconfigured site. README and the operations guide SHALL describe the project's own mode and path.

Managed files SHALL additionally be rendered from the Cloudflare selection. With `--cloudflare`, the root `package.json` SHALL depend directly on the release's Cloudflare platform and database packages and SHALL contain local-only `cf:*` scripts for Worker variable preparation, local migration, synchronization, bootstrap, development and an account-free bundle check; `.env.example` SHALL default the local Cloudflare operator target to the generated Worker configuration, the shared local state directory and the configuration's placeholder D1 ID; README and the operations guide SHALL describe the generated Worker. Without `--cloudflare` these dependencies, scripts and Worker sections SHALL be absent and the Cloudflare operator settings SHALL remain empty. The Cloudflare selection SHALL NOT be a second site-selection mechanism.

#### Scenario: Existing-site managed files
- **WHEN** a project is generated with `--existing-site ..`
- **THEN** its Compose builder defaults mount `..`, select `.` and `dist`, root scripts run Astro in `..`, and the workspace lists no packages

#### Scenario: No-site Compose
- **WHEN** a project is generated with `--no-site`
- **THEN** its Compose file defines no `builder` service and the dispatcher configures no builder

#### Scenario: Cloudflare-rendered managed files
- **WHEN** the same site mode is generated with and without `--cloudflare`
- **THEN** only the Cloudflare variant's root `package.json`, `.env.example`, README and operations guide contain the Worker dependencies, `cf:*` scripts, local Cloudflare defaults and Worker guidance

#### Scenario: Snapshot per mode
- **WHEN** the generator runs twice per mode and Cloudflare selection with the same options
- **THEN** each variant's tree and manifest match its committed snapshot

### Requirement: Generator output names the next steps for the mode
After generation the generator SHALL print the selected mode and path. For existing-site mode it SHALL direct the operator to run `pnpm exec lace add block --all --site <path>` after installation and to follow `docs/lace-astro-site.md`; for no-site mode it SHALL point to the same guide for a later connection; for starter mode it SHALL keep the existing next steps. With `--cloudflare` it SHALL additionally direct the operator to the Cloudflare Worker section of `docs/lace-operations.md`.

#### Scenario: Existing-site next steps
- **WHEN** generation with `--existing-site ..` succeeds
- **THEN** the output contains `pnpm exec lace add block --all --site ..` and `docs/lace-astro-site.md`

#### Scenario: Cloudflare next steps
- **WHEN** generation with `--cloudflare` succeeds
- **THEN** the output names the Cloudflare Worker section of `docs/lace-operations.md`

### Requirement: The starter project delivers a configured site
The generated `lace.config.ts` SHALL register every built-in block, SHALL declare a `home` page and a `posts` collection that allow every built-in block, SHALL enable SEO with `seo: true` on `home` and `seo: { description: "summary" }` on `posts`, SHALL declare a `settings` global labelled "Site settings" with a required text field `siteName` and optional `tagline`, `description` (textarea) and `image` (media) fields whose `seoDefaults` map `siteName`, `description` and `image`, and SHALL declare a `navigation` global labelled "Navigation" with no fields that allows only the `navigation` block. In starter mode the user-owned site SHALL contain:

- the adapter loader `src/lib/lace.ts`, the block map `src/lace/blocks.ts`, `lace.site.json` and one component per built-in block under `src/components/lace/`, byte-identical to the current registry revisions and recorded in `lace.site.json`, and no site-local loader, rendering or rich-text helper files;
- a base layout that renders the adapter's SEO head component from `site.seo(entry)`, a header from the published `settings` global with static fallbacks while it is unpublished, and the published `navigation` global's blocks with a fallback link to the home page while it is unpublished;
- a post route rendered with `og:type` `article` and `sitemap.xml` and `robots.txt` endpoints built with the adapter's helpers;
- a `package.json` that declares `sharp` at the version Astro's image service uses, and an `astro.config.mjs` that reads the project `.env` when present, overlays the process environment and passes `laceImageConfig` of that environment as the Astro `image` configuration;
- a stylesheet with the gallery grid, navigation layout, lightbox and image link focus rules, and `public/_headers` applying `Cache-Control: public, max-age=2592000, immutable` to `/_astro/*`.

Every generated file SHALL appear in the ownership inventory, and the site files SHALL be user-owned.

#### Scenario: A new starter project is generated
- **WHEN** a starter project is generated
- **THEN** its configuration registers every built-in block and declares the `settings` and `navigation` globals, its site holds one registry component per built-in block with a matching lock and block map, and its layout renders the SEO head, the settings header and the navigation global with fallbacks

#### Scenario: Starter components follow the registry
- **WHEN** a starter project's block components are compared with the current registry items
- **THEN** they are byte-identical and `lace.site.json` records the same revisions

#### Scenario: Existing-site and no-site projects
- **WHEN** a project is generated with `--existing-site <path>` or `--no-site`
- **THEN** no site file is written and the configuration declares the same models and globals as the starter

### Requirement: Generated deployment files carry proxy, caching, build and email settings
The managed web proxy SHALL serve site responses with `Cache-Control: no-cache`, SHALL allow media uploads up to the documented multipart limit while other requests keep the smaller JSON body limit, SHALL apply the 30-day immutable cache rule to `/_astro/` and SHALL refuse `/_headers`. In starter and existing-site modes the managed Compose file SHALL mount a builder cache volume on the builder and declare it; in no-site mode it SHALL declare neither. The Compose builder service and the managed Cloudflare Pages workflow SHALL pass the optional `LACE_BUILD_SITE_URL` and `LACE_SITE_INDEXING` settings to the site build, and the Pages workflow SHALL restore and save the site's Astro cache directory between runs. The managed `.env.example` SHALL document both build settings, their defaults and their effect on canonical URLs, the sitemap and robots output, and SHALL document the optional email settings with the provider unset. The Compose file SHALL pass the email settings to the API with empty defaults, so an unconfigured project starts with email delivery reported as not configured. For `--cloudflare` projects the managed `worker/.dev.vars.example` SHALL default local development to the `log` email provider, and a newly generated user-owned `worker/wrangler.jsonc` SHALL contain a commented, optional `send_email` binding example.

#### Scenario: Starter deployment files
- **WHEN** a starter project is generated
- **THEN** its proxy carries the no-cache, upload-limit, `/_astro/` cache and `/_headers` rules, its Compose builder mounts the cache volume and receives both build settings, and its `.env.example` documents the build and email settings

#### Scenario: A no-site project is generated
- **WHEN** a project without a site is generated
- **THEN** its proxy carries the cache rule and its Compose file has no builder and no builder cache volume

#### Scenario: Project starts without email settings
- **WHEN** a project is generated and started with an `.env` copied from `.env.example`
- **THEN** the API starts with email delivery reported as not configured

### Requirement: Cloudflare operator credentials stay in a private file
Cloudflare generation SHALL deliver managed `docs/cloudflare-operator.env.example` with credential-free placeholders for account ID, D1 ID, token and Worker configuration. The private runtime copy `.lace/cloudflare-operator.env` SHALL be ignored and user-owned, absent from the managed upgrade inventory and never generated with a usable token. Generated `.env.example` SHALL NOT invite storing the remote token in root dotenv; local Cloudflare configuration SHALL remain available. Generation without Cloudflare SHALL deliver no operator example and no remote credential placeholders encouraging implicit Wrangler loading. Generated `cf:*` scripts SHALL remain local-only.

#### Scenario: Fresh Cloudflare project
- **WHEN** generation runs with Cloudflare in any site mode
- **THEN** the example is credential-free, classified and hashed, the runtime copy is ignored, and local `cf:*` scripts select only simulated resources

#### Scenario: Non-Cloudflare generation
- **WHEN** generation runs without Cloudflare
- **THEN** no private operator example is delivered and local generation remains account-free

### Requirement: Template upgrades preserve user-owned files
A template upgrade SHALL change only managed files, through the existing plan/apply procedure with deterministic managed hashes. A modified managed file, or a user file at a new managed path, SHALL be reported as a conflict and apply SHALL write nothing. An upgrade SHALL keep the project's recorded site mode and SHALL never create, change or delete files under the site, `lace.config.ts`, README, `.env`, `.env.local`, `.lace/cloudflare-operator.env` or `worker/wrangler.jsonc`; changing site mode requires generating a fresh project and moving configuration manually. Upgrade instructions SHALL state the manual steps for user-owned files and SHALL NOT create, change or deploy remote resources.

#### Scenario: Upgrade with unmodified managed files
- **WHEN** a project with unmodified managed files and edited user files is upgraded to the current template generated with the same site mode and Cloudflare selection
- **THEN** managed files equal the new template, user-owned bytes are unchanged and a following plan reports no changes

#### Scenario: Modified managed file or occupied managed path
- **WHEN** a managed file was edited by the operator or a user file occupies a new managed path
- **THEN** the plan reports the conflict and apply changes nothing

### Requirement: Generated project starts the release's packaged runtimes

The generated project SHALL include documented commands to run its Node development API and Astro site with its own `lace.config.ts`, and a Docker Compose production configuration that uses the release's exact versioned API and builder image references by default and supplies the generated configuration to the API. Generated package dependencies SHALL select exact compatible release package versions without development placeholders or local acceptance substitutions. Operators SHALL be able to override image references explicitly. The default template SHALL identify the release and its installation channel and SHALL explain that these coordinates become downloadable only after owner publication. The project SHALL keep editable admin and engine source outside its tree and SHALL require no consumer build of the Lace API or builder images.

#### Scenario: Generated Node development
- **WHEN** a user installs the generated project and runs its documented Node development command after setting required local values
- **THEN** the API loads that project's `lace.config.ts` and serves its API without importing the Lace source workspace

#### Scenario: Generated Compose deployment
- **WHEN** the matching release has been published and a user supplies required secrets to the generated Compose configuration
- **THEN** default matching API and builder image references start services using the generated project's configuration and persistent data without copying engine or admin source into the project

#### Scenario: Explicit image override
- **WHEN** an operator supplies compatible API and builder image overrides
- **THEN** Compose uses those references while preserving generated configuration mounts and persistence behavior

#### Scenario: Unpublished release preparation
- **WHEN** a contributor generates a project before the prepared release set is published
- **THEN** the guide identifies its exact release coordinates and publication prerequisite without claiming registry availability or directing ordinary consumers to manual tarball substitutions

### Requirement: Upgrade instructions start at the latest published template
The generated `.lace/upgrade-instructions.json` SHALL describe only the
database and configuration steps from the latest published template to the
current template, and SHALL NOT keep entries for upgrades from older
templates. Its database steps SHALL state that a database created by the
latest published release already starts from the baseline migration and is
upgraded by applying forward migrations with `lace db migrate`, without
recreation, and that a database created before rc2 predates the baseline, is
refused and is not supported. The generated operations guide SHALL describe the baseline
migration and SHALL NOT name numbered migrations that are no longer checked
in.

#### Scenario: Latest published template project reads the next template's instructions
- **WHEN** an operator plans an upgrade of a project on the latest published template (rc2, template `0.47.0`)
  to the current template
- **THEN** the upgrade guidance names forward migration with `lace db migrate`
  without database recreation and the current template's configuration step,
  and no step for an older template

#### Scenario: Generated operations guide names only checked-in migrations
- **WHEN** a project is generated in any site mode
- **THEN** its operations guide mentions the baseline migration and no
  migration file that is not checked in

### Requirement: Delivered guides describe the current and supported releases
The generator SHALL deliver as managed, classified and hashed files the operations guide, the Astro site guide, the MCP guide and the scenario guides: both Compose guides in every site mode and the Cloudflare guide only with `--cloudflare`; mode and Cloudflare rendering SHALL omit absent-file links and unavailable scripts. Generator completion output SHALL link to the scenario entry points. The guides and the user-owned README SHALL direct operators to `lace add block` for installing, updating and scaffolding block components. The Compose guides SHALL instruct operators to stop the `api` and `dispatcher` services before a host command that opens the SQLite database and to start them again afterwards. The Cloudflare guide SHALL document the local consumer journey, local and remote doctor, recovery and the deploy-hook provider prerequisite. The guides SHALL explain email provider selection, the Workers Paid requirement and sending-domain onboarding for the Cloudflare provider, the Resend option, SMTP transport security, the Settings test action and setting secrets with the runtime's secret mechanism. The Astro site guide SHALL document `site.global()` and its fallback pattern, `site.seo()`, `site.url`, `<LaceSeo>`, the sitemap and robots helpers, the `anchor`, `className` and typed `settings` block props, every built-in block, image variants, placeholders, the lightbox and link precedence; the operations guide SHALL describe the styling contract, the asset cache lifetime, the builder cache and how to reset it, and the Pages workflow cache.

The guides SHALL describe the current release and upgrades from the oldest supported release only. They SHALL NOT describe the behavior or upgrade steps of releases older than rc2 or name database migrations that are not checked in.

#### Scenario: Deterministic delivered guide variants
- **WHEN** generation runs twice for each of the three site modes with and without Cloudflare
- **THEN** trees, managed guide hashes and manifests match the reviewed snapshots for that variant

#### Scenario: Host database command while the Compose stack runs
- **WHEN** an operator follows a generated Compose guide to sync configuration or re-issue a setup token after starting the Compose API
- **THEN** the guide directs them to stop `api` and `dispatcher`, run the host command, and start the services again

#### Scenario: No unsupported release history in delivered guides
- **WHEN** a project is generated in any site mode, with or without `--cloudflare`
- **THEN** its guides and README name no alpha release, no rc1 upgrade, no template older than rc2 and no removed migration
