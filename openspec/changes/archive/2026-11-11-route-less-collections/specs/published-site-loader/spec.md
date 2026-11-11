## ADDED Requirements

### Requirement: The site view exposes published records
The site view SHALL expose `records(modelKey)`, returning the published records
of that model from the export, or an empty list for an unknown model, a page,
a global or a collection that declares a route. A record SHALL expose its
identifier, model key, title, publication time, field values and blocks
ordered by position, the same `media(id)` and `image(mediaId, usageAlt?)`
lookups and media URL rules as entries, and the same link resolution as
entries and globals. It SHALL expose no path, slug, SEO, draft or editorial
metadata and SHALL be immutable. Records listed by model SHALL be ordered by
publication time descending, then identifier descending. Records SHALL never
appear in the complete entry list, in path, slug or model-entry lookups, in
SEO resolution or in the sitemap.

#### Scenario: An About page lists CV rows
- **WHEN** an export contains four published records of the route-less `cv`
  model
- **THEN** `site.records("cv")` returns the four records with their fields and
  titles, and `image()` resolves their media with the effective alt text

#### Scenario: Records are not routes
- **WHEN** an export contains published records of `testimonials`
- **THEN** no path lookup, slug lookup, `entries("testimonials")` call or
  sitemap returns them, and the sitemap needs no caller filter to leave them
  out

#### Scenario: A record links to a page
- **WHEN** a record stores `entry:<about-id>` and the `about` page is published
- **THEN** resolving that value on the record returns the page's path

## MODIFIED Requirements

### Requirement: Inconsistent exports are rejected
The loader SHALL fail with `invalid_export` when an export contains two entries with the same path, two entries of the same model with the same slug, two globals with the same model key, a global whose model key is also the model key of an entry, two records with the same identifier, or a record whose model key is also the model key of an entry or a global, naming the conflicting path, model and slug, model key, or record identifier. An export whose entries, globals, records or media dictionary violate the public contract SHALL fail as a contract violation before a site view exists.

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

#### Scenario: Records share a model with routed entries
- **WHEN** an export lists a record of model `testimonials` and a routed entry
  of model `testimonials`
- **THEN** the loader fails with `invalid_export` naming `testimonials`
