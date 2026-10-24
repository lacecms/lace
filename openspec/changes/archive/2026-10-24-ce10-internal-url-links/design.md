## Context

See proposal.md for motivation and the owner-selected scope. Ordinary URLs are
currently strings validated by `isSafeUrl`; rich-text marks share that predicate.
Image/gallery, navigation, Hero and CTA registry sources currently write those
strings directly into href. `PublishedSite` has path/slug and media lookups, but
no entry-ID link lookup. SDK imports contracts, not content/render; render imports
content, not SDK/contracts. Those boundaries stay unchanged.

`content_media_references` demonstrates snapshot-scoped reference projection.
Node mutations use transactions; D1 uses mutation guards and atomic batches.
Existing limits are 100 SQL binds, 40 mutation statements and 50 statements per
invocation, including auth. Export pages currently use two batches/ten reads.
Completed `video-embed-block` remains unsynchronized; its registry/script/provider
requirements are an explicit prerequisite, not changes to undo during CE10.

## Goals / Non-Goals

**Goals:** keep authored strings immutable, make URL-field links resilient to
route changes, allow deliberate removal with review, and bound all online work.
Deliver one coherent contract from authoring through deployed static HTML.

**Non-goals:** see proposal.md. In particular no runtime public-page DB lookup,
graph traversal, source rewriting on target removal, unrelated media-policy
change or requirement to fetch external URLs. A reference is a navigation target,
not an eagerly expanded related-content object.

## Decisions

### 1. Separate field-target grammar from safe hrefs

`@lacecms/content` owns pure canonical encode/decode and field-target validation.
An internal token is `entry:${encodeURIComponent(id)}`; parse by decoding exactly
once and comparing the canonical re-encoding. Reject malformed escapes, empty or
overlong IDs (the existing 255 UTF-16-unit identifier bound), control characters,
noncanonical encoding and unpaired surrogates.
Do not restrict IDs to the generator's current ULID implementation. Encoding
permits opaque IDs with slashes or punctuation without treating them as paths.

Keep `isSafeUrl` as the existing safe-href predicate. Add a distinct URL-field
predicate/parser used by ordinary URL descriptor validation; an `embedProviders`
descriptor still accepts only its provider URL grammar. Rich text and SEO keep
their current validators. Do not guess references by scanning strings or keys.
Normalization/default application precedes reference discovery and the separate
200-occurrence limit. URL defaults retain existing descriptor normalization
semantics; submitted/backfilled values undergo runtime validation as today.

URL fields live in model/global fields and block data, including nested
groups/lists. Block settings retain their select/boolean/number/text allowlist
and required defaults. Settings are not internal-reference locations; text
settings containing a token-like string remain ordinary text.

Alternatives rejected: object-valued URLs would change scalar types everywhere;
using slugs as IDs loses stability; broadening the shared href allowlist would
admit tokens into rich text and unsafe HTML paths. `entry:id#anchor` is excluded;
an encoded `#` inside an opaque ID is ID data, not an anchor suffix.

### 2. Project references with an indexed table and one graph revision

Add a forward migration with:

```text
content_entry_link_references
  snapshot_id       FK content_snapshots(id) ON DELETE CASCADE
  source_key        $fields or stable block key
  area              fields | data
  field_path        RFC 6901 pointer, always leading /
  target_entry_id   opaque ID, deliberately NO target foreign key
  delivered         0 for hidden-block locations, otherwise 1
  PRIMARY KEY (snapshot_id, source_key, area, field_path)
  INDEX (target_entry_id, snapshot_id, source_key, area, field_path)

content_link_state
  singleton_key     PRIMARY KEY CHECK = 1
  revision          nonnegative, monotonic safe integer
```

The target has no cascading/restricting FK: deliberate deletion must preserve
incoming IDs and diagnostics. Source deletion cascades normally. Current phase
comes from source entry draft/published pointers joined through its snapshot;
do not store a phase flag that can drift. Fields use area `fields` and source
key `$fields`; block data uses area `data` and the stable block key. Settings
produce no reference rows. Only block `hidden` affects the delivered flag.

Application validation builds normalized tuples in one descriptor walk, alongside
existing validation. For a draft save, adapters diff these tuples against the
snapshot's projected rows using bounded JSON rowsets and indexed anti-joins.
Delete only removed/changed rows and insert only new/changed rows. If the set did
not change, do neither and do not advance `content_link_state`. Title-only saves
therefore add no reference writes. Publication uses set-based snapshot copy;
revert and duplicate retain stable locations/remap copied block keys.

When a mutation changes reference membership, phase, source snapshot identity or
delivery, increment the graph revision exactly once under the same mutation
guard, including cascade-producing entry delete/unpublish and existing field/block
pruning. Never depend on a
cascade to increment it. A change with no affected reference rows needs no bump.
All snapshot/JSON/projection/revision/build writes commit or roll back together.

A global graph revision is deliberately simpler than per-target revisions: it
costs one scalar update per mutation rather than up to 200 target-counter writes.
It conservatively invalidates a dialog after an unrelated link edit. Content-only
edits do not invalidate it. This tradeoff is visible in the stale-impact message;
per-target revisions are a later optimization only if measured contention warrants
them. No KV cache is authoritative for deletion or publication.

The migration creates an empty projection: current accepted content cannot hold
entry tokens in URL fields. Manual URLs and published JSON are not rewritten.
Add a focused `content_snapshots(title COLLATE NOCASE, id)` index for bounded
title-prefix picker reads, joining only current draft snapshots of page/collection
models. Prefix matching trims the search input and uses SQLite ASCII case-insensitive
comparison; non-ASCII characters match exactly. No arbitrary substring/FTS scan.

### 3. Publication checks final target state inside the mutation

Deduplicate delivered target IDs for status reads and final SQL validation.
The application maps invalid targets back to every offending source path. Drafts
allow syntactically valid missing/unpublished targets, but reject a known global
as a target. Publication validates all delivered targets through a set query
against current entry pointers and published routes in its guarded transaction.
A self-reference uses the candidate route, including first publication.
Existing source-revision guards prevent validating one source and committing
another; final target checks prevent a removal race. If an unavailable target
was missed in preflight, the atomic guard refuses the write and a bounded status
reread yields path issues; no partial publication is accepted.

Mutual links are allowed because resolution is one ID lookup, never recursive.
Draft-only B can first be published without its outgoing A link; A and B can then
be connected through successive valid publications. No multi-entry publication
transaction is introduced. Route conflicts retain existing failure behavior.

Schema rewrites/default backfills into publications validate newly introduced or
changed delivered targets against the prospective post-sync routes inside their
guarded units. Existing unavailable tuples that remain unchanged are permitted
so an unrelated sync is not blocked. Model removal remains refused while entries
exist, so synchronization does not introduce a new way to remove destinations.
Existing field/block pruning removes outgoing locations only. Preserve the
existing resumable migration boundary.

### 4. Impact receipts are preconditions, not new permissions

Impact queries require content read authority. Each receipt is an opaque bounded
precondition envelope containing version, target ID, action, actor ID, current
target draft revision/published snapshot, and graph revision. It uses the existing
strict opaque-cursor encoding approach; it is not an authorization capability or
proof that a person read every page. Every field is validated and compared with
authenticated/current state. No signing secret, receipt table or extra GET write
is needed: supplying an acknowledgment still requires the actor's normal mutation
permissions and all existing target guards. A blanket `force=true` is not accepted.

Default mutation guard: target's existing guards AND no external published-visible
incoming usages. Confirmed guard: existing guards AND exact receipt scope/current
graph revision AND explicit acknowledgment. Both conditions execute inside the
same Node transaction or D1 guarded batch as route removal/public-state/outbox.
An old receipt gives `CONTENT_LINK_IMPACT_CHANGED`; missing acknowledgment for
current published-visible links gives `CONTENT_LINKS_IN_USE`. No-link commands
retain existing client compatibility and need no preliminary impact API call.

For unpublish, exclude the target's outgoing publication (it disappears), retain
its draft as a warning, and count other sources. For delete, exclude all source
snapshots being deleted. Hidden published locations warn without extra published
acknowledgment. A concurrent new published source either advances graph revision
before removal, invalidating its receipt, or sees the removed route and fails
publication. A no-receipt removal with zero usages performs the same atomic check.

Unpublish idempotency fingerprints include acknowledgment/receipt. Replay is
checked before obsolete target/graph guards, preserving a success after a lost
response. Changing receipt under an already used key conflicts. Delete retains
its existing not-found/revision behavior; no new delete idempotency promise.

Configuration sync retains `REMOVAL_HAS_ENTRIES` for every populated model,
including page/global singletons. No model-removal receipt, plan fingerprint
extension or `--confirm-link-impact` CLI option is introduced. Existing
field/block pruning maintains outgoing projections and the graph revision under
the ordinary sync guards. Pre-final resumable block migrations remain unchanged:
a stale apply can leave coherent already-committed units, as today. Reports must
state that distinction rather than claiming the whole sync was rolled back.

### 5. Keep queries bounded, including dialog pagination

New admin API contracts are in rest-contracts/spec.md. Picker/status read ports
do not hydrate source aggregates or blocks. The picker uses keyset order
`title COLLATE NOCASE, snapshotId`, filters routable kinds and optionally model/
status; requests cancel/debounce in the UI. Batch resolver uses one bounded JSON
array of up to 200 IDs and a set join, returning state even for missing IDs.
The editor caches/deduplicates by selected ID set, invalidates after relevant
mutations, refreshes on picker open/focus and never fetches once per mounted field.
Availability displayed in the form is advisory; final writes revalidate it.

Impact groups by source snapshot (therefore one entry/phase), in snapshot-ID
keyset order, with visible/hidden locations distinguished. Return up to `limit`
groups and at most 10 initial locations per group. A location cursor binds target,
action, graph revision and source snapshot; location paging uses the same route
with `sourceEntryId`, `snapshotId`, `locationsAfter` and `limit`. Its response is
a strict `mode: locations` variant, while the group response is `mode: sources`.
Foreign or mixed cursor/query modes fail validation. Each group exposes
`nextLocationsCursor` when needed; no entity with 200 locations bypasses limits.

Read graph revision/target guards and `hasPublishedUsages`, read the bounded
groups/locations with indexed joins, then recheck graph revision. Retry-free
conflict on drift prevents mixing impact sets across requests. Total counts are
not required; `hasPublishedUsages` uses EXISTS, not a count of the whole graph.
The UI allows access to every continuation rather than pretending the first page
is the complete list. Opening an impact view writes nothing.

Execution budgets (SQL statements count individually inside D1 batch):

| Operation | Bound |
| --- | --- |
| Status resolver, at most 200 IDs | At most 2 content reads |
| Picker page | At most 2 content reads |
| Impact group/location page | At most 5 content reads |
| Content mutation | At most 40 statements in one guarded mutation batch |
| Complete content HTTP invocation | At most 50 statements including auth/preflight |
| Export page | At most 2 batches and 12 content reads, no per-target reads |
| Each statement | At most 100 bound parameters |
| Each snapshot | At most 200 internal reference occurrences |

Use bounded JSON rowsets/INSERT SELECT for projection deltas and target guards,
not 200 individual inserts/lookups. Fit the combined existing maximum blocks,
media and new references; do not verify these independently and miss their sum.
Tests instrument complete adapter/HTTP calls and inject races/failures. Verify
EXPLAIN QUERY PLAN and D1 rows_read/rows_written at representative fan-out, plus
zero reference writes for content-only saves. A batch reduces round trips, not
the number of statements or billed rows. CPU wall time on maximal data is best
effort under the existing Free-plan policy; do not promise a fixed latency.

Sources checked during planning: [D1 batch and sessions](https://developers.cloudflare.com/d1/worker-api/d1-database/)
and [D1 indexes and row accounting](https://developers.cloudflare.com/d1/best-practices/use-indexes/).
Keep writes/guards on the primary; if read replicas are introduced separately,
impact/status reads must use primary or appropriate session consistency and
must never replace the final guarded write check.

Cursor scope bindings use a canonical SHA-256 digest so long valid Unicode IDs
cannot exceed the 4096-character envelope. Location continuations carry a compact
snapshot-local SQLite row identifier; the indexed query resolves its existing
(source key, area, pointer) tuple and continues in the same tuple order. Its tuple
hash detects physical anchor reassignment and requires a refresh instead of mixing
locations; the indexed anchor lookup remains within the five-read bound. The anchor
is scoped to target/source/snapshot and graph revision, and application mutations
that can change it advance that revision. This keeps arbitrary valid field-pointer
lengths out of cursors without weaker keyset semantics.

### 6. Export manifests let the SDK stay independent of content definitions

Each public entry/global gets `internalLinks: [{sourceKey, area, pointer,
targetId}]` for its delivered declared references, in deterministic location
order. Areas are `fields` or `data`; settings produce no manifest locations.
Public authored fields, block data and settings stay unchanged. Single public reads
return only these local manifests and never fetch destinations. This is an
additive DTO property and an opt-in content-value grammar extension: generic JSON
transport still returns authored values. Consumers adopting the new grammar must
resolve URL field targets rather than assume every string is an href. Existing
manual URL content has the same values and meaning. Document this prominently
for external REST consumers and do not claim old renderers understand tokens.

All new build-export pages declare format 2 and require manifests, so old SDKs
reject before rendering. Keep tolerant format 1 consumer support for old fixtures
and servers without tokens; current API strict schemas emit only format 2.
The SDK keeps per-source manifests when traversing pages, including first-page
globals. No global target dictionary is copied onto every page.

Two range-scoped manifest queries extend the export's second read batch: routed
entries in the selected path range and first-page globals. They read projected
rows, not parse content JSON, and use no page-sized bind lists. Include manifest
size in page accounting; maintain the existing at-least-one-entry rule and the
same-version checks. Sources pointing to later-page targets resolve only after
the complete traversal. Target removal/publication already bumps published state,
so ETags and rebuilds need no reverse walk over incoming sources.

`PublishedSite` builds an ID-to-path map once. Reject duplicate source IDs across
entries/globals, duplicate/
inconsistent manifest locations, or location/token disagreement. Manifest
completeness is guaranteed/tested by the descriptor-based API producer; the SDK
does not import content definitions or guess references in arbitrary JSON.
Expose `link(value)` on site/entry/global with these structural outcomes:

```ts
type LinkResolution =
  | { state: "resolved"; href: string; targetId?: string }
  | { state: "unavailable"; targetId: string }
  | { state: "empty" };
```

SDK reuses portable primitives exported by contracts (which already depends on
content); it never imports content/render directly. It independently checks safe
manual/resolved hrefs and validates manifests as contracts. Resolution is O(1)
per reference after O(entries + locations) setup and performs no I/O.

Collect diagnostics once per newly assembled view: total unresolved occurrences,
first 100 ordered location details, `truncated`. Expose immutable
`site.linkDiagnostics` and optional loader `onLinkDiagnostics` callback, invoked
once per newly assembled export. Generated loaders log a bounded warning through
that callback; repeated page renders/static loader calls/304 responses do not
repeat it. No draft title, raw URL, credential or source JSON enters diagnostics.
Transport/grammar/consistency errors remain fatal. Missing IDs are recoverable.

### 7. Structural renderer integration and one Link block

`render` defines structural resolver/result types and adds `link` to block props;
SDK view objects satisfy that shape without an import edge. Entries/globals may
provide a resolver; manual-URL standalone rendering retains a safe local fallback.
An internal token without a resolver throws `missing_link_resolver` with block
context. Invalid input or unsafe returned href throws `invalid_link`.
Unavailable targets from a real resolver are data, not exceptions. Parse stored
data/settings before resolution; never delete a required field to simulate a
missing destination.

Update image/gallery/navigation/Hero/CTA source components to use `link()`.
Preserve labels, captions, menu descendants, current-page marking on resolved
paths, envelope and CSS hooks. Image/gallery unavailable targets use normal
unlinked image rendering, including enabled lightbox. Hero/CTA unavailable
actions retain their label in a label part without active-control styling.
Navigation unresolved children become labels; unresolved parents keep working
descendants/disclosure without a parent anchor. No raw token reaches aria labels.

Add `builtInBlocks.link`, version 1: `label` text required minLength 1/maxLength
200; `url` ordinary URL required; `appearance` select default button; `newTab`
boolean default false. Settings use the public scalar DSL, required/defaulted
as existing settings are. Both presentations render `<a>` when resolved, never
`<button>`. With newTab true add `_blank`/`noopener noreferrer`. Missing targets
render a plain label with no role/tabindex/click affordance. Root class `link`,
`data-lace-appearance`, block/key/anchor/class hooks, and `link`/`label` part hooks
let site-owned CSS style only active anchors. No new script or inline style.
Use one registry item, not a duplicated second Button definition.

The admin applies a local stable palette partition: non-Hero/CTA definitions in
their configured order, then Hero, then CTA. Do not reorder registry declarations
or allowed-block configuration to implement a UI preference; saved blocks and
configuration identity remain unchanged solely for palette ordering.

### 8. Ownership and integration map

| Boundary | Responsibility |
| --- | --- |
| content | Token grammar, field-target safety, descriptor walk/bounds, Link DSL |
| domain/application | Issues/errors, usage/status/impact ports, lifecycle and sync policies |
| db | Migration, projection SQL, indexed queries, Node atomic mutation guards |
| platform-cloudflare | D1 guarded batches/query accounting with the same semantics |
| contracts/server | Strict admin DTOs/routes/OpenAPI, public manifests, export format 2 |
| sdk | Validated traversal, immutable target map, link helper and diagnostics |
| render/astro | Structural helper propagation and contextual safety failures |
| admin | Shared nested URL control, batch status cache, impact dialogs, palette |
| registry/CLI | Link-aware source revisions/install locks, existing model-removal refusal |
| reference/create-lace | Installed source copies, loaders/CSS/examples/fixtures and packed acceptance |

No framework markup moves into packages. Upgraded source items declare compatible
render/adapter versions and follow conflict protection, including `.new` files.
Model versions advance only where allowed-block structures change; resolver
adoption alone changes item revision, not existing block schema versions.

## Risks / Trade-offs

- [Global graph revision conservatively refreshes unrelated dialogs] → Avoids
  per-target write amplification; explain refresh and preserve unsaved edits.
- [Authored tokens can leak through user-owned custom markup] → Format 2 blocks
  old SDK builds, maintained sources use the helper, explicit adoption guidance
  and HTML assertions cover shipped examples; arbitrary owner code is not rewritten.
- [Optional public manifests do not make old external consumers link-aware] →
  Document the new content grammar and coordinated adoption; no claim that a
  direct REST consumer can use a token as an href.
- [Confirmed removal changes link presentation] → Show exact consequences before
  acknowledgment; retain content and IDs for repair/republication.
- [Static releases lag CMS state] → Existing build pending/failed status remains;
  a failed build keeps the previous complete release and never rolls back CMS.
- [Many inbound usages] → Indexed keyset entity and location paging, EXISTS
  instead of eager totals, no requirement to load the entire set before confirmation.
- [Schema rewrites change outgoing references] → Existing bounded sync units
  maintain coherent locations and validate new published targets; populated-model
  removal stays prohibited.
- [Schema/data backup predates projections] → Supported upgrade order and matching
  backups; do not accept unsupported pre-migration engines writing token content.

## Migration Plan

1. Before implementation, update selected architecture/backlog planning context;
   do not synchronize these proposed deltas as accepted implementation yet.
2. Apply a forward migration for the reference table, graph row and title-prefix
   index on both runtimes. Existing manual content needs no data backfill.
3. Ship API/admin, contracts/SDK/render/Astro and CLI/source updates as one
   coordinated feature release. New servers emit format 2 even before tokens are
   authored, ensuring old build SDKs request upgrade. New SDK supports legacy
   format 1 only for compatible old servers/fixtures.
4. Update/install maintained source components through existing ownership guards;
   review custom URL-field markup and custom callers supplying renderable entries.
   Refresh generated loaders for diagnostics and add Link to selected starter models
   with correct model/template version increments and configuration sync.
5. Verify export/version/ETag changes and Node/Worker end-to-end builds before
   enabling editorial use. Deployments/npm publication are outside this proposal.
6. Rollback after token content exists requires matching pre-feature DB/config/
   source backups, or an explicit separately validated conversion of tokens to
   current manual URLs before rollback. Never strip tokens or downgrade SQL
   automatically. Rolling back only a site after API format 2 is unsupported.

No unresolved product/design decision blocks implementation. Exact migration
number and source item revisions are selected from repository state during apply
to avoid colliding with intervening work; their required behavior is fixed here.
