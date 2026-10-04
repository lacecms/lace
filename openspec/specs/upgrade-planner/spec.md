# Upgrade Planner

## Purpose

Allow operators to review deterministic upgrade decisions and diffs while preserving user source and detecting managed-file conflicts before any write.

## Requirements

### Requirement: Upgrade inputs are validated before planning
The planner SHALL read a project manifest and an explicitly selected pristine target template directory with a manifest. It SHALL accept only schema version 1, a nonempty template version, an optional site record (`mode` `starter` with path `site`, `existing` with a safe relative path, or `none` with `null`), safe relative POSIX file paths, explicit user/managed ownership, and lowercase SHA-256 digests for managed files only. A manifest without a site record SHALL be read as starter mode with path `site`. It SHALL refuse unknown formats, malformed metadata, paths under `.lace`, traversal, symbolic links, nonregular managed files, and target bytes whose hashes differ from the target manifest. It SHALL refuse a target template whose site mode or path differs from the project's, naming the `create-lace` flags that generate a matching template. `site/**` and `lace.config.ts` SHALL never be classified as managed. It SHALL NOT load project code, access runtime databases or require runtime credentials.

#### Scenario: Future manifest format
- **WHEN** either manifest declares a schema version newer than 1
- **THEN** planning fails with an actionable manifest error and neither directory changes

#### Scenario: Unsafe template
- **WHEN** a managed path traverses outside the project, uses a symlink, or target bytes fail their declared hash
- **THEN** planning fails before producing an actionable plan without reading through the unsafe path

#### Scenario: Template generated for another site mode
- **WHEN** a project recorded as existing site at `..` is planned against a starter-mode template
- **THEN** planning fails with an input error naming `--existing-site ..` and neither directory changes

#### Scenario: Legacy starter project
- **WHEN** a project manifest without a site record is planned against a starter-mode template
- **THEN** planning proceeds and an applied upgrade records starter mode with path `site`

### Requirement: Three-way decisions preserve ownership
The planner SHALL compare baseline hashes from the installed manifest, current managed-file hashes, and target managed-file hashes. It SHALL sort decisions by path. Existing user ownership and reserved user source SHALL win over target ownership. Unchanged managed files SHALL be planned for replacement or removal when the target changes, and missing new managed files SHALL be planned for creation. A changed or missing baseline managed file SHALL conflict when a template change would replace/remove it; a current file already equal to the target SHALL be reported as current. If the template has not changed, local edits SHALL be preserved. Newly managed paths that already exist and ownership transitions SHALL conflict unless existing user ownership requires preservation. Untracked files SHALL remain untouched.

#### Scenario: Engine and image versions change
- **WHEN** target package dependencies and Compose image tags change and the corresponding working files match baseline hashes
- **THEN** the plan automatically proposes replacement of those managed files

#### Scenario: User changes deployment file
- **WHEN** current Compose bytes differ from baseline and a target replacement differs from current bytes
- **THEN** the plan contains a conflict and a proposed diff and preserves the working file

#### Scenario: User source is edited
- **WHEN** the user edits or adds files under `site/` or edits `lace.config.ts`
- **THEN** the planner preserves those paths without reading their contents or proposing writes

#### Scenario: Removal or new-path collision
- **WHEN** a target removes a modified managed file or adds a managed path already present locally
- **THEN** the affected path conflicts rather than silently deleting or replacing local work

### Requirement: Plans and unified diffs are deterministic
Human and JSON output SHALL expose source and target template versions, per-path actions and reasons, baseline/current/target hashes where applicable, conflict and change counts, and unified diffs from working bytes to proposed bytes for changed managed files. Identical inputs SHALL produce byte-identical output with no timestamps. Diffs SHALL represent additions, removals and missing final newlines accurately; nontext files SHALL receive a binary-difference notice rather than corrupted text.

#### Scenario: Repeated review
- **WHEN** an operator runs planning twice on unchanged inputs
- **THEN** both JSON plans and human reports are byte-identical, with sorted paths and reviewable diffs

### Requirement: Upgrade CLI defaults to a read-only dry run
`lace upgrade --template <dir> [--project <dir>] [--json]` SHALL plan from the current directory unless a project directory is explicit. Without `--apply` or `--rollback`, it SHALL make no filesystem writes, including manifest, journal, lock, or conflict-artifact writes. Explicit `--apply` SHALL dispatch to the accepted upgrade apply/recovery behavior. Explicit `--rollback` SHALL select the latest recorded upgrade for the project and SHALL NOT require a target template; combining it with `--apply` or `--template` SHALL be a usage error. The CLI SHALL emit one JSON result/error object under `--json`, never prompt, and use exit 0 for a conflict-free plan or successful operation, 2 for conflicts, 3 for usage errors, 4 for invalid manifests/inputs and 6 for inspection, apply, recovery or concurrency failures. Existing operational CLI commands SHALL retain their accepted behavior.

#### Scenario: Explicit apply in planner-only release
- **WHEN** an operator moves from the planner-only CLI release to the apply-capable CLI and invokes upgrade with a valid target template and `--apply`
- **THEN** the CLI performs guarded application and reports its outcome instead of returning the former 24A unsupported error

#### Scenario: Cloudflare review without credentials
- **WHEN** an operator reviews a Cloudflare generated project with no runtime credentials
- **THEN** the same ownership rules apply to its managed Worker/workflow files and no remote operation occurs

#### Scenario: Dry run with recovery state
- **WHEN** an operator requests a dry run while an interrupted operation exists
- **THEN** the response identifies pending recovery and the appropriate apply or rollback command without changing any filesystem entry or claiming the partial upgrade is complete

#### Scenario: Invalid rollback combination
- **WHEN** an operator supplies `--rollback` together with `--apply` or `--template`
- **THEN** the CLI returns exit 3 before mutation
