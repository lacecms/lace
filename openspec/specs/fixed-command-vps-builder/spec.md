# fixed-command-vps-builder Specification

## Purpose

Defines the private VPS service that turns a durable Lace build request into a static Astro release without exposing commands, paths, or secrets to HTTP callers.

## Requirements

### Requirement: Private trigger accepts a closed request shape
The builder SHALL require a dedicated API-to-builder secret and SHALL accept only a build ID and a non-negative integer target published-state version. It SHALL reject other fields and unauthenticated requests without starting a build.

#### Scenario: Authorized request
- **WHEN** the API sends the dedicated secret and a valid build ID and target version
- **THEN** the builder accepts the fixed build request

#### Scenario: Unauthorized or extended request
- **WHEN** a caller has no valid secret or supplies command, path, environment, or other fields
- **THEN** the builder rejects the request before any work begins

### Requirement: Builder runs a fixed isolated build
The builder SHALL copy the read-only mounted installation into disposable work space, install from its root frozen lockfile with an image-pinned toolchain, and run the image-defined direct Astro build for its explicitly selected project and output directory. It SHALL support generated, external standalone and external pnpm workspace selections without guessing between example layouts. Request data SHALL never select a command, filesystem path, argument or environment value. Operator source selection SHALL NOT provide a command or executable override. The resulting output SHALL be a complete static site with a regular `index.html`; symlinks and special files SHALL be rejected before release publication. The built site SHALL match the requested published-state version before release publication.

#### Scenario: Successful build
- **WHEN** the fixed install and Astro build succeed for the requested version
- **THEN** the builder stages a complete static release from the selected output

#### Scenario: Source or version failure
- **WHEN** installation or build fails, or the published-state version differs from the requested version
- **THEN** no new release becomes current

#### Scenario: Example differs from selected site
- **WHEN** a mounted external Astro project and its generated CMS example contain distinct page markers
- **THEN** the published release contains the selected project's marker and not the example's marker

#### Scenario: Extended trigger cannot override deployment selection
- **WHEN** a caller supplies a valid secret but extends the trigger with paths, commands, arguments or environment fields
- **THEN** the closed request contract rejects the call without running install or build

#### Scenario: Failure and retry preserve release atomicity
- **WHEN** a selected-site build fails after a successful release and the administrator retries after correcting the source
- **THEN** the old complete release remains served throughout failure and is replaced only by the complete successful retry

#### Scenario: Concurrent triggers use the same selected site
- **WHEN** multiple authorized build requests arrive concurrently
- **THEN** they execute serially using the deployment's single selection and retain the existing version checks and atomic release switch

### Requirement: Successful releases switch atomically
The builder SHALL publish a complete release by atomically replacing the `current` pointer after success, keep the previous successful release, and remove older releases according to a fixed retention policy. Concurrent trigger requests SHALL execute serially. A failed request SHALL leave the current release intact.

#### Scenario: Build succeeds after an existing release
- **WHEN** a new build succeeds with a current release present
- **THEN** readers see either the complete old release or the complete new release, and the previous release remains available

#### Scenario: Build fails after an existing release
- **WHEN** a subsequent build fails
- **THEN** the current pointer and previous successful release remain unchanged

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
