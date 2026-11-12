# Internal URL links (internal)

Engineering notes for canonical entry references in ordinary URL fields. User
guidance (editor modes, unavailable links, delete/unpublish review, site
helpers, the Link block and component adoption) is public:
[Link to other entries](../apps/docs/src/content/docs/en/latest/content-modeling/links.md).
Accepted behavior lives in `openspec/specs/internal-url-links`; route-less
targets follow [ADR 0031](adr/0031-route-less-collections.md).

## Token grammar

An ordinary `field.url()` value is either a manual safe URL or the canonical
`entry:<URI-component-encoded-id>` token produced by `encodeEntryLink`. IDs are
opaque and case-sensitive (1–255 UTF-16 units). Canonical encoding rejects
malformed escapes, alternate encodings, control characters, unpaired
surrogates and query/fragment suffixes. Tokens carry no slug or redirect
history. References are never inferred from rich text, settings or arbitrary
JSON strings; block settings keep their scalar allowlist, and provider URLs,
rich-text hrefs and SEO canonical URLs keep their own grammars.

## Editor lookups

Status lookup is deduplicated at editor scope in batches of at most 200 IDs,
including collapsed content. Picker search is debounced, cancelable, literal
title-prefix search with bounded continuation pages. The application passes
the route-less model keys to the picker query because persistence knows only
the model kind.

## Validation and publication invariants

A normalized snapshot may contain at most 200 reference occurrences across its
fields and block data, including hidden blocks and defaults; repeated targets
count separately. Drafts may retain absent/unpublished targets. Known global
targets and entries of route-less collections are rejected as `non-routable`
in draft and publish mode; both remain valid link sources. Publication requires
every delivered target to have a published route at commit time, using the
candidate route for a self-reference. Hidden references stay tracked but do not
block publication for unavailable targets. Resolution never traverses a
target's outgoing links.

## Impact receipts

Delete and unpublish read a paginated impact view (sources and locations both
paginated) grouped into draft, published-visible and published-hidden usages.
Usages inside the target's own publication (unpublish) or removed snapshots
(delete) are excluded. Published-visible external usages require
`linkImpact: {receipt, acknowledgePublishedLinks: true}`; the receipt binds the
target, action, target revision/snapshot guards, actor and the singleton graph
revision. Without acknowledgment the command fails with `409
CONTENT_LINKS_IN_USE`; a changed graph fails with `409
CONTENT_LINK_IMPACT_CHANGED`. Unpublish network retries keep their idempotency
key and original acknowledgment. Receipts confer no permissions and there is no
force flag or source rewriting. After removal, incoming authored JSON stays
intact; an export/network/build failure remains a failure and cannot undo
publication.

Authenticated reads are `GET /api/v1/admin/link-targets`, `POST
/api/v1/admin/link-targets/resolve` and `GET
/api/v1/admin/entries/:entryId/link-impact`. See the
[generated OpenAPI](../apps/api/openapi/api-v1.json) for strict query modes,
limits and sanitized issue/error responses.

## Transport

Public entry/global/record responses include `internalLinks`, including `[]`.
Each item is `{sourceKey, area, pointer, targetId}`: `$fields` plus `fields`,
or a block key plus `data`; pointers are relative RFC 6901 JSON Pointers with
zero-based list indices. Only delivered ordinary URL locations appear; hidden
blocks, settings, rich text and draft data do not.

Build-export format 2 requires manifests on every entry/global. Format-1-only
SDKs reject it with upgrade guidance; the current SDK accepts formats 1 and 2
and normalizes legacy format 1 without manifests to `[]`. Known manifest
properties remain validated in tolerant parsing. Resolution happens only after
the complete version-bound export traversal, because a destination can occur
on a later page; the loader validates identity and manifest consistency and
never fetches individual targets. Diagnostics are ordered by source ID, area,
source key and pointer, capped at 100 items with `total` and `truncated`, and
contain only IDs, model keys and pointers. The view (and its diagnostics) is
assembled once and reused by static cache hits, repeated renders and 304
revalidation.

## Persistence, migration and rollback

The baseline migration creates the reference projection, target and
title-prefix indexes and the singleton graph revision. The source snapshot
foreign key cascades outgoing rows; target identity has no foreign key so
incoming links survive removal. Lifecycle and schema/default/block migrations
maintain projections atomically; unchanged tuples need no reference writes, and
a graph-changing atomic unit increments the revision once. Existing unavailable
tuples allow unrelated schema updates; new published references must pass
target checks. Field/block pruning removes its outgoing locations.

Rollback requires restoring the matching database backup (Node: the complete
SQLite data directory with API/dispatcher stopped; Cloudflare: a D1
export/restore point) together with the matching API/admin/site artifacts:
older engines do not maintain this projection or understand the URL grammar.
No down migration or automatic token-to-path conversion is provided.

## Composition

Embedded API compositions supply `ContentLinkUseCases` through the server's
`links` input and implement `ContentLinkReadPort` in custom repositories. The
bundled Node/Worker compositions already wire this port. Strict server DTOs
represent format 2; the SDK's `BuildExportData` and page types represent
supported formats `1 | 2` after legacy normalization.
