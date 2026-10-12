## Context

See `proposal.md` for scope and motivation. Discovery on main (`47d0f01`):

- `packages/content/src/index.ts` defines a scalar discriminated union, an exhaustive visitor and scalar `validateFieldValue`; `validateModelFields` applies only top-level defaults. `toFieldMetadata` currently checks JSON portability rather than fully validating a descriptor. Block validation already chooses draft mode for hidden blocks.
- `packages/config/src/index.ts` normalizes fields through that metadata function. `fieldMapStructure` removes display properties only at the first field level; blindly deleting properties recursively would corrupt defaults and child fields named `label` or `description`.
- `packages/contracts/src/index.ts:isFieldMetadata` rebuilds scalar descriptors and compares canonical JSON. Content DTO values already use recursive JSON.
- `ContentUseCases.collectMedia` and the migration collector in `configuration-migration.ts` inspect only immediate media fields. The relational projection's primary key is `(snapshot_id, source_key, field_path)`; its path is unrestricted TEXT. Existing usage DTOs call it `field`.
- Migration scans currently load data only for target block types, and no model fields. That is insufficient to enforce a snapshot-wide list budget after a block migration.
- SQL copy operations already copy JSON and references set-wise. D1 has guarded atomic batches, a 100-bind ceiling and a 50-query maximum save budget. These invariants stay.
- The admin's renderer registry and field-problem switch assume the closed scalar union; loading composites without adapting these consumers would fail or lose values. Generic nested editing is CE7C.

The accepted architecture §8 is scalar-only. The first apply task explicitly updates it and adds an ADR before production code. Accepted specs are changed only through later synchronization of verified deltas.

## Goals / Non-Goals

**Goals:** one portable definition/value traversal shared by server and render validation; plain objects/arrays without an item envelope; exact leaf locations; bounded work and atomic reference replacement; stable legacy encodings and scalar hashes.

**Non-Goals:** automatic conversion of stored scalars; general nested evolution/hint syntax; editable composite browser controls; built-in Gallery/Navigation or starter changes. Budget validation of block migrations is in CE7A because introducing composites without it permits oversized stored content; CE7B builds recursive evolution on that foundation.

## Decisions

### 1. Public descriptor and type contract

Use the same single-options-object style as `field.select`:

```ts
field.group({
  fields: { heading: field.text({ required: true }), image: field.media() },
  required: false,
});
field.list({
  item: field.group({ fields: { label: field.text({ required: true }), href: field.url() } }),
  minItems: 1,
  maxItems: 20,
});
```

Normalized group metadata is `{type: "group", required, fields, ...common}`;
list metadata is `{type: "list", required, item, ...common, minItems?, maxItems?}`.
Omitted limits remain omitted in metadata; effective min/max are 0/100. Group
maps reuse the existing ASCII-letter followed by letters/digits field-key rule.
Empty group maps are permitted, matching existing empty field maps. Lists
accept any current scalar (including rich text and media) or a group. A list
element descriptor's `required` does not make an array position optional: every
position must contain a value. Arrays are dense; null and undefined elements
are invalid even if the item has a default.

Extend `FieldDefinition`, `FieldValue`, `FieldIsRequired`, model inference,
`BlockDataValues`, visitor and render type tests. Nested group properties use
the current required-or-default inference; readonly arrays retain their item
type and literal select choices. As today, this describes normalized declared
values; draft validation can return incomplete required data. Do not introduce
an inaccurate claim that every saved draft is publish-complete.

Descriptor normalization recursively checks exact options, portable plain data,
child definitions, constraints and defaults, and produces detached frozen data.
Check ancestor identity to reject cycles while allowing a shared acyclic child.
Validate again at config/block/contract boundaries, including descriptors forged
through JavaScript or JSON, so builders are not the only protection. Never
evaluate accessors; reject accessors, host objects and non-portable options as
the current portable-options contract does. Use bounded traversal before deep
copying forged descriptor graphs to avoid recursion overflow.

Temporary `renamedFrom` on a root model field keeps its current behavior;
reject it in group children/list item descriptors until CE7B defines nested
hints. Block data rejects it at every depth, retaining versioned migrations.

Alternative: positional builder arguments or arbitrary recursive schema
callbacks. Rejected because they complicate the portable descriptor contract
and admit unsupported recursion.

### 2. Schema bounds and normalized value semantics

One descriptor traversal carries total container depth and consecutive-group
count. Each group/list adds one depth; scalar leaves and model/block roots add
zero. A group adds one consecutive group; a list resets that count. Depth ≤6,
consecutive groups ≤2, and a list's immediate item cannot be a list. Schema
failures name the descriptor path before application startup. List constraints
are integers `0 ≤ minItems ≤ maxItems ≤ 100` using effective omitted limits.

Use one recursive field normalization engine with mode and path, exposed to
model, block, aggregate and standalone field validators. A standalone field
schema/value validator uses publish semantics by default; internal/browser
draft validation explicitly selects draft mode. Keep scalar results and codes.

| Input | Draft | Publish |
| --- | --- | --- |
| Absent optional composite, no default | absent, no descent | same |
| Absent required composite, no default | absent | `missing_required_field` at container |
| Absent composite with default | clone default, then recurse | same, with publication checks |
| Present group `{}` | child defaults; missing required children permitted | child defaults; missing required children rejected |
| Present list `[]` | valid | valid unless `minItems > 0` |
| Required list `[]`, no positive minimum | valid | valid: required means presence |
| Present wrong type, null, unknown child | reject | reject |
| Present list below minimum | valid | reject at list |
| Present list above effective maximum | reject | reject |

Absent optional containers do not materialize themselves from descendant
defaults. Present values override defaults: `{}` and `[]` never select the
container default. For present group items, apply child defaults recursively.
Do not replace null, holes or undefined array elements with defaults. Preserve
existing scalar empty-string semantics and scalar present-value constraints.

Composite defaults are finite portable values validated with recursive draft
semantics at definition time, including safety checks on present scalar leaves
and maxima. Partial group defaults and below-minimum list defaults are allowed
as draft starting values; publication must still enforce required/minimums.
Existing scalar descriptor default rules stay unchanged. Media existence stays
an application check when a default becomes actual content.

Retain typed path segments internally, with indices as numbers; REST encodes
RFC 6901 JSON Pointers, e.g. `/blocks/0/data/images/2/image`. Use
`invalid_field_value` for wrong container/leaf types, `unknown_field` for
unknown children, `missing_required_field` for absence, `list_too_short`,
`list_too_long`, and `too_many_list_items` for the new bounds.

### 3. One budget for each resulting snapshot

Export shared limits from `content`: 6 containers, 2 consecutive groups, 100
items/list, 500 list elements/snapshot. Count descriptor-guided list lengths
after recursive defaults. Count all model fields plus every block's data,
hidden blocks included. For 10 groups with 20 links each, the outer and inner
lists consume 210. Rich-text arrays, block arrays and scalar select choices
consume none. Count draft and published independently; no installation-wide
counter. Aggregate overflow reports `too_many_list_items` at the first list
that crosses the deterministic fields-then-block-order traversal budget.

Reuse a traversal context for aggregate normalization; standalone field/block
validation also caps its own list total at 500. Recheck normalized JSON bytes
for fields and each block after defaults (current block size checking occurs
before normalization), retaining the 1 MB bounds. Count media occurrences,
not distinct IDs, toward the existing 200-reference budget, including SEO.

For migration planning, extend the portable snapshot scan shape to include
model fields and every block's data needed to count unchanged composites.
Overlay all migrated/default-normalized block results and validate the total
before creating the per-entry guarded write. The common list counter walks
actual composite arrays without counting rich-text document arrays. Preserve
grandfathered required fields in existing published model data: CE7A budget
checks must not retroactively republish or validate unrelated old required
content. Migration results retain current visible-publish/hidden-draft rules.
Keep bounded entry pages and chunked reads; no query per list item. A failed
budget check produces `BLOCK_MIGRATION_INVALID` evidence and writes nothing
for that entry; previously committed resumable units keep their existing rules.

Alternative: a counter per block, or generic counting of all JSON arrays.
Rejected because the former bypasses the entry cap and the latter counts rich
text and unrelated transport structure.

### 4. Media paths and atomicity

Add a pure content traversal returning media IDs and typed relative paths
from normalized values and descriptors. The application converts IDs to domain
IDs, checks active metadata in a batched unique-ID read, enforces 200 locations
and encodes projection paths. Reuse this traversal in content saves and block
migrations; adapters never guess media IDs from arbitrary strings.

- A root scalar media path remains `cover` or `image`, byte-for-byte.
- Any nested path is an RFC 6901 pointer relative to its source, e.g.
  `/contact/photo`, `/images/0/image`, or `/images/0` for a media list.
- Keep `$fields`, `$seo`/`image` and block keys unchanged. Field-key grammar
  excludes `/` and numeric-leading names, so pointer strings cannot collide
  with legacy roots; numeric tokens unambiguously identify list indices.
- Media usage `field` carries that exact path. The admin displays a readable
  location such as `Images › Item 1 › Image`; the stored path stays zero-based.
  Labels are derived by traversal where metadata is available, otherwise keys
  and one-based item positions, never by treating the entire pointer as a key.

A save replaces all references of the draft in the existing atomic mutation.
Reordering updates indices; removing an item removes only its draft locations.
A remaining published location still prevents deletion. Publication, revert
and duplication copy nested JSON and reference rows using existing set-based
operations; duplicate renews block keys and remaps source keys as today.
Nested list items gain no stored IDs. Current media metadata-build semantics,
including references held by published hidden blocks, remain unchanged;
public dictionaries and media eligibility still exclude hidden-only references.

No SQL schema change: paths already use TEXT. Test existing path validation
and DTO assumptions before relaxing them; retain constraints for legacy roots.
Keep D1 ≤100 binds/statement and ≤50 queries at existing caps, even with 500
list elements and 200 nested media locations. Failure injection proves no
partially replaced JSON or references; stale revision/media races keep their
current portable errors and retry behavior.

### 5. Metadata, identity and CE7B boundary

`config` and `contracts` reuse recursive content normalization and exact
canonical metadata checks. Preserve root-only scalar `listFields` and SEO
fallback/default mappings. Keep settings restricted to text/number/boolean/
select with defaults, refusing composites. OpenAPI must document recursive
descriptor alternatives explicitly if the generator cannot represent a custom
Valibot predicate; generic recursive JSON value schemas remain appropriate
for content values, with model-specific checks in the application.

Canonical structure traverses descriptor positions only (`fields` and `item`),
strips label/description at each descriptor and preserves every key in
`defaultValue`. Scalar-only structure/projection fixtures must remain identical,
including legacy hash recognition. Recursive canonicalization is necessary
now to keep nested display metadata projection-only; CE7B owns recursive
structural comparison and rewrite classification.

Interim sync rules: new models may declare composites; unchanged composites
and nested display-only changes synchronize normally. A new optional root
composite without a default can be added with the required model version bump,
because existing snapshots need no rewrite. Until CE7B, any other model-field
structural change involving composites on a model with snapshots is refused
with an explicit report that nested evolution is not supported yet. This
includes default backfill/change, constraint tightening, composite root
rename/removal and scalar/composite conversion; do not let the scalar
classifier accidentally allow an unsafe rewrite. Models without snapshots
follow current structural/version rules. Existing scalar-only changes retain
CE1 behavior. Versioned block migrations into composites remain supported,
using the checks above and the existing previously-referenced-media rule.

Alternative: silently reuse scalar backfill/rename SQL. Rejected because it
does not rebuild descendant media locations or validate aggregate budgets.
CE7B will replace these explicit transitional refusals with recursive support.

### 6. SDK, render and admin compatibility

SDK transport retains plain nested JSON and media IDs on every existing page,
collection, global and export surface. `site.media`, entry media helpers and
render `image(id)` resolve nested IDs through the same published dictionary;
SDK does not import content or render. Render reuses recursive block publish
validation, returns inferred nested props, keeps exact numeric leaf paths and
continues skipping hidden blocks before resolution.

Register explicit interim group/list inspection in the admin: labeled read-only
JSON values and a concise indication that composite authoring is pending.
These are a compatibility bridge, replaced by CE7C. Do not reuse a text input,
coerce values, omit descriptors or crash the renderer. Existing scalar editing
continues; load/save, dirty detection, discard, conflict JSON, revert and block
copy preserve nested objects and arrays. Do not strip empty arrays/objects or
recursively apply the admin's scalar-clearing convention to composite data.
Draft validation uses draft semantics so required descendants and minimums do
not block saving; publication errors may use the enclosing composite summary
until CE7C adds leaf focus. This small interim behavior is an explicit delta
to the editor capability, not an early implementation of CE7C.

## Risks / Trade-offs

- Recursive TypeScript types can exceed compiler instantiation limits → use
  interfaces for the broad recursive union and precision at builder generics;
  verify depth-six fixtures and render props without widening to `any`.
- Defaults can multiply data or references → detached finite definitions,
  bounded traversal, normalized bytes, aggregate list and media budgets.
- Descriptor-level display stripping can corrupt content defaults → dedicated
  descriptor walker and pinned scalar/default-key identity fixtures.
- Migration scan expansion increases read volume → bounded pages, set-based
  reads, D1 budgets, no interactive transactions or per-item fetches.
- Interim admin inspection and model evolution restrictions are visible →
  document CE7A's boundary; CE7B and CE7C retain their own session units.

## Migration Plan

Apply architecture/ADR changes first, then shared definitions/validators,
configuration and transport, application/repositories, render/SDK/admin and
verification tasks. Deploy matching engine/admin/site dependency versions
together before adopting composite configuration. No DB migration, registry
revision or starter ownership bump is needed for CE7A.

Scalar-only installations require no data rewrite. Adopting composites on a
new model uses normal sync; the supported optional root addition needs a model
version bump. Rollback after composite data is stored requires restoring the
prior configuration and a matching database backup or completing an explicit
validated data conversion; an older scalar-only validator cannot consume the
new descriptors. Document the union source compatibility change and the sync
restrictions in `docs/compatibility.md`.
