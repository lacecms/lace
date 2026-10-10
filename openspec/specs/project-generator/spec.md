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

### Requirement: Generated project starts its packaged runtimes

The generated project SHALL include documented commands to run its Node development API and Astro site with its own `lace.config.ts`, and a Docker Compose production configuration that uses the release's exact versioned API and builder image references by default and supplies the generated configuration to the API. Generated package dependencies SHALL select exact compatible alpha package versions without development placeholders or local acceptance substitutions. Operators SHALL be able to override image references explicitly. The default alpha template SHALL identify the release and its installation channel and SHALL explain that these coordinates become downloadable only after owner publication. The project SHALL keep editable admin and engine source outside its tree and SHALL require no consumer build of the Lace API or builder images.

#### Scenario: Generated Node development
- **WHEN** a user installs the generated project and runs its documented Node development command after setting required local values
- **THEN** the API loads that project's `lace.config.ts` and serves its API without importing the Lace source workspace

#### Scenario: Generated Compose deployment
- **WHEN** the matching release has been published and a user supplies required secrets to the generated Compose configuration
- **THEN** default matching API and builder image references start services using the generated project's configuration and persistent data without copying engine or admin source into the project

#### Scenario: Explicit image override
- **WHEN** an operator supplies compatible API and builder image overrides
- **THEN** Compose uses those references while preserving generated configuration mounts and persistence behavior

#### Scenario: Unpublished alpha preparation
- **WHEN** a contributor generates a project before the prepared alpha set is published
- **THEN** the guide identifies its exact alpha coordinates and publication prerequisite without claiming registry availability or directing ordinary consumers to manual tarball substitutions

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

### Requirement: Build-site template upgrades protect ownership
The generator SHALL advance the managed template version to `0.7.0`, retain deterministic managed hashes, provide template upgrade instructions for source selection and identity, and preserve user-owned README, site source and `lace.config.ts`. Modified managed files SHALL retain existing conflict detection. Instructions SHALL require compatible new API/admin/builder/CLI artifacts and SHALL NOT claim this feature exists in previously published alpha images or publish replacement artifacts automatically.

#### Scenario: Operator has edited generated source and infrastructure
- **WHEN** a consumer reviews an upgrade to the explicit-selection template
- **THEN** source and README stay unchanged, modified managed infrastructure requires conflict review, and migration guidance explains artifact compatibility and selected mounts

### Requirement: Publication-visibility template upgrade protects ownership
The generator SHALL advance the managed template version to `0.8.0`, deliver a web proxy that serves site responses with `Cache-Control: no-cache`, deliver updated managed operations guidance and template upgrade instructions, and retain deterministic managed hashes and existing conflict detection. New projects SHALL receive the dev-revalidating user-owned site loader and slug-based post route. Upgrades SHALL preserve user-owned README, `lace.config.ts` and site source; instructions SHALL describe adopting dev revalidation manually and SHALL NOT require new API, admin, CLI or builder artifacts for the proxy and documentation changes.

#### Scenario: Upgrade from 0.7.0
- **WHEN** a consumer with unmodified 0.7.0 managed files applies the 0.8.0 template upgrade
- **THEN** the proxy and operations guide are updated, instructions mention the revalidating cache header and manual dev-loader adoption, and user README, configuration and site files are unchanged

#### Scenario: Edited proxy configuration
- **WHEN** the consumer has modified `deploy/nginx.conf`
- **THEN** the upgrade reports a managed-file conflict instead of overwriting it

### Requirement: Rendering-core template upgrade protects ownership
The generator SHALL advance the managed template version to `0.9.0` and generate the adapter-based starter: the user-owned loader file, pages, layout, styles, block map file, `lace.site.json`, and five registry block components, with site dependencies on the Lace adapter, render core, SDK, and content packages pinned to the release version. Every generated file SHALL appear in the ownership inventory; the starter SHALL contain no site-local loader, rendering, or rich-text helper files. It SHALL deliver the existing-site connection guide as a managed file, updated managed operations guidance, and template upgrade instructions that list explicit manual migration steps for an alpha project's user-owned `site/**`. Upgrades SHALL preserve user-owned README, `lace.config.ts` and site source and retain deterministic managed hashes and existing conflict detection.

#### Scenario: Fresh generation
- **WHEN** a project is generated with template `0.9.0`
- **THEN** its site contains `src/lib/lace.ts`, `src/lace/blocks.ts`, `lace.site.json`, and `src/components/lace/` with the five block components, and contains none of `src/lib/site-data.ts`, `src/lib/rendering.ts`, `src/lib/rich-text.ts`, or `src/components/BlockRenderer.astro`

#### Scenario: Upgrade from 0.8.0
- **WHEN** a consumer with unmodified 0.8.0 managed files applies the 0.9.0 template upgrade
- **THEN** managed guidance is updated, the connection guide is added, instructions describe the manual site migration, and every existing user-owned site file is unchanged and no new site file is written

### Requirement: Block-command template upgrade protects ownership
The generator SHALL advance the managed template version to `0.10.0`. The managed existing-site guide and operations guide and the user-owned generated README SHALL direct operators to `lace add block` for installing, updating, and scaffolding block components instead of copying files from a generated starter. The template upgrade instructions SHALL state that the upgrade changes only managed guidance and that no file under `site/` is changed, added, or deleted. Upgrades SHALL preserve user-owned README, `lace.config.ts` and site source and retain deterministic managed hashes and existing conflict detection.

#### Scenario: Fresh generation
- **WHEN** a project is generated with template `0.10.0`
- **THEN** its README and guides name `lace add block` and the starter site files are byte-identical to template `0.9.0`

#### Scenario: Upgrade from 0.9.0
- **WHEN** a consumer with unmodified 0.9.0 managed files applies the 0.10.0 template upgrade
- **THEN** the managed guides are updated and every user-owned file, including all of `site/`, is unchanged

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
The generator SHALL render managed files from the site mode and path using the Step 29 build-site variables and SHALL NOT introduce a second site-selection mechanism. In starter mode managed files SHALL equal the starter layout. In existing-site mode `pnpm-workspace.yaml` SHALL list no packages, root `dev` and `build` scripts SHALL run `astro dev` and `astro build` in the site path and no `typecheck` script SHALL exist, `.env.example` and Compose SHALL default to source root `<path>`, site directory `.`, and output `dist`, and the Cloudflare Pages workflow SHALL install, build and deploy the site at `<path>`. In no-site mode `pnpm-workspace.yaml` SHALL list no packages, no `dev`, `build`, or `typecheck` script SHALL exist, `.env.example` SHALL contain no build-source or build-site identity settings, and Compose SHALL contain no builder service, no builder URL, secret, or dependency for the dispatcher, and no build-site identity for the API, so build requests fail with the existing trigger-unavailable reason and Admin shows an unconfigured site. README and the operations guide SHALL describe the project's own mode and path.

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

### Requirement: Site-mode template upgrade protects ownership
The generator SHALL advance the managed template version to `0.11.0`. Template upgrade instructions SHALL state that upgrade keeps the project's recorded site mode, never creates, changes, or deletes `site/` files, that a project without a recorded mode is treated as starter mode, and that changing modes requires generating a fresh project and moving configuration manually. Upgrades SHALL preserve user-owned README, `lace.config.ts` and site source and retain deterministic managed hashes and existing conflict detection.

#### Scenario: Upgrade from a 0.10 starter project
- **WHEN** a starter project generated with template `0.10.0` and unmodified managed files applies the `0.11.0` upgrade from a starter-mode template
- **THEN** managed files are updated, the manifest records starter mode with path `site`, and every `site/` file is unchanged

### Requirement: Cloudflare Worker template upgrade protects ownership
The generator SHALL advance the managed template version to `0.12.0`. Template upgrade instructions SHALL state that the target template must be generated with the project's site mode and with `--cloudflare` exactly when the project has Cloudflare files; that the former root Pages `wrangler.jsonc` is removed when unmodified and conflicts when edited; that the managed Worker entry and local variables example are added; that the user-owned `worker/wrangler.jsonc` is never created or changed by upgrade and must be copied from a freshly generated project of the same release and completed with the operator's resource IDs and origin; and that no Cloudflare resource, secret or deployment is created or changed. Upgrades SHALL preserve user-owned README, `lace.config.ts`, site source and Worker configuration and retain deterministic managed hashes and existing conflict detection.

#### Scenario: Upgrade a 0.11 Cloudflare starter project
- **WHEN** a Cloudflare starter project generated with template `0.11.0` and unmodified managed files applies the `0.12.0` upgrade from a Cloudflare starter template
- **THEN** the root `wrangler.jsonc` is removed, `worker/index.ts` and `worker/.dev.vars.example` are added, the root package and environment example are replaced, `worker/wrangler.jsonc` is not created, and every `site/` file is unchanged

#### Scenario: Edited Pages configuration
- **WHEN** the 0.11 root `wrangler.jsonc` was edited before the upgrade
- **THEN** the plan reports a removal conflict and leaves the file and manifest unchanged

#### Scenario: Upgrade a 0.11 project without Cloudflare
- **WHEN** a project generated without `--cloudflare` applies the `0.12.0` upgrade from a template generated without `--cloudflare`
- **THEN** no Worker file is added and only changed managed guidance is replaced

### Requirement: Cloudflare journey template upgrade protects ownership
The generator SHALL advance the managed template version to `0.13.0`. The managed operations guide and the user-owned generated README of `--cloudflare` projects SHALL document the local Cloudflare consumer journey, local and remote doctor, recovery and the deploy-hook provider prerequisite. The template upgrade instructions SHALL state that the upgrade changes only managed guidance, creates or changes no Worker configuration, Cloudflare resource, secret or deployment, and that no file under `site/` is changed, added or deleted. Upgrades SHALL preserve user-owned README, `lace.config.ts`, site source and `worker/wrangler.jsonc` and retain deterministic managed hashes and existing conflict detection.

#### Scenario: Fresh Cloudflare generation
- **WHEN** a project is generated with `--cloudflare` and template `0.13.0`
- **THEN** its operations guide documents local doctor and recovery and the hook prerequisite, and its Worker and site files are byte-identical to template `0.12.0`

#### Scenario: Upgrade from 0.12.0
- **WHEN** a consumer with unmodified 0.12.0 managed files applies the 0.13.0 upgrade from a template of the same site mode and Cloudflare selection
- **THEN** only managed guidance is replaced and every user-owned file, including `worker/wrangler.jsonc` and all of `site/`, is unchanged

### Requirement: Next-alpha template upgrade protects ownership
The generator SHALL advance the managed template version to `0.17.0` and generate exact `0.1.0-alpha.3` Lace package dependencies, `ghcr.io/lacecms/api:0.1.0-alpha.3` and `ghcr.io/lacecms/builder:0.1.0-alpha.3` image defaults and `0.1.0-alpha.3` installation commands in its guides. Generated guides SHALL state which behavior requires these or later artifacts (the private Cloudflare operator file, `--operator-env`, `lace cloudflare preflight`, Pages deployment tracking and the seven-status build outcomes) and SHALL NOT claim that the published `0.1.0-alpha.1` or `0.1.0-alpha.2` artifacts contain it. The template upgrade instructions SHALL state that the upgrade replaces only managed files, that the operator updates the user-owned `.env` image references and, where present, the user-owned site's Lace dependency versions manually, and that no file under `site/`, `lace.config.ts`, README, `.env.local`, `.lace/cloudflare-operator.env` or `worker/wrangler.jsonc` is changed. Because `0.1.0-alpha.3` engines require database migration `0003_site_build_outcomes`, which `0.1.0-alpha.2` engines lack, the instructions SHALL list a database step for both Node SQLite and Cloudflare D1: back up the database, stop dispatch, apply the migration with the generated migration commands before the new engine serves traffic, and restore the backup to downgrade. The instructions for the `0.15.0` and `0.16.0` templates SHALL remain listed for upgrades from the published `0.14.0`. The managed operations guide and the generated development guide SHALL instruct operators of the Compose deployment to stop the `api` and `dispatcher` services before running a host command that opens the SQLite database and to start them again afterwards, explaining that concurrent host and container access through a VM-backed bind mount leaves the services with diverging views. Upgrades SHALL retain deterministic managed hashes and existing conflict detection.

#### Scenario: Fresh generation
- **WHEN** a project is generated with template `0.17.0` in any site mode, with or without `--cloudflare`
- **THEN** every generated Lace dependency, image default and guide installation command names `0.1.0-alpha.3` and the ownership manifest records template `0.17.0`

#### Scenario: Host database command with the stack running
- **WHEN** an operator follows the generated guide to sync configuration or re-issue a setup token after starting the Compose API
- **THEN** the guide directs them to stop `api` and `dispatcher`, run the host command, and start the services again

#### Scenario: Upgrade from 0.13.0
- **WHEN** a consumer with unmodified 0.13.0 managed files applies the current upgrade from a template of the same site mode and Cloudflare selection
- **THEN** managed files equal the new template and every user-owned file, including `.env`, README, `lace.config.ts`, `worker/wrangler.jsonc` and all of `site/`, is unchanged, with the manual version steps listed in the instructions

#### Scenario: Upgrade from the published 0.14.0
- **WHEN** a consumer with unmodified 0.14.0 managed files applies the 0.17.0 upgrade from a template of the same site mode and Cloudflare selection
- **THEN** managed files equal the new template, every user-owned file, including `.env`, README, `lace.config.ts`, `worker/wrangler.jsonc` and all of `site/`, is unchanged, and the plan lists the accumulated `0.15.0`–`0.17.0` instructions including the manual version steps and the database migration step

#### Scenario: Modified managed file
- **WHEN** a managed file of the 0.14.0 project was edited by the operator
- **THEN** the upgrade plan reports the conflict and apply changes nothing

### Requirement: Cloudflare credential example and upgrade preserve ownership
Cloudflare generation SHALL deliver managed `docs/cloudflare-operator.env.example` with credential-free placeholders for account ID, D1 ID, token and Worker configuration. The private runtime copy SHALL be ignored and user-owned, absent from managed upgrade inventory and never generated with a usable token. Generated `.env.example` SHALL no longer invite storing the remote token in root dotenv; local Cloudflare configuration SHALL remain available. Generation without Cloudflare SHALL deliver no operator example and no remote credential placeholders encouraging implicit Wrangler loading. Existing generated cf scripts SHALL remain local-only.

The ownership template SHALL advance to `0.15.0`, with coherent inventory, upgrade instructions, release template metadata and deterministic snapshots. Upgrades SHALL change only managed files through existing conflict review, and SHALL never move, remove or copy real credentials or modify README, `.env`, `.env.local`, the runtime operator file, lace.config.ts, Worker configuration or site source. Instructions SHALL explain creating the protected private file and moving/removing legacy assignments manually, requiring current CLI support before using the new option. Modified managed references and colliding managed-example destinations SHALL remain conflicts.

#### Scenario: Fresh Cloudflare project
- **WHEN** generation runs with Cloudflare in any site mode
- **THEN** the example is credential-free, classified and hashed, the runtime copy is ignored, and local cf scripts still select only simulated resources

#### Scenario: Non-Cloudflare generation
- **WHEN** generation runs without Cloudflare
- **THEN** no private operator example is delivered and local generation remains account-free

#### Scenario: Upgrade legacy project
- **WHEN** a 0.14.0 project containing legacy token assignments upgrades
- **THEN** managed instructions/example/ignore rules are updated, all private/user bytes are preserved and instructions require manual credential relocation

### Requirement: Scenario-guide template delivery protects ownership
The generator SHALL advance the ownership template to `0.16.0`, the next unused template version after the completed 33F template `0.15.0`, and record that same version in its manifest, upgrade instructions and current release definition. Every scenario guide SHALL be managed, classified in the deterministic file inventory and hashed. Both Compose guides SHALL be generated in every site mode; the Cloudflare guide SHALL be generated only with `--cloudflare`. Mode and Cloudflare rendering SHALL use the existing selection and omit absent-file links and unavailable scripts. Generator completion output SHALL link to the scenario entry points while retaining the existing site's block-install and connection next steps.

Upgrades from template `0.14.0` SHALL add new managed guides and replace unmodified managed references through the existing plan/apply procedure. Edited managed operations or guide files, and collisions at new managed guide paths, SHALL produce conflicts rather than overwrite operator bytes. Upgrade instructions SHALL give the new guide paths and explain that the user-owned README does not become the new entry README automatically. Upgrades SHALL preserve README, lace.config.ts, .env, Worker configuration and every site file byte-for-byte. Generation in a CMS directory SHALL never rewrite an existing site's root README; retained init README files SHALL be offered links through generator output. This change SHALL create no remote resource or deployment.

#### Scenario: Deterministic mode variants
- **WHEN** generation runs twice for each of the three site modes with and without Cloudflare
- **THEN** trees, managed guide hashes and manifests match the reviewed snapshots for that variant

#### Scenario: Upgrade from 0.14.0
- **WHEN** a template 0.14.0 project with unchanged managed files and customized user files applies a matching current template
- **THEN** new guides are installed, references are current, instructions name the new guides, user bytes are unchanged and a following plan has no changes

#### Scenario: Managed documentation or destination edited
- **WHEN** the old operations reference is edited or a user file occupies a new managed guide path
- **THEN** plan reports the conflict and apply preserves the files through existing conflict handling

#### Scenario: Existing-site README
- **WHEN** generation connects an existing Astro root from its CMS directory or init preserves an allowed README
- **THEN** existing README bytes remain unchanged and completion output offers the appropriate guide links

### Requirement: Template 0.21.0 delivers email delivery configuration
The generator SHALL advance the managed template version to `0.21.0`. The
following SHALL be updated:

- **Managed `.env.example`:** documents the optional email settings, with the
  provider unset (`none`).
- **Managed Compose file:** passes the email settings to the API service with
  empty defaults, so an unconfigured project starts unchanged.
- **Managed `worker/.dev.vars.example`** for `--cloudflare` projects: defaults
  local development to the `log` provider.
- **Newly generated user-owned `worker/wrangler.jsonc`:** contains a commented,
  optional `send_email` binding example.
- **Managed operations and scenario guides:** explain provider selection, the
  Workers Paid requirement and sending-domain onboarding for the Cloudflare
  provider, the free-tier Resend option, SMTP transport security, the Settings
  test action, and that secrets are set with the runtime's secret mechanism.

Template upgrade instructions SHALL state:

- email is optional;
- no database migration is added;
- API and admin artifacts must be deployed together, because the admin requires
  the session-summary endpoint;
- upgrade never edits `.env`, `.env.local`, `worker/wrangler.jsonc`, the README,
  `lace.config.ts`, or site files.

Upgrades SHALL preserve user-owned files and retain deterministic managed
hashes and existing conflict detection.

#### Scenario: Project is generated without email settings
- **WHEN** a project is generated and started with an `.env` copied from
  `.env.example`
- **THEN** the API starts with email delivery reported as not configured

#### Scenario: Existing project upgrades to 0.21.0
- **WHEN** a 0.20.0 project with unmodified managed files is upgraded
- **THEN** managed email guidance and environment examples are updated and its
  `.env` and `worker/wrangler.jsonc` are unchanged
