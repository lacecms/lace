## ADDED Requirements

### Requirement: Content import runs through the CLI against both runtimes
The local cross-runtime verification SHALL include a content import journey
that runs on Node (migrated SQLite with local S3-compatible storage) and on the
local Worker composition (local D1 and R2), with the starter project
configuration synchronized and real image inspection, storage and rate limits.
The journey SHALL run the built `lace import` command as a separate process
from a project directory holding the same configuration, with the token only in
`LACE_IMPORT_TOKEN` and the runtime's loopback origin in `--url`, and SHALL
judge results by exit code, the command's JSON result and the runtime's admin
and build-export APIs. Import tokens SHALL be issued through the admin REST API
by a signed-in administrator. The package SHALL be the documented sample
package. On each runtime the journey SHALL:

- pass `--validate-only` and then `--dry-run`, after which media, entries,
  draft revisions and build history are unchanged;
- run `--publish` and require every media item stored with its package bytes,
  SHA-256, tags, alt text, caption and focal point; every entry created or
  updated with entry links resolved to `entry:<id>`; every entry published,
  each link target before the entries linking to it; the published export to
  contain the package's published values and media; and the media served
  publicly with the uploaded bytes;
- rerun with the state file and again after deleting it, and require each
  rerun to report every item `unchanged` and to leave media, draft revisions,
  published versions and build history unchanged;
- after an administrator edits an imported draft in the admin API, require a
  rerun to report that entry as `conflict`, exit with code 2 and write
  nothing; require `--overwrite` to restore the package values; and require
  the next rerun to report every item `unchanged`;
- require `--publish` with a token issued without publishing to fail before
  any write, and a revoked token to fail with exit code 6, without the token
  value in standard output or standard error.

After removing runtime-generated identifiers, times and origins, both
runtimes' plans, final drafts and published exports for the imported entries
SHALL be equal.

#### Scenario: First import publishes the sample on both runtimes
- **WHEN** the sample package is imported with `--publish` into a fresh
  Node installation and a fresh local Worker installation
- **THEN** both commands exit 0, both published exports contain the sample's
  entries, links and media, and their canonical forms are equal

#### Scenario: A rerun changes nothing
- **WHEN** the same command is run again, with and without the state file
- **THEN** every item is reported `unchanged`, and the runtime shows no new
  media, no new draft revision, no new publication and no new build request

#### Scenario: An edited draft is protected
- **WHEN** an administrator edits an imported draft and the import is rerun
  without `--overwrite`
- **THEN** the command exits 2 with that entry as `conflict` and the edited
  draft keeps its revision and values

#### Scenario: A credential is refused
- **WHEN** the import runs with a revoked token, or with `--publish` and a
  token issued without publishing
- **THEN** the command fails before any write and its output does not contain
  the token
