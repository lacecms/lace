## MODIFIED Requirements

### Requirement: Inconsistent exports are rejected
The loader SHALL fail with `invalid_export` when an export contains two entries with the same path, two entries of the same model with the same slug, two globals with the same model key, or a global whose model key is also the model key of an entry, naming the conflicting path, model and slug, or model key. An export whose entries, globals or media dictionary violate the public contract SHALL fail as a contract violation before a site view exists.

#### Scenario: Duplicate slugs in a model
- **WHEN** two published entries of model `posts` share the slug `hello`
- **THEN** the loader fails with `invalid_export` naming `posts` and `hello`

#### Scenario: Duplicate paths across models
- **WHEN** two published entries of different models resolve to the same path
- **THEN** the loader fails with `invalid_export` naming that path

#### Scenario: Duplicate global keys
- **WHEN** an export lists two globals with model key `settings`, or a global
  and an entry share the model key `settings`
- **THEN** the loader fails with `invalid_export` naming `settings`

## ADDED Requirements

### Requirement: The site view exposes published globals
The site view SHALL expose `global(modelKey)`, returning the published global
of that model from the export or nothing when the global is unpublished,
unknown or names a page or collection. A published global SHALL expose its
identifier, model key, publication time, field values and blocks ordered by
position, and the same `media(id)` and `image(mediaId, usageAlt?)` lookups and
media URL rules as entries; it SHALL expose no path, slug, title, draft or
editorial metadata and SHALL be immutable. Globals SHALL never appear in path,
slug or model listings.

#### Scenario: A layout reads site settings
- **WHEN** an export contains the published `settings` global with a
  `siteName` field and a logo media field
- **THEN** `site.global("settings")` returns its fields and `image()` resolves
  the logo with its effective alt text

#### Scenario: A global was never published
- **WHEN** the export has no `settings` global
- **THEN** `site.global("settings")` returns nothing and building continues

#### Scenario: Globals are not routes
- **WHEN** an export contains a published global
- **THEN** no path lookup or model listing returns it
