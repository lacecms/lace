## ADDED Requirements

### Requirement: Disposable source copy excludes service documents and rejects other links
The builder SHALL exclude the exact installation-root entries `AGENTS.md` and `CLAUDE.md`, whether regular files or symbolic links, before inspecting their targets. It SHALL retain existing exclusions for dependencies, prior output, credentials, environment files, Git data and CMS database data. Every other included symbolic link SHALL fail the build with `source_symlink`; the builder SHALL NOT resolve, follow, or copy its target, even if the target is inside the source root. Selection components and required files SHALL NOT use links. Included special files SHALL fail with `source_special_file`, missing required entries with `source_missing`, and entries inaccessible to the builder identity with `source_unreadable`. Invalid deployment selections and invalid required-file contents SHALL retain `source_invalid`. Failures SHALL leave the previous complete release current and permit a successful retry after correction.

#### Scenario: Root service link is incidental
- **WHEN** an otherwise valid standalone or workspace installation contains root `CLAUDE.md -> AGENTS.md`, including a dangling or outside-root target
- **THEN** the builder excludes both root service documents without reading a target and builds the selected site

#### Scenario: Site source contains a link
- **WHEN** an included `src/components/linked.astro` entry is a symbolic link to another file inside the installation
- **THEN** the build fails with `source_symlink` and safe path `src/components/linked.astro`, without copying the target or replacing the current release

#### Scenario: Included link escapes the installation
- **WHEN** an included `public/linked` entry points outside the source root
- **THEN** the build fails with `source_symlink` and safe path `public/linked`, without revealing or reading the target

#### Scenario: Service filename occurs within the site
- **WHEN** the selected site contains an included link at `src/CLAUDE.md`
- **THEN** the builder rejects it with `source_symlink` rather than applying the installation-root exclusion

#### Scenario: Unreadable entry or missing required file
- **WHEN** a regular included entry cannot be read by the builder identity, or the required installation `pnpm-lock.yaml` is missing
- **THEN** the failure is respectively `source_unreadable` or `source_missing`, identifies the safe relative entry when available, and leaves the current release intact

#### Scenario: Correction and concurrent triggers
- **WHEN** the operator replaces a rejected link with regular source or restores access or a required file, then authorized build requests arrive concurrently
- **THEN** requests execute serially using the same selection and the successful retry atomically publishes a complete release

## MODIFIED Requirements

### Requirement: Builder results are bounded and sanitized
The builder SHALL return a synchronous success or failure result with a bounded, fixed-vocabulary log summary to its trusted API caller without exposing secret values, arbitrary command output, absolute filesystem paths, configured source-root locations, link targets, or environment dumps. Failure reasons SHALL be one of `source_invalid`, `source_symlink`, `source_unreadable`, `source_missing`, `source_special_file`, `install_failed`, `build_failed`, or `version_changed`. A source failure SHALL include optional `path` only when the failing entry has a safely representable path relative to the installation root. That path SHALL be 1–512 ASCII characters in slash-separated nonempty segments beginning with a letter, digit, underscore or dot and otherwise containing only letters, digits, underscores, dots, spaces or hyphens. Segments `.` and `..`, absolute paths, backslashes, control characters and credential/environment/Git/CMS-data exclusions SHALL be forbidden; the whole root SHALL be represented by omitting the path. Paths failing validation SHALL be omitted, never truncated or substituted with raw error text. Non-source failures SHALL omit `path`. The serialized response SHALL be at most 1024 UTF-8 bytes. Health status SHALL be available without revealing secrets. Unauthorized requests SHALL receive no source diagnostics and SHALL NOT inspect the source.

#### Scenario: Tool fails with sensitive output
- **WHEN** install or build output includes a secret or an internal path
- **THEN** the response contains only a bounded safe failure code and fixed summary without subprocess output

#### Scenario: Entry can be identified safely
- **WHEN** source copying fails on `src/pages/linked.astro`
- **THEN** the authenticated response includes its source reason and relative path, without `/source`, scratch, host mount or link target locations

#### Scenario: Filename cannot be represented safely
- **WHEN** the failing filename contains a control character, non-ASCII character, forbidden segment or exceeds the path bound
- **THEN** the reason remains specific but the response omits the path and raw filename

#### Scenario: Source root is missing
- **WHEN** the mount root is unavailable
- **THEN** the authenticated failure identifies `source_missing` without exposing a root path

#### Scenario: Unauthorized inspection attempt
- **WHEN** a caller lacks the dedicated builder secret
- **THEN** the response contains no source reason or path and no build/source inspection starts
