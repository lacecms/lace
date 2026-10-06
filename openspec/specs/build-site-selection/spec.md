# build-site-selection Specification

## Purpose

Defines explicit selection of one operator-owned Astro source and safe presentation of the current build target without exposing deployment paths or granting browser configuration authority.

## Requirements

### Requirement: Deployment selects one accessible Astro project
The Node/VPS deployment SHALL select one installation root mounted read-only at `/source`, one Astro project directory relative to that root, the root's `pnpm-lock.yaml`, and one static output directory relative to the selected project. The project directory SHALL permit `.` for standalone projects; the output SHALL be a nonempty descendant directory. Workspace roots SHALL include `pnpm-workspace.yaml`; standalone roots SHALL NOT require it. The generated default SHALL follow the project's site mode: starter mode SHALL explicitly select root `.`, project `site`, and output `dist`; existing-site mode SHALL explicitly select the recorded site path as root, project `.`, and output `dist`; no-site mode SHALL configure no builder. Reference deployment SHALL explicitly select `apps/site` and `dist`. Selection SHALL use deployment configuration only and SHALL NOT infer the intended site from other projects present in the mount. Host mount paths SHALL be resolved by Compose and SHALL NOT be interpreted as container paths. Served releases SHALL remain in the fixed `/output` volume.

#### Scenario: Generated source is selected explicitly
- **WHEN** a starter project uses its default selection
- **THEN** its root lockfile is installed and its `site` Astro project supplies the static release

#### Scenario: Existing standalone site with a CMS subdirectory
- **WHEN** a project generated with `--existing-site ..` uses its default selection
- **THEN** the parent standalone root lockfile and root Astro project are used without requiring a workspace file, and no example site exists in the CMS directory

#### Scenario: Existing workspace site
- **WHEN** the operator mounts a pnpm workspace root and selects a declared Astro package within it
- **THEN** frozen installation uses that root lockfile and workspace dependencies and the selected package alone is the Astro build target

#### Scenario: Host source is unavailable inside the builder
- **WHEN** the configured bind source is missing, inaccessible or does not expose the selected package and root lockfile
- **THEN** deployment or build fails safely without creating an empty replacement source directory, choosing the example, or replacing the current release

#### Scenario: Headless project
- **WHEN** a project generated with `--no-site` publishes content
- **THEN** no builder runs, the build fails with the trigger-unavailable reason, and the current site identity is unconfigured

### Requirement: Source selection is contained and validated
Selections SHALL reject absolute project/output paths, traversal, empty segments, backslashes, control characters, option-like segments and symbolic-link components. Required source files SHALL be regular files and the selected package SHALL declare Astro as a direct dependency or dev dependency. Configured output SHALL not overlap source/configuration files, installation root, scratch or release storage. Existing generated artifacts, dependency directories, credentials, environment files, Git data and CMS database data SHALL remain excluded from the disposable source copy. The exact installation-root `AGENTS.md` and `CLAUDE.md` entries SHALL also be excluded without following links; other included links SHALL be rejected. Selection failures SHALL expose fixed safe codes rather than configured paths or raw errors. The only path exception SHALL be a validated, bounded installation-relative entry path identifying a source failure under the builder diagnostic contract; host/container absolute paths, configured mount roots and link targets SHALL never be exposed.

#### Scenario: Invalid selection or linked source
- **WHEN** project/output selection escapes the root, starts with an option, resolves through a symlink, or selects a non-Astro package
- **THEN** the build rejects source before running tools and returns only sanitized failure information, using `source_symlink` for a linked component and otherwise the applicable source reason

#### Scenario: Output from an earlier build exists in source
- **WHEN** the selected source contains its configured output directory, environment files, dependencies or CMS database files
- **THEN** those files are excluded and a fresh build must produce its own complete static output

#### Scenario: Workspace includes root service documents
- **WHEN** a workspace root includes `CLAUDE.md -> AGENTS.md` alongside a declared Astro package
- **THEN** the root service documents are excluded, the selected package remains the sole build target, and no link target is copied

#### Scenario: Missing required workspace input
- **WHEN** a workspace selection lacks root `pnpm-workspace.yaml` or root `pnpm-lock.yaml`
- **THEN** the builder returns `source_missing` with the safe relative filename and leaves the current release intact

### Requirement: Current site identity is read-only and safe
The shared REST contract SHALL provide `GET /api/v1/admin/build-site` returning exactly `{ site: { id, label } | null }`. `id` SHALL be 1–64 lowercase ASCII kebab-case characters and `label` SHALL be 1–80 ASCII letters, digits, spaces, hyphens or underscores, beginning and ending with a letter or digit. This identity SHALL be supplied explicitly by deployment configuration, never derived from filesystem paths, URLs, package metadata or credentials. Missing identity SHALL return `null`; partial or malformed configuration SHALL fail startup with sanitized setting-name guidance. Node and Worker SHALL use the same contract. Callers SHALL require `content:read`; anonymous access SHALL fail with the existing authentication envelope. This endpoint SHALL accept no configuration mutations and return no source/output/lockfile paths or build credentials.

#### Scenario: Authenticated roles read the selected site
- **WHEN** an administrator, editor or viewer requests the current site
- **THEN** the response contains only its validated ID and label or `null`, without changing configuration or queue state

#### Scenario: Anonymous access or malformed identity
- **WHEN** an anonymous caller requests identity or startup receives a label containing a path or credential punctuation
- **THEN** anonymous access is rejected and malformed startup configuration is rejected without exposing its value

### Requirement: Admin identifies current configuration without rewriting history
Builds SHALL show the current configured site's label and ID for every authenticated role, including empty history. Administrator Settings SHALL show the same identity. Missing identity SHALL be presented as unconfigured; loading or failed identity reads SHALL be visible and retryable through the established session recovery flow. The presentation SHALL identify current configuration and SHALL NOT attribute historical build rows to it or claim successful deployment, accessible mounts or fresh content merely because identity is configured. Site selection SHALL remain an operator deployment task; no browser editor or second site SHALL be added. Existing history, request and retry permissions SHALL remain unchanged.

#### Scenario: Identity changes after older builds
- **WHEN** an operator changes the identity and restarts the deployment with existing build history
- **THEN** Builds shows the new current configuration separately from unchanged historical rows

#### Scenario: Identity cannot be read
- **WHEN** the identity request fails while build history remains available
- **THEN** history stays usable and the identity section shows an error and retry rather than an inferred site name
