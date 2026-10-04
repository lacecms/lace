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

The generator SHALL produce user-owned `site/**` Astro source and typed root `lace.config.ts`, root pnpm workspace files, `.env.example`, Docker Compose infrastructure, and `.lace/manifest.json`. It SHALL offer optional Cloudflare configuration and workflow files through `--cloudflare`. The generated project SHALL reference the Lace engine and admin as versioned dependencies or images and SHALL NOT contain editable engine or admin source. Templates and manifest SHALL contain no credentials, tokens, or usable secrets.

#### Scenario: Default project
- **WHEN** a user generates a project without optional flags
- **THEN** the project has editable site/configuration and managed Node/VPS workspace and deployment files, with no Cloudflare workflow

#### Scenario: Cloudflare project
- **WHEN** a user generates a project with `--cloudflare`
- **THEN** Cloudflare config and workflow files are present and classified as managed

### Requirement: Ownership metadata is deterministic and verifiable

The manifest SHALL identify its schema and template version and classify every generated template file as `user` or `managed`. It SHALL record the lowercase SHA-256 digest of the exact bytes of each managed file and SHALL record no digest for user-owned files. The manifest itself is metadata and SHALL NOT hash itself. For the same template version and options, generated managed-file bytes and manifest contents SHALL be stable apart from project-name substitutions specified by the template.

#### Scenario: Ownership audit
- **WHEN** a project is generated and each managed file is hashed
- **THEN** every digest matches the manifest and no user-owned file has a digest

#### Scenario: Repeat generation
- **WHEN** the generator creates two projects with the same name and options in different parents
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

Fresh generated projects SHALL contain a root `README.md` classified as user-owned without a digest in the ownership manifest. When an allowed target already contains a regular `README.md`, generation SHALL preserve its exact bytes and classify that path as user-owned, without replacing or appending text. Successful CLI output SHALL direct fresh consumers to README and identify `docs/lace-operations.md`; when preserving a README, output SHALL explicitly identify the preserved file, the operations fallback and manual incorporation of Lace instructions. A project generated in a `cms/` directory SHALL place these files inside that installation root. The same rules SHALL apply with and without `--cloudflare`, retaining existing staged-publication and failure-recovery guarantees.

#### Scenario: Fresh root quickstart
- **WHEN** a consumer generates a fresh project in `cms/`
- **THEN** `cms/README.md` contains Lace setup instructions, its manifest entry has user ownership without a digest, and CLI output points to README and the operations guide

#### Scenario: Existing README including arbitrary bytes
- **WHEN** `init .` succeeds in an allowed target containing a regular README
- **THEN** every original README byte remains unchanged, its manifest entry is user-owned, and CLI output directs the consumer to the operations guide and manual incorporation

#### Scenario: Failure while preserving an introduction
- **WHEN** staged generation or publication fails in an allowed target with README
- **THEN** the original README and other allowed entries remain unchanged or existing recovery diagnostics identify the original backup, and the command does not claim successful setup

#### Scenario: Cloudflare ownership parity
- **WHEN** a project is generated with `--cloudflare` and an allowed existing README
- **THEN** the README preservation, ownership and fallback match the default variant

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
