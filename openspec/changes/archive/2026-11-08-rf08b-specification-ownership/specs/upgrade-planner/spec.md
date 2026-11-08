## MODIFIED Requirements

### Requirement: Upgrade CLI defaults to a read-only dry run
`lace upgrade --template <dir> [--project <dir>] [--json]` SHALL plan from the current directory unless a project directory is explicit. Without `--apply` or `--rollback`, it SHALL make no filesystem writes, including manifest, journal, lock, or conflict-artifact writes. Explicit `--apply` SHALL dispatch to the accepted upgrade apply/recovery behavior. Explicit `--rollback` SHALL select the latest recorded upgrade for the project and SHALL NOT require a target template; combining it with `--apply` or `--template` SHALL be a usage error. The CLI SHALL emit one JSON result/error object under `--json`, never prompt, and use exit 0 for a conflict-free plan or successful operation, 2 for conflicts, 3 for usage errors, 4 for invalid manifests/inputs and 6 for inspection, apply, recovery or concurrency failures. Existing operational CLI commands SHALL retain their accepted behavior.

#### Scenario: Explicit apply in planner-only release
- **WHEN** an operator moves from the planner-only CLI release to the apply-capable CLI and invokes upgrade with a valid target template and `--apply`
- **THEN** the CLI performs guarded application and reports its outcome instead of returning the former unsupported error

#### Scenario: Cloudflare review without credentials
- **WHEN** an operator reviews a Cloudflare generated project with no runtime credentials
- **THEN** the same ownership rules apply to its managed Worker/workflow files and no remote operation occurs

#### Scenario: Dry run with recovery state
- **WHEN** an operator requests a dry run while an interrupted operation exists
- **THEN** the response identifies pending recovery and the appropriate apply or rollback command without changing any filesystem entry or claiming the partial upgrade is complete

#### Scenario: Invalid rollback combination
- **WHEN** an operator supplies `--rollback` together with `--apply` or `--template`
- **THEN** the CLI returns exit 3 before mutation
