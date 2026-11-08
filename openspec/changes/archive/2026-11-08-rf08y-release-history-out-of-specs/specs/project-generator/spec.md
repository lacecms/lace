## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Generated project starts its packaged runtimes
**Reason**: Its text and one scenario were written for alpha releases; the requirement is restated without release wording (owner decision 11).
**Migration**: Replaced by "Generated project starts the release's packaged runtimes", which keeps the same behavior.

### Requirement: Build-site template upgrades protect ownership
**Reason**: Describes the upgrade to template `0.7.0`, older than rc1 (owner decision 11).
**Migration**: Explicit build-site selection stays in "Generated deployment declares an explicit build site"; upgrade ownership is kept by "Template upgrades preserve user-owned files".

### Requirement: Publication-visibility template upgrade protects ownership
**Reason**: Describes the upgrade to template `0.8.0`, older than rc1 (owner decision 11).
**Migration**: The revalidating proxy is kept by "Generated deployment files carry proxy, caching, build and email settings"; upgrade ownership by "Template upgrades preserve user-owned files".

### Requirement: Rendering-core template upgrade protects ownership
**Reason**: Describes the upgrade to template `0.9.0`, older than rc1 (owner decision 11).
**Migration**: The adapter-based starter is kept by "The starter project delivers a configured site"; upgrade ownership by "Template upgrades preserve user-owned files".

### Requirement: Block-command template upgrade protects ownership
**Reason**: Describes the upgrade to template `0.10.0`, older than rc1 (owner decision 11).
**Migration**: `lace add block` guidance is kept by "Delivered guides describe the current release".

### Requirement: Site-mode template upgrade protects ownership
**Reason**: Describes the upgrade to template `0.11.0`, older than rc1 (owner decision 11).
**Migration**: Recorded site-mode handling is kept by "Template upgrades preserve user-owned files".

### Requirement: Cloudflare Worker template upgrade protects ownership
**Reason**: Describes the upgrade to template `0.12.0`, older than rc1 (owner decision 11).
**Migration**: Worker ownership is specified by "Generated projects separate owned source and managed files"; upgrade ownership by "Template upgrades preserve user-owned files".

### Requirement: Cloudflare journey template upgrade protects ownership
**Reason**: Describes the upgrade to template `0.13.0`, older than rc1 (owner decision 11).
**Migration**: Cloudflare journey guidance is kept by "Delivered guides describe the current release".

### Requirement: Next-alpha template upgrade protects ownership
**Reason**: Describes the upgrade to template `0.17.0` and alpha.3 coordinates (owner decision 11).
**Migration**: Coordinate matching stays in `alpha-release-artifacts`; the Compose maintenance window is kept by "Delivered guides describe the current release".

### Requirement: Cloudflare credential example and upgrade preserve ownership
**Reason**: Describes the upgrade to template `0.15.0`, older than rc1 (owner decision 11).
**Migration**: The credential example is kept by "Cloudflare operator credentials stay in a private file".

### Requirement: Scenario-guide template delivery protects ownership
**Reason**: Describes the upgrade to template `0.16.0`, older than rc1 (owner decision 11).
**Migration**: Scenario-guide delivery is kept by "Delivered guides describe the current release"; upgrade conflicts by "Template upgrades preserve user-owned files".

### Requirement: Template 0.21.0 delivers email delivery configuration
**Reason**: Describes the upgrade to template `0.21.0`, older than rc1 (owner decision 11).
**Migration**: Email settings are kept by "Generated deployment files carry proxy, caching, build and email settings" and "Delivered guides describe the current release".

### Requirement: Template 0.22.0 delivers account-lifecycle upgrade instructions
**Reason**: Contains only upgrade instructions for a migration that the baseline replaced (owner decision 11).
**Migration**: None; upgrade instructions are specified by "Upgrade instructions cover only the latest published template".

### Requirement: Template 0.23.0 delivers public delivery upgrade instructions
**Reason**: Contains only upgrade instructions for migrations and contract changes older than rc1 (owner decision 11).
**Migration**: None; the public contract is specified by `rest-contracts` and upgrade instructions by "Upgrade instructions cover only the latest published template".

### Requirement: Template 0.24.0 delivers global models and the starter settings global
**Reason**: Describes the upgrade to template `0.24.0`, older than rc1 (owner decision 11).
**Migration**: The `settings` global and its layout header are kept by "The starter project delivers a configured site".

### Requirement: Template 0.25.0 delivers site SEO output
**Reason**: Describes the upgrade to template `0.25.0`, older than rc1 (owner decision 11).
**Migration**: SEO configuration and output are kept by "The starter project delivers a configured site"; build settings by "Generated deployment files carry proxy, caching, build and email settings".

### Requirement: Template 0.26.0 delivers block envelope rendering
**Reason**: Describes the upgrade to template `0.26.0`, older than rc1 (owner decision 11).
**Migration**: Registry components and block prop guidance are kept by "The starter project delivers a configured site" and "Delivered guides describe the current release".

### Requirement: Template 0.27.0 delivers Gallery, Navigation and the navigation global
**Reason**: Describes the upgrade to template `0.27.0` with seven blocks at model version 2, both superseded (owner decision 11).
**Migration**: Built-in block registration and the navigation global are kept by "The starter project delivers a configured site".

### Requirement: Upload-limit template upgrade protects ownership
**Reason**: Describes the upgrade to template `0.31.0`, older than rc1 (owner decision 11).
**Migration**: Upload and body limits are kept by "Generated deployment files carry proxy, caching, build and email settings".

### Requirement: Template 0.32.0 delivers build-time image variants and the lightbox setting
**Reason**: Describes the upgrade to template `0.32.0`, older than rc1 (owner decision 11).
**Migration**: The image configuration and lightbox styles are kept by "The starter project delivers a configured site".

### Requirement: Template 0.33.0 delivers deploy caching
**Reason**: Describes the upgrade to template `0.33.0`, older than rc1 (owner decision 11).
**Migration**: Asset and build caching are kept by "Generated deployment files carry proxy, caching, build and email settings" and "The starter project delivers a configured site".

### Requirement: Template 0.34.0 delivers image links
**Reason**: Describes the upgrade to template `0.34.0`, older than rc1 (owner decision 11).
**Migration**: Image link components and styles are kept by "The starter project delivers a configured site".

## ADDED Requirements

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

### Requirement: Delivered guides describe the current release
The generator SHALL deliver as managed, classified and hashed files the operations guide, the Astro site guide, the MCP guide and the scenario guides: both Compose guides in every site mode and the Cloudflare guide only with `--cloudflare`; mode and Cloudflare rendering SHALL omit absent-file links and unavailable scripts. Generator completion output SHALL link to the scenario entry points. The guides and the user-owned README SHALL direct operators to `lace add block` for installing, updating and scaffolding block components. The Compose guides SHALL instruct operators to stop the `api` and `dispatcher` services before a host command that opens the SQLite database and to start them again afterwards. The Cloudflare guide SHALL document the local consumer journey, local and remote doctor, recovery and the deploy-hook provider prerequisite. The guides SHALL explain email provider selection, the Workers Paid requirement and sending-domain onboarding for the Cloudflare provider, the Resend option, SMTP transport security, the Settings test action and setting secrets with the runtime's secret mechanism. The Astro site guide SHALL document `site.global()` and its fallback pattern, `site.seo()`, `site.url`, `<LaceSeo>`, the sitemap and robots helpers, the `anchor`, `className` and typed `settings` block props, every built-in block, image variants, placeholders, the lightbox and link precedence; the operations guide SHALL describe the styling contract, the asset cache lifetime, the builder cache and how to reset it, and the Pages workflow cache.

The guides SHALL describe the current release and upgrades from the oldest supported release only. They SHALL NOT describe the behavior or upgrade steps of releases older than rc1 or name database migrations that are not checked in.

#### Scenario: Deterministic guide variants
- **WHEN** generation runs twice for each of the three site modes with and without Cloudflare
- **THEN** trees, managed guide hashes and manifests match the reviewed snapshots for that variant

#### Scenario: Host database command with the stack running
- **WHEN** an operator follows a generated Compose guide to sync configuration or re-issue a setup token after starting the Compose API
- **THEN** the guide directs them to stop `api` and `dispatcher`, run the host command, and start the services again

#### Scenario: No pre-rc1 history in delivered guides
- **WHEN** a project is generated in any site mode, with or without `--cloudflare`
- **THEN** its guides and README name no alpha release, no template older than rc1 and no removed migration

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
