## MODIFIED Requirements

### Requirement: Generated projects separate owned source and managed files

The generator SHALL produce typed root `lace.config.ts`, root pnpm workspace files, `.env.example`, Docker Compose infrastructure, and `.lace/manifest.json`, and SHALL produce user-owned `site/**` Astro source only in starter site mode. It SHALL offer optional Cloudflare configuration and workflow files through `--cloudflare` in starter and existing-site modes. The generated project SHALL reference the Lace engine and admin as versioned dependencies or images and SHALL NOT contain editable engine or admin source. Templates and manifest SHALL contain no credentials, tokens, or usable secrets.

#### Scenario: Default project
- **WHEN** a user generates a project without optional flags in a non-interactive terminal
- **THEN** the project has editable site/configuration and managed Node/VPS workspace and deployment files, with no Cloudflare workflow

#### Scenario: Cloudflare project
- **WHEN** a user generates a project with `--cloudflare`
- **THEN** Cloudflare config and workflow files are present and classified as managed

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

## ADDED Requirements

### Requirement: Project creation selects an explicit site mode
The generator SHALL accept at most one of `--starter`, `--existing-site <path>`, and `--no-site`; a second mode flag, a missing path, or `--no-site` with `--cloudflare` SHALL be a usage error (exit 2) before any filesystem change. An explicit flag SHALL always win. Without a mode flag, when both standard input and standard output are terminals, the generator SHALL ask for the mode and, for existing-site mode, the path; the default answer SHALL be existing site at `..` when the target's parent directory contains `astro.config.*` and a `package.json` declaring `astro` as a dependency or dev dependency, otherwise starter. Without a terminal and without a flag, the generator SHALL use starter mode and print the flags for the other modes. `init .` SHALL keep the empty-target rule in every mode.

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
The generator SHALL render managed files from the site mode and path using the Step 29 build-site variables and SHALL NOT introduce a second site-selection mechanism. In starter mode managed files SHALL equal the starter layout. In existing-site mode `pnpm-workspace.yaml` SHALL list no packages, root `dev` and `build` scripts SHALL run `astro dev` and `astro build` in the site path and no `typecheck` script SHALL exist, `.env.example` and Compose SHALL default to source root `<path>`, site directory `.`, and output `dist`, and the Cloudflare workflow and Pages config SHALL install and deploy the site at `<path>`. In no-site mode `pnpm-workspace.yaml` SHALL list no packages, no `dev`, `build`, or `typecheck` script SHALL exist, `.env.example` SHALL contain no build-source or build-site identity settings, and Compose SHALL contain no builder service, no builder URL, secret, or dependency for the dispatcher, and no build-site identity for the API, so build requests fail with the existing trigger-unavailable reason and Admin shows an unconfigured site. README and the operations guide SHALL describe the project's own mode and path.

#### Scenario: Existing-site managed files
- **WHEN** a project is generated with `--existing-site ..`
- **THEN** its Compose builder defaults mount `..`, select `.` and `dist`, root scripts run Astro in `..`, and the workspace lists no packages

#### Scenario: No-site Compose
- **WHEN** a project is generated with `--no-site`
- **THEN** its Compose file defines no `builder` service and the dispatcher configures no builder

#### Scenario: Snapshot per mode
- **WHEN** the generator runs twice per mode with the same options
- **THEN** each mode's tree and manifest match its committed snapshot

### Requirement: Generator output names the next steps for the mode
After generation the generator SHALL print the selected mode and path. For existing-site mode it SHALL direct the operator to run `pnpm exec lace add block --all --site <path>` after installation and to follow `docs/lace-astro-site.md`; for no-site mode it SHALL point to the same guide for a later connection; for starter mode it SHALL keep the existing next steps.

#### Scenario: Existing-site next steps
- **WHEN** generation with `--existing-site ..` succeeds
- **THEN** the output contains `pnpm exec lace add block --all --site ..` and `docs/lace-astro-site.md`

### Requirement: Site-mode template upgrade protects ownership
The generator SHALL advance the managed template version to `0.11.0`. Template upgrade instructions SHALL state that upgrade keeps the project's recorded site mode, never creates, changes, or deletes `site/` files, that a project without a recorded mode is treated as starter mode, and that changing modes requires generating a fresh project and moving configuration manually. Upgrades SHALL preserve user-owned README, `lace.config.ts` and site source and retain deterministic managed hashes and existing conflict detection.

#### Scenario: Upgrade from a 0.10 starter project
- **WHEN** a starter project generated with template `0.10.0` and unmodified managed files applies the `0.11.0` upgrade from a starter-mode template
- **THEN** managed files are updated, the manifest records starter mode with path `site`, and every `site/` file is unchanged
