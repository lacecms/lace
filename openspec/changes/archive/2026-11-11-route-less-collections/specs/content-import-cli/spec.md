## MODIFIED Requirements

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
