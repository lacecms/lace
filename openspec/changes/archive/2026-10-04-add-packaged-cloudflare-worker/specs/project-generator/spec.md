## MODIFIED Requirements

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

## ADDED Requirements

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
