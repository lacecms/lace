## ADDED Requirements

### Requirement: Public guidance covers content import
The public documentation SHALL contain an *Import content* page that explains,
for a generated project: issuing an import token in Settings (lifetime,
optional publishing, revocation), setting `LACE_IMPORT_TOKEN` for the shell
session only and never in `.env` or source control, choosing the origin with
`--url` for Node and the local Worker, the `--validate-only`, `--dry-run`,
`--publish`, `--overwrite`, `--state` and `--json` options, the plan's item
states, reruns and resume, edit protection and its conflicts, exit codes, and
the limits (images only, 10 MiB per file, upload rate limit, no deletion or
unpublication, package data at current block versions, CLI and server of the
same release). It SHALL include a format reference for package format v1 that
matches the shipped JSON Schema, and a guide for writing a converter from
another CMS: mapping models and blocks, stable keys, media files,
`$media`/`$entry` references, validating offline, and rerunning after fixes.
The CLI reference SHALL list `lace import` and the environment table SHALL list
`LACE_IMPORT_TOKEN`.

The documentation site SHALL publish a downloadable sample package for the
starter configuration: `lace-import.json` and original media files created for
the sample. The guide's sample JSON SHALL equal the published file. A root test
SHALL run `lace import --validate-only` on the sample against the starter
template configuration, which applies the format rules the JSON Schema is
generated from and the model rules.
The internal topic map SHALL record the page's internal sources.

#### Scenario: A reader writes a converter
- **WHEN** a reader follows the converter guide and the format reference
- **THEN** they can produce a package directory that `lace import
  --validate-only` accepts, using only documented fields and references

#### Scenario: The sample drifts
- **WHEN** the starter configuration, the format schema or the guide changes
  so that the published sample no longer validates or no longer equals the
  guide's JSON
- **THEN** the root test fails and names the sample

#### Scenario: A reader downloads the sample
- **WHEN** a reader opens the sample links on the published documentation
  site
- **THEN** `lace-import.json` and its media files are served without a running
  CMS
