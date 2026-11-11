# ADR 0031: Route-less collections

- Status: Accepted
- Date: 2026-11-11
- Extends: [ADR 0010](0010-global-models.md) (route-less content)
- Governing architecture: [section 8](../architecture/content-configuration.md#content-model-kinds),
  [build export](../architecture/api.md#build-export)

## Context

A collection needed a `route` with one `:slug` segment and every entry needed
a slug to publish. Data that is only listed on other pages (CV rows,
testimonials, press mentions) therefore received URLs nobody renders, and
sites hid them with dummy routes, hand-made slugs and sitemap filters. Globals
already prove that published content can exist without a route, but a global
is a singleton.

## Decision

- A collection may omit `route`. It stays kind `collection`; no new kind is
  introduced. A model has a public route when it is a page or a collection
  with a route.
- Entries of a route-less collection carry no slug (`slug_not_allowed`), own
  no `published_routes` row and cannot be `entry:` link targets
  (`non-routable`). `seo` is rejected on such a model.
- The database stores no routability flag. Published route-less entries are
  the published entries of `collection` models without a published route,
  an invariant kept by the atomic publication mutation.
- Adding or removing a route is a `breaking` route change, refused while the
  model has a published snapshot; removal also needs snapshots without slugs
  or incoming references.
- The build export carries them as `records` in a second keyset phase after
  the routed entries. The key is additive, so `formatVersion` stays `2`;
  tolerant consumers read a missing `records` as empty. A public
  `records/:modelKey` read and the SDK's `listRecords` / `site.records()`
  expose them.

## Consequences

- No database migration; Node and D1 share the record SQL.
- Sites read listed data with `site.records(modelKey)` and drop dummy routes
  and sitemap filters. An older SDK ignores records.
- Optional slugs on records stay possible later as a compatible relaxation.

## Alternatives considered

- **A new model kind.** Rejected: a kind migration on both runtimes and a
  fourth branch everywhere for what is still a list of entries.
- **Optional slug with per-model uniqueness.** Deferred by the owner: it needs
  a uniqueness store and migration for a lookup no current site needs.
- **Export format 3.** Rejected: it would force every site to upgrade the SDK
  in lockstep for content it does not read yet.
