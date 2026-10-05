## MODIFIED Requirements

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
