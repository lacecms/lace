# Content configuration

Part of the [Lace architecture](README.md).

## 8. Content configuration

The root `lace.config.ts` is the source of truth for content structure. It
declares the block registry and the content models with `definePage`,
`defineCollection` and `defineGlobal` from `@lacecms/config`; models are
defined in code and projected into the database ([ADR 0026](../adr/0026-code-defined-models-two-snapshots.md)). Definitions,
validation and examples are in [content-model-configuration].

The Worker and Node composition roots import `lace.config.ts` at build time;
the runtime never evaluates a TypeScript path supplied through an HTTP
request. The normalized configuration and its serializable admin projection
are created once during application startup. Arbitrary executable user code is
never serialized and sent to the admin application; descriptors and metadata
are detached, portable JSON ([field-descriptors]).

### Content-model kinds

`content_models.kind` is `page` (a singleton with one fixed path),
`collection` (any number of entries, each routed by its slug) or `global` (a
route-less singleton for site-wide content such as settings or a footer, read
by model key and never served by path;
[ADR 0010](../adr/0010-global-models.md)). `defineGlobal` accepts `key`,
`version`, `label`, `description`, `fields`, `blocks` and the sync hints, and
never has a `path`, `route`, `listFields` or `seo`.

Pages, collection entries and globals share storage, snapshot, block,
validation and publication behavior. Model keys are unique across all three
kinds, and the kind is part of a model's structure: sync refuses a change
between any two kinds, also through `renamedFrom`
([content-domain-rules], [configuration-synchronization]).

### System fields and routes

- `title` is required for every entry, also in drafts, because it is
  relational and needed by entry lists. A global's title is system-owned:
  saving a global stores the model label (or key) ([content-use-cases]).
- `slug` is `NULL` for pages and globals, and a global rejects a submitted
  slug. A collection draft may lack it; publication requires it.
- The admin may suggest a normalized slug, but the API validates submitted
  values rather than silently rewriting them.

The slug grammar, the canonical route rules (a collection route has exactly one
`:slug` segment; paths start with `/` and have no query, fragment or trailing
slash except `/`) and every identifier grammar are defined once and applied by
every layer ([content-domain-rules]). Configuration rejects duplicate page
paths, duplicate collection routes and a page path matching a collection route.
`published_routes.path` stays the final global uniqueness constraint: two
models can never publish the same path, and it also guards runtime collisions
and future route features.

### SEO metadata

Pages and collections may opt into a per-entry SEO system group with
`seo: true` or `seo: { description?, image? }` naming fallback fields; one
global may declare `seoDefaults` ([ADR 0011](../adr/0011-seo-system-group.md),
[content-model-configuration]).

- The group (`title`, `description`, `image`, `canonical`, `noindex`) is stored
  with each snapshot outside `fields`, so field keys never collide with it, and
  follows the draft and publish flow. Its rules are defined once
  ([content-domain-rules]); the API enforces the hard limits, the admin only
  recommends shorter text. Saving SEO for a model without it fails with
  `seo_not_allowed` at `/seo` ([content-use-cases]).
- Whether SEO is enabled is structural; the fallback mapping and `seoDefaults`
  are projection-only, and `seoDefaults` has no storage of its own. A model
  without the option carries no `seo` property, so its hashes are unchanged.
  Globals cannot declare `seo`.
- Fallbacks are resolved by the SDK at build time and never stored; every
  routable entry resolves, with or without SEO on its model
  ([published-site-loader], [astro-adapter]). The site URL comes only from
  `LACE_BUILD_SITE_URL`; Lace does not set Astro's `site` option.

### Field types

The field DSL supports text, textarea, rich text, number, boolean, date,
datetime, select, URL and media, plus the composites group and list
([field-descriptors]). Reference fields are not part of the product; the
field-definition union and validation visitor are exhaustive, so such a variant
can be added without changing existing encodings ([content-validation]).

`@lacecms/content` owns the frozen `fieldTypeCapabilities` declaration and
`FIELD_FILTER_OPERATIONS` ([field-descriptors]). Configuration, contracts,
application queries, persistence and the admin derive eligibility from them
and never copy lists of field kinds. The admin's total `fieldTypeSupport`
declaration owns presentation and messages for every kind; adding a kind
requires declaring both. OpenAPI derives scalar descriptor properties from the
same capabilities and documents provider restrictions and form layouts.

URL fields may declare `embedProviders` (`youtube`, `vimeo`). The restriction
is structural and validated locally by one shared parser; no provider metadata
is fetched and no raw iframe HTML is accepted ([video-embeds]).

### Internal URL links

Ordinary URL fields in model and global fields and block data, at any depth,
accept a canonical `entry:<URI-component-encoded-id>` destination besides
manual URLs ([internal-url-links], [guide](../internal-url-links.md)).

- No reference-field kind is introduced. Block settings keep their
  select/boolean/number/text allowlist and never hold references. Rich text,
  provider-restricted URLs and SEO canonical URLs keep their own grammar;
  manual URLs are never converted or repaired.
- Snapshots record indexed reference locations, and one graph revision is
  updated atomically with every lifecycle or schema mutation. Stored snapshots
  are never rewritten when a target moves or disappears.
- Drafts keep missing or unpublished targets; publication requires delivered
  targets to have published routes, except a self-reference. Hidden blocks'
  references stay tracked but are not delivered and never block publication.
  Deleting or unpublishing a target with published incoming links needs a
  current impact acknowledgment, which bypasses no authorization or singleton
  rule. Sync still refuses to remove a model while entries exist; there is no
  model-deletion command or impact override.
- A snapshot holds at most 200 internal-reference occurrences, separate from
  media references, including hidden blocks and defaults.
- One complete published export resolves IDs to paths at build time; rendering
  does no per-link database or HTTP read. Missing targets yield bounded
  warnings and non-navigating content; transport and consistency errors stay
  fatal. Build-export format 2 is the compatibility boundary, and new SDKs
  still read compatible format 1 exports ([public-sdk]). Authored public JSON
  stays as authored, so consumers resolve targets before writing hrefs.
- A D1 export page uses at most twelve read statements in two batches, within
  the D1 budgets of 50 statements per invocation, 100 binds per statement and
  40 statements per guarded mutation batch ([d1-content-repositories],
  [measurements](../verification.md#recorded-d1-budget-measurements)).

### Presentation metadata

These options change only how the admin presents content. They are portable
JSON validated before startup, in projection identity and excluded from
structural identity only at descriptor or owner positions, so content and
default keys with the same names stay structural. Changing them needs no
version bump, migration or content rewrite; sync still advances the published
version and requests a build ([content-model-configuration]).

- `placeholder` on text, textarea, URL, number, select and rich-text
  descriptors at every depth, including scalar list items; other kinds reject
  it. An empty string suppresses the admin's generic prompt
  ([admin-draft-editor] "Configured placeholders guide empty controls").
- `layout` (sections or tabs over immediate sibling fields) on models, block
  data and groups, and `settingsLayout` on block settings ([field-descriptors]
  "Visual field layouts are portable sibling metadata"). Layout creates no data
  objects or paths, changes no defaults, absence or validation, and excludes
  system title, slug, SEO and block envelope controls.
- `presentation: { control: "cards", choices }` on select descriptors, with
  plain-text labels and bounded schematic diagrams that explain composition
  rather than preview site styling. Option sets and defaults keep their
  structural rules.
- `itemLabel` on a list, naming an immediate text, textarea, select or URL
  child of its group item. Summaries use plain text and never show media IDs.
- `settingsVisibility` on blocks, over scalar settings
  ([block-settings-visibility]). Hidden settings keep their defaults,
  validation, permissions and public delivery. It never applies to model
  fields, block data, group or list items or envelope fields, which use
  conditional fields.

`listLayoutSettings()` exports the scalar settings `layoutMode`, `layoutWrap`
and `layoutPreset`, and `listLayoutSettingsVisibility()` shares their
visibility rules with any block ([list-layout]). Inactive values are retained,
submitted and validated unconditionally.

### Conditional fields

Models, group descriptors (including list-item groups at every depth) and
block data accept `visibility: { target: { field, values } }` with an
immediate sibling `select` or `boolean` controller ([conditional-fields],
[ADR 0018](../adr/0018-conditional-fields.md)).

- Every layer (validation, the published projection with block migration,
  internal links and render, configuration sync and the admin) decides
  visibility through `effectiveVisibilityValues` and `isFieldVisible` from
  `@lacecms/content`, which own default, cleared (`null`) and absence
  handling. Stored controllers never hold `null`.
- Drafts retain hidden values and their defaults. Hidden targets are validated
  with draft semantics: never required, but still type-, safety- and
  maximum-checked ([content-validation]).
- Publication stores the published projection, which removes hidden targets
  recursively without changing list shape. Published media and internal-link
  references derive from it, so public, build-export and published admin or
  MCP reads never carry hidden values, and published value types make targets
  optional.
- The server enforces the rules on every write path; the admin only presents
  them ([admin-draft-editor]). Rule metadata crosses REST and OpenAPI as
  validated JSON.
- Rules are structural: a model version increase, or for block data a block
  definition change. Sync prunes newly hidden published values in its guarded
  mutation and checks newly visible published occurrences
  ([schema-evolution]). Global `seoDefaults` must not name a conditional field.

### Bounded composite fields

`field.group({ fields })` describes a plain object and
`field.list({ item, minItems?, maxItems? })` an ordered array of one scalar or
group definition, in model fields and block data
([ADR 0013](../adr/0013-bounded-composite-fields.md)).

- Composites create no nested blocks, routes, item IDs or lifecycle; top-level
  blocks stay flat ([block-registry]).
- Definitions are finite, detached JSON of bounded depth (six containers per
  branch, two consecutive groups, no list directly in a list) with list bounds
  from 0 to 100 ([field-descriptors]). Draft and publish semantics apply
  recursively ([content-validation]).
- A normalized snapshot holds at most 500 list elements across fields and all
  block data, including hidden blocks and defaults, with separate draft and
  published budgets; the JSON byte and 200-media-reference caps still apply.
- Scalar-only encodings and hashes stay stable. `listFields`, SEO mappings and
  block settings stay restricted to root scalars.
- Sync extends recursively to group children and list items through
  sibling-key `renamedFrom` and schema-pointer `removedFields` such as
  `/links/*/legacy`. It never moves values across parents, uses indexed hints
  or converts types implicitly, and refuses media-bearing backfills
  ([content-model-configuration], [schema-evolution]).

### Built-in blocks

The registry ships `hero`, `richText`, `image`, `quote`, `cta`, `gallery`,
`navigation`, `videoEmbed` and `link`, defined only through the public block
and field DSL and without special database treatment. Their fields, settings,
versions and migrations are in [block-registry], their markup in
[block-source-registry] and player behavior in [video-embeds]. Video-file
uploads are excluded. Projects may define additional blocks in
`lace.config.ts`; custom blocks use the generic metadata-driven admin form, and
custom React admin editors are out of scope.

### Content limits

Shared constants enforce the same limits in configuration validation, REST
validation and the admin UI: entry title, slug, top-level blocks, media
references per entry and the 1,000,000-byte cap on `fields_json` and on each
block's `data_json` ([content-validation] "Shared entry payload limits"), plus
the transport bounds for search terms, media usage reads and build-export
pages ([content-domain-rules]). `@lacecms/content` owns them
(`MAX_ENTRY_SEARCH_LENGTH`, `MAX_MEDIA_SEARCH_LENGTH`,
`MAX_MEDIA_USAGE_ENTRIES`, `MAX_BUILD_EXPORT_PAGE_SIZE`); application and
contracts re-export them, application also as `MAX_CONTENT_ENTRY_SEARCH_LENGTH`.
Runtime entry-query limits stay separate and are narrower on Cloudflare
([collection-query-options]). Field definitions may set stricter limits. The
conservative JSON limits leave room below D1's row and string ceiling and keep
the browser editor from creating payloads the runtime cannot persist.

Validation has explicit `draft` and `publish` modes: drafts reject invalid
present values, unknown keys, unsafe content and size violations but may lack
required fields; publication also enforces them and the collection slug
([content-validation]).

### Configuration projection

The API loads the executable configuration and exposes a serializable
projection to the admin. The database stores model identity and
synchronization metadata, never a second authoritative copy of the field
definitions ([ADR 0026](../adr/0026-code-defined-models-two-snapshots.md)). The explicit command `pnpm lace content sync`
creates model records, updates labels, versions and hashes, detects removals
and renames, refuses to remove a model while entries exist, and reports
incompatible changes; `--check` is a non-mutating dry run for CI
([configuration-synchronization]). Sync never guesses a rename or silently
transforms content.

**Identity.** Every model has an integer `version` starting at `1`. A
structural change to fields, allowed blocks, path or route must increment it;
display-only changes do not. `structure_hash` excludes display metadata (the
`label` and `description` of model, field and block definitions, and every
option called projection-only here); `projection_hash` covers the complete
serializable projection. Field keys and default values stay structural even
under those names. A changed structure hash without a version bump fails
([content-model-configuration]).

**Collection list metadata.** `listFields` names root scalar fields shown as
admin list columns; `listOptions` enables sorting, filtering and searching on
up to 16 root fields per operation, may target fields absent from
`listFields`, and is rejected on pages and globals
([content-model-configuration], [collection-query-options]). Both are
projection-only. An internal `publicProjectionHash` omits only `listOptions`,
so query-only edits neither advance published state nor request a build when
a trusted baseline proves the public projection unchanged; without such proof
sync rebuilds once conservatively ([collection-query-options] "Query metadata
synchronization uses a guarded public identity").

**Model renames.** A model's temporary `renamedFrom` key is applied only when
the previous key exists, the new one does not and the kind is unchanged;
otherwise a key change is an addition plus a removal refused while entries
exist.

**Schema evolution.** Sync keeps each model's canonical structure from its
last successful run as non-authoritative metadata (section 9.1), compares it
with the configured structure and classifies every difference
([ADR 0007](../adr/0007-schema-evolution-during-sync.md), [schema-evolution]):

| Class | Examples | With existing snapshots |
| --- | --- | --- |
| compatible | add a field, relax a constraint, change a default, allow a block type, enable SEO | apply; backfill declared defaults |
| display | reorder select options or the block allowlist | apply |
| validated | tighten a constraint, optional to required | apply only if every stored value satisfies it |
| destructive | remove or rename a field, disallow a block type, disable SEO | apply only when no snapshot holds the data, or with an explicit hint |
| migration | change an allowed block's definition | apply when no snapshot holds the block type; otherwise needs a block version increase and migrations |
| breaking | change a field type, path or route | refuse (path or route: while published) |

A required field added without a default is accepted: published snapshots stay
valid as published, and each entry's next publication enforces it.
Data-dependent decisions read snapshots in bounded pages, and apply rejects
the plan when any snapshot changed after planning. Backfill never changes
revisions, audit actors or timestamps; media defaults are never backfilled. A
model with snapshots but no valid baseline refuses structural changes until
the operator restores the previous definition, synchronizes once to record a
baseline and then applies the change.

**Destructive hints.** A model field may declare `renamedFrom`, a model
`removedFields` and `removedBlocks`, and a page or collection that disables SEO
`removedSeo: true`; block fields cannot declare `renamedFrom`. Hints are
excluded from the structure, both hashes and the public projection, take
effect only when the structure changed, and are checked against the baseline.
In the guarded mutation that records the model, sync moves renamed values,
prunes removed fields and blocks and updates `content_media_references`, so
media usage and the deletion guard stay correct, without changing revisions,
audit actors or timestamps ([schema-evolution] "Hinted destructive changes
move or prune stored data"). All hints, including model `renamedFrom`, are
removed from configuration once every environment has synchronized.

**Block migrations.** A changed block definition bumps its `version` and
declares `migrations` (section 11), and every model that allows the block
bumps its own version. Sync runs the composed migrations in memory and
validates every result during planning, so `--check` is a full dry run; any
missing step, failure, invalid result or stored version ahead of the
configuration refuses the plan without writing. Apply rewrites stale blocks
in guarded resumable units of one entry without changing entry status, then
prepares the plan again before the final guarded mutation ([schema-evolution]
"Stale blocks are rewritten in guarded resumable units"). The render core
never migrates data.

**Public state and singletons.** When a successful sync changes the
configuration visible to public consumers or rewrites a published snapshot,
it increments `published_state.version` and requests one build in the same
atomic mutation. Sync also ensures that every page and global model has one
singleton entry, titled with the model label, with a `NULL` slug, configured
defaults, no blocks and the actor `system:content-sync`
([configuration-synchronization] "Synchronization creates page singletons and
advances public projection state"). Collection entries are created only
through the admin or API and require an initial title.

[admin-draft-editor]: ../../openspec/specs/admin-draft-editor/spec.md
[astro-adapter]: ../../openspec/specs/astro-adapter/spec.md
[block-registry]: ../../openspec/specs/block-registry/spec.md
[block-settings-visibility]: ../../openspec/specs/block-settings-visibility/spec.md
[block-source-registry]: ../../openspec/specs/block-source-registry/spec.md
[collection-query-options]: ../../openspec/specs/collection-query-options/spec.md
[conditional-fields]: ../../openspec/specs/conditional-fields/spec.md
[configuration-synchronization]: ../../openspec/specs/configuration-synchronization/spec.md
[content-domain-rules]: ../../openspec/specs/content-domain-rules/spec.md
[content-model-configuration]: ../../openspec/specs/content-model-configuration/spec.md
[content-use-cases]: ../../openspec/specs/content-use-cases/spec.md
[content-validation]: ../../openspec/specs/content-validation/spec.md
[d1-content-repositories]: ../../openspec/specs/d1-content-repositories/spec.md
[field-descriptors]: ../../openspec/specs/field-descriptors/spec.md
[internal-url-links]: ../../openspec/specs/internal-url-links/spec.md
[list-layout]: ../../openspec/specs/list-layout/spec.md
[public-sdk]: ../../openspec/specs/public-sdk/spec.md
[published-site-loader]: ../../openspec/specs/published-site-loader/spec.md
[schema-evolution]: ../../openspec/specs/schema-evolution/spec.md
[video-embeds]: ../../openspec/specs/video-embeds/spec.md
