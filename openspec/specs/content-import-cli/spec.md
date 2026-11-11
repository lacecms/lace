# content-import-cli Specification

## Purpose
Defines `lace import`, the CLI command that loads a portable import package of
media files and content entries into a running Lace installation through the
admin REST API, idempotently, resumably and without overwriting editors' work
by accident.

## Requirements

### Requirement: Import packages use a versioned, bounded format
An import package SHALL be a directory containing `lace-import.json` and the
media files it names. `lace-import.json` SHALL be a UTF-8 JSON object of at
most 16 MiB with `formatVersion` equal to `1`, `media` and `entries` arrays and
an optional `$schema` string; any other top-level property SHALL be invalid.
`media` and `entries` SHALL each hold at most 5,000 items. Every item SHALL
have a `key` matching `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`, unique within its
array.

A media item SHALL be a strict object with `key`, `file` and optional `alt`
(string or `null`), `caption` (string or `null`), `focalPoint` (`{x, y}` or
`null`) and `tags` (array of strings). `alt`, `caption`, `focalPoint` and
`tags` SHALL follow the admin media metadata limits; tags SHALL be normalized
with the server's tag rule and SHALL hold at most 20 distinct tags.

An entry SHALL be a strict object with `key`, `model`, `fields` (object),
`blocks` (array) and optional `slug`, `title`, `seo` and `publish` (boolean,
default `true`). `slug` SHALL be required for collection models that declare a route
and refused for page, global and route-less collection models. `title` SHALL be required for pages and collections
and refused for globals. `seo` SHALL be accepted only for models with SEO
enabled and SHALL follow the admin SEO input rules. A block SHALL be a strict
object with `type`, `data` (object) and optional `settings` (object),
`anchor`, `className`, `hidden` and `key`; block keys SHALL be unique within
the entry. Block data and settings SHALL use the block's current version. A
package SHALL contain at most one entry per page or global model and at most
one entry per routed collection model and slug; entries of a route-less
collection are distinguished only by their keys.

The CLI SHALL ship a JSON Schema of this format, published with the package as
`@lacecms/cli/lace-import.schema.json`, that accepts every structurally valid
package and rejects unknown properties at the levels the format closes.

#### Scenario: Unknown format version
- **WHEN** `lace-import.json` declares `formatVersion: 2`
- **THEN** the command fails with `IMPORT_INVALID`, names `/formatVersion`, and contacts no server

#### Scenario: Duplicate entry keys
- **WHEN** two entries share the key `about`
- **THEN** validation reports the second one at `/entries/<index>/key` and nothing is written

#### Scenario: Collection entry without slug
- **WHEN** an entry of a collection model omits `slug`
- **THEN** validation reports `/entries/<index>/slug`

#### Scenario: Schema accepts a valid sample
- **WHEN** the shipped JSON Schema validates a package that the CLI accepts structurally
- **THEN** the schema reports no error

#### Scenario: Route-less entry with a slug
- **WHEN** an entry of the route-less `testimonials` model supplies `slug`
- **THEN** validation reports `/entries/<index>/slug` and contacts no server

### Requirement: References name package items and appear only where their type is expected
A value `{"$media": "<key>"}` SHALL be accepted only as the value of a media
field (in model fields, groups, list items or block data) and as `seo.image`,
and SHALL name a media key of the same package. A value
`{"$entry": "<key>"}` SHALL be accepted only as the value of a URL field and
SHALL name an entry key of the same package whose model is a page or a
collection. A reference object SHALL have exactly one property. A reference in
any other position, to an unknown key or to a global SHALL be invalid with the
JSON Pointer of the reference. Before saving, the CLI SHALL replace a media
reference with the media item's ID and an entry reference with the target's
canonical `entry:<id>` link token. Literal media IDs and literal `entry:<id>`
tokens SHALL be passed through unchanged.

#### Scenario: Media reference in a text field
- **WHEN** an entry places `{"$media": "hero"}` in a text field
- **THEN** validation fails at that field's pointer and nothing is written

#### Scenario: Entry reference to a global
- **WHEN** a URL field references the key of a global entry
- **THEN** validation fails at that field's pointer

#### Scenario: Reference becomes a link token
- **WHEN** an entry's URL field references the entry `contact` whose server ID is `abc/1`
- **THEN** the saved draft holds `entry:abc%2F1` in that field

### Requirement: Packages are validated locally before any network access
The command SHALL load the project's root `lace.config.ts` from the working
directory and validate every entry against its model's field descriptors,
allowed blocks and block definitions with the same draft validation the server
applies, substituting placeholder identifiers for references. Entries that will
be published SHALL also pass publication validation. Every media `file` SHALL
be a relative path with `/` separators, without empty, `.` or `..` segments,
that resolves, after following links, to a regular file inside the package
directory, of at most 10 MiB, whose bytes are an accepted image format.
Media items with identical bytes SHALL have identical metadata. All issues
SHALL be reported together with JSON Pointers into `lace-import.json` and SHALL
NOT include field values or file contents.

`--validate-only` SHALL perform only these checks, SHALL need no token or URL,
SHALL make no network request and SHALL exit `0` when the package is valid.

#### Scenario: Path escape is refused
- **WHEN** a media item names `../secrets/key.png` or a link that points outside the package
- **THEN** validation fails at `/media/<index>/file` without reading the target

#### Scenario: Unsupported file
- **WHEN** a media file is a PDF renamed to `.png`
- **THEN** validation fails at `/media/<index>/file` naming the unsupported format

#### Scenario: Offline validation
- **WHEN** a converter author runs `lace import ./out --validate-only` without `LACE_IMPORT_TOKEN`
- **THEN** the command validates the package, reports the outcome and makes no network request

### Requirement: The command authenticates with an import token over a safe transport
`lace import <dir>` SHALL read the token only from `LACE_IMPORT_TOKEN` and the
API origin from `--url` or, when absent, `LACE_API_BASE_URL`. The origin SHALL
be an absolute `https:` URL, or `http:` only for `localhost`, `*.localhost`,
`127.0.0.1` or `[::1]`, without credentials, query or fragment. The token SHALL
be sent only as `Authorization: Bearer` to that origin, never in a URL, and
SHALL never appear in output, the state file or errors. Before any write the
command SHALL read `GET /api/v1/admin/import-credential`; a rejected
credential SHALL fail with `IMPORT_UNAUTHORIZED`, and a plan that publishes
SHALL fail with `IMPORT_UNAUTHORIZED` when the effective permissions lack
`content:publish`.

#### Scenario: Plain HTTP to a remote host
- **WHEN** the origin is `http://cms.example.com`
- **THEN** the command fails with a usage error before sending the token

#### Scenario: Expired token
- **WHEN** the server rejects the import credential
- **THEN** the command fails with `IMPORT_UNAUTHORIZED` and writes nothing

#### Scenario: Publish without the publish capability
- **WHEN** `--publish` is given and the credential lacks `content:publish`
- **THEN** the command fails before the first write and names the missing capability

### Requirement: The server configuration must match the local configuration
Before planning, the command SHALL read `GET /api/v1/admin/content-models` and
SHALL fail with `IMPORT_CONFIG_MISMATCH` and no write when a model used by the
package is missing on the server, has another kind or another model version,
or when a block type used by the package is not allowed for the model on the
server or has another block version. The failure SHALL advise running
`lace content sync` against the installation or using the matching
configuration.

#### Scenario: Pending synchronization
- **WHEN** the local `posts` model has version 4 and the server still reports version 3
- **THEN** the command fails with `IMPORT_CONFIG_MISMATCH` and writes nothing

### Requirement: The plan is computed from server lookups before any write
The command SHALL match media by the SHA-256 of their bytes with
`GET /api/v1/admin/media?sha256=`, preferring the item recorded in the state
file and otherwise the earliest-created match. It SHALL match a page or global
entry by listing its model and a routed collection entry by its slug with
`GET /api/v1/admin/models/:modelKey/entries?slug=`. It SHALL match an entry of
a route-less collection only through its state-file mapping and SHALL plan
it as `create` when the state file has no confirmed mapping for its key. A state-file mapping SHALL
be used only after the server confirms the ID exists with the same model or
hash. A missing page or global singleton, or more than one collection entry
with the same draft slug, SHALL fail before any write.

Each media item SHALL be planned as `upload`, `update` (matched but a supplied
`alt`, `caption`, `focalPoint` or `tags` differs) or `unchanged`. Omitted
metadata properties SHALL leave the server value unchanged; `null` SHALL clear
it; supplied `tags` SHALL replace the item's tags. Each entry SHALL be planned
as `create`, `update`, `unchanged` or `conflict`, and, when publishing,
`publish` or `published` (already current). An entry SHALL be `unchanged` when
its normalized candidate, with references resolved, equals the current draft's
title, slug, fields, blocks and SEO exactly as the server would store it.

The command SHALL print the plan and a summary of counts. `--dry-run` SHALL
stop after printing it, having made only read requests, and exit `0` when the
plan has no conflict.

#### Scenario: First run on an empty installation
- **WHEN** a package with three media and two collection entries runs against an installation that has none of them
- **THEN** the plan lists three `upload` and two `create` items

#### Scenario: Ambiguous slug
- **WHEN** two drafts of `posts` on the server both have slug `about` and the package imports `posts/about`
- **THEN** the command fails before the first write and names the model and slug

#### Scenario: Dry run writes nothing
- **WHEN** an operator runs `lace import ./out --dry-run` with a valid token
- **THEN** the plan is printed, every request is a read, and the installation is unchanged

#### Scenario: Re-importing route-less entries
- **WHEN** a package with two `testimonials` entries is imported, then
  imported again with the state file the first run wrote
- **THEN** the first plan lists two `create` items and the second lists them
  as `unchanged` and `published`, without creating duplicates

#### Scenario: Route-less entries without a state file
- **WHEN** the same package is imported again with a new, empty state file
- **THEN** the plan lists both `testimonials` entries as `create`

### Requirement: Drafts edited after the last import are protected
The state file SHALL record, for each imported entry, the draft revision the
command last wrote or confirmed as unchanged. An entry SHALL be planned as
`conflict` when the state file records it for this origin, the server's
current draft revision differs from the recorded revision, and the normalized
candidate differs from the current draft. Without `--overwrite`, any
`conflict` SHALL stop the run before the first write with `IMPORT_CONFLICT`,
listing the conflicting entries. With `--overwrite`, conflicts SHALL be saved
as updates. An entry without a state record SHALL be planned as an ordinary
`update` when it differs.

#### Scenario: Editor changed an imported page
- **WHEN** an editor saved the imported `about` page after the last import and the package still differs from that draft
- **THEN** the plan marks `about` as `conflict`, the run writes nothing and exits with `IMPORT_CONFLICT`

#### Scenario: Explicit overwrite
- **WHEN** the same run is repeated with `--overwrite`
- **THEN** the `about` draft is saved from the package with the current expected revision

#### Scenario: Edit that matches the package
- **WHEN** an editor's change made the draft equal to the package
- **THEN** the entry is `unchanged` and its recorded revision is updated

### Requirement: Writes are ordered, idempotent and resumable
After a plan without errors the command SHALL, sequentially:
1. upload each `upload` media item as a multipart upload with its tags, then
   apply its `alt`, `caption` and `focalPoint` with the media `If-Match`
   precondition, and patch each `update` item the same way;
2. create each missing collection entry with its candidate in which entry
   references to entries that do not exist yet are omitted (an object property
   is dropped, a list element is removed);
3. save the complete candidate of every entry whose draft then differs, with
   the current draft revision as the expected revision;
4. with `--publish`, publish each entry planned as `publish`, with the current
   draft revision as the expected revision and an `Idempotency-Key` derived
   from the entry ID and that revision.

Entries SHALL never be deleted or unpublished, and media SHALL never be
deleted. After every successful write the command SHALL atomically update the
state file. A rerun of the same package against an unchanged installation
SHALL plan every item as `unchanged` or `published` and perform no write. A
run interrupted at any point SHALL complete when rerun, without duplicating
media or entries.

#### Scenario: Rerun changes nothing
- **WHEN** a successful import is run again with the same package
- **THEN** every media and entry item is `unchanged`, published entries are `published`, and no write request is sent

#### Scenario: Interrupted after creating entries
- **WHEN** a run stops after creating entries but before saving their links, and the operator reruns it
- **THEN** the existing entries are matched, their links are saved, and no entry is created twice

#### Scenario: Concurrent edit during a run
- **WHEN** a draft save returns `409` `CONTENT_REVISION_CONFLICT`
- **THEN** the command stops with `IMPORT_FAILED`, keeps the completed writes recorded and advises rerunning

### Requirement: Publication follows link dependencies
With `--publish`, entries whose `publish` is not `false` SHALL be published
when their draft is not already the published version. The order SHALL publish
a link target before any entry that links to it from a delivered location
(model fields or a block that is not hidden) when the target has no published
version. A dependency cycle among entries that need such ordering, or a
delivered link to a package entry that has no published version and will not
be published, SHALL fail before the first write with the involved keys.
Without `--publish`, nothing SHALL be published and the plan SHALL say that
publication was skipped.

#### Scenario: Linked entries publish in order
- **WHEN** `home` links to the unpublished collection entry `posts/launch` and both are published by the import
- **THEN** `posts/launch` is published before `home`

#### Scenario: Cycle among new entries
- **WHEN** two unpublished entries link to each other from delivered fields and `--publish` is given
- **THEN** the command fails before the first write and names both keys

#### Scenario: Hidden block link does not order publication
- **WHEN** the only link to an unpublished target is inside a hidden block
- **THEN** that link adds no ordering constraint

### Requirement: Rate limits are honored within a bounded wait
On `429` the command SHALL wait for the `Retry-After` delay (seconds or an HTTP
date), at most 300 seconds per wait and at most 10 waits for one request, and
SHALL then repeat the same request. It SHALL report each wait in human output.
When the bound is exceeded, or on any other failed request, it SHALL stop with
`IMPORT_RATE_LIMITED` or `IMPORT_FAILED`, keeping completed writes recorded.
Other failures SHALL NOT be retried automatically.

#### Scenario: Upload limit reached
- **WHEN** the 31st upload within a minute returns `429` with `Retry-After: 20`
- **THEN** the command waits 20 seconds, retries that upload and continues

### Requirement: Import output and exit codes are stable
The command SHALL accept `--url`, `--publish`, `--dry-run`, `--validate-only`,
`--overwrite`, `--state <path>` (default `<dir>/lace-import.state.json`) and
`--json`; `--validate-only` SHALL NOT combine with `--url`, `--dry-run`,
`--overwrite` or `--state`, and a repeated or unknown option SHALL be a usage
error. With `--json` stdout SHALL contain one JSON object with `ok`, `code`,
`message` and, when available, `data` holding the plan items and summary
counts; failures SHALL add `operation` (`import`), `reason` and `nextAction`
as other operational commands do. Exit codes SHALL be `0` on success, `3` for
usage errors, `4` for `IMPORT_INVALID`, `IMPORT_CONFIG_MISMATCH` and missing
settings, `2` for `IMPORT_CONFLICT`, and `6` for `IMPORT_UNAUTHORIZED`,
`IMPORT_RATE_LIMITED` and `IMPORT_FAILED`. Output SHALL never contain the
token, response bodies beyond sanitized error codes, or file contents. The
state file SHALL hold only origins, keys, IDs, hashes and revisions, keyed by
origin so one package can target several installations.

#### Scenario: JSON plan for automation
- **WHEN** CI runs `lace import ./out --dry-run --json`
- **THEN** stdout is one JSON object whose `data` lists every planned item with its key, kind and action

#### Scenario: Conflicting options
- **WHEN** an operator combines `--validate-only` and `--dry-run`
- **THEN** the command exits `3` with the import usage text
