## Context

The [proposal](proposal.md) and [ADR 0034](../../../docs/adr/0034-acyclic-entry-reference-fields.md)
cover the product decision. Today `posts.author` in `lace.config.ts` is text.
CE10 tracks URL fields by snapshot and pointer, its picker infers routability
from published routes, and a reviewed URL usage can survive withdrawal. The
application already normalizes a candidate, projects conditional values and
commits a shared write plan using SQLite transactions or guarded D1 batches.
The SDK assembles immutable routed entries and route-less records after the
last export page. PV1 overlays exactly one routed target on its frozen input.

## Goals / Non-Goals

Keep one authored value per occurrence, one integrity policy across writers,
and one lookup implementation for public and preview renderers. A direct
usage must be actionable even when the source's draft has moved ahead of its
publication. Inverse fields, arbitrary template usage discovery, restoration
of deleted entries, multi-entry transactions for editors, and auto-publishing
a related entry are outside the change.

## Decisions

### 1. Model identity and editor values

```ts
const postFields = {
  author: field.reference({ models: ["authors"], required: true }),
}

const serviceFields = {
  reviews: field.list({
    item: field.reference({ models: ["testimonials"] }),
    maxItems: 3,
  }),
}
```

`@lacecms/content` owns the scalar, inferred string value, field capabilities
and descriptor-aware traversal. `config` checks target keys against the full
model registry, including nested and registered block data after definitions
are collected. Sort the nonempty, distinct allowlist for structural identity.
Entries own their globally stable IDs. Slugs, titles, model keys and copies of
the selected data therefore stay out of authored values. String values gain
reference semantics only at a declared reference leaf. A list remains an
ordinary list, including its ordering, limits, duplicate operation and
repeated IDs. A required nonempty collection uses `required: true` and
`minItems: 1`. One model may target its own model.

Keep list columns/queries, SEO mapping, visibility controllers, block
settings, provider URLs and rich text within their existing supported kinds.
Count individual URL and data-reference occurrences against a shared ceiling
of 200 per normalized snapshot, alongside the existing separate media, list
and byte budgets. Repeated targets count per location. Defaults must pass the
same checks when materialized as submitted values. A second `multiple` encoding
would duplicate the list DSL, editor operations and migration rules.

### 2. Project occurrences and guard two graphs

Add a checked purpose column (`url` or `reference`) to
`content_entry_link_references` with the legacy default `url`. Keep the
source-snapshot foreign key and its cascade. A target foreign key would
prevent retaining an orphaned selection for repair. Index snapshot/purpose
for outgoing adjacency and target/purpose for impact. Keep location identity
as snapshot, block key or `$fields`, area and relative JSON Pointer. Diff
purpose, target and visibility as well as location when projecting a write.
Use the current draft/published pointers to select each graph:

| Operation | Candidate replaces | Other vertices | Edges included |
| --- | --- | --- | --- |
| Save, create, duplicate or revert | Source's saved draft | Current saved drafts | All retained typed occurrences, including hidden fields and blocks |
| Publish | Source's publication, if any | Current publications | Delivered typed occurrences after field and block visibility |
| Create preview | Target in a read-only candidate view | Captured publications | Same visible-target and cycle checks as publication |

Graph vertices are **entry IDs**. Collapse repeated targets for reachability
only. For a single candidate, remove its old outgoing edges, apply its proposed
edges and check whether any newly added target can reach the source. A
self-edge is an immediate cycle. Existing DAGs remain acyclic on removal or
reorder alone. For a coordinated schema rewrite, overlay every replacement
in the atomic unit. Each committed resumable block-migration unit must also
preserve both graphs. Never build the union of draft and published edges.

Batch target identity/model/existence checks and use indexed recursive SQL
with deduplicated node IDs for reachability. Avoid enumerating all paths through
a diamond. Read evidence against a graph revision and guard that revision in
the shared write admission, or perform the equivalent predicate in the atomic
command. Also bind the current config, source revision, target existence and
publication state wherever those facts affect the decision. Every competing
mutation affecting the proof or reviewed impact must invalidate it. A graph
revision alone does not prove a leaf target still exists. On drift, revalidate
or return a retryable conflict. A diagnostic witness can be read separately
against the same revision. Use a limit of 2,048 distinct IDs reachable from
newly added target IDs per changed source and phase on both adapters. For an
acyclic case use a 2,049th distinct ID as an overflow sentinel. The
per-snapshot occurrence cap also bounds adjacency reads per visited ID.
Removal-only and order-only updates need no new reachability proof. Include up
to 16 IDs of a deterministic witness with an omission marker for a longer
cycle. A budget failure carries its own actionable issue. Exercise these
initial engineering limits in REL1B and revise the plan if evidence warrants
changing the observable thresholds.

Emit path-addressed issues with one deterministic witness. For a rejected
publication, compare its blocking published edge with the source's saved,
visible draft projection. If publishing A removes the blocker, identify A by
ID and display title as the next correction. When more blockers remain,
explain the next verified step without promising that one publication fixes
all of them. A genuine cycle that also exists in the intended content needs
an edit. The write must not change snapshots, revisions, public state, preview
validity, idempotency outcome or outbox on rejection.

### 3. Direct impact and removal

Read incoming locations from the typed-purpose index. Group by source and
phase and page both sources and locations. The source that selected the
target owns the correction. For Page → Review → Anna, Anna's blocker is the
review's author field. Reading every path to Page would give the editor an
irrelevant task and cannot discover arbitrary Astro reads.

Use separate reference picker, batch-resolve and impact contracts. In the
picker take publication state from the published snapshot pointer. The
existing CE10 catalog's route-based inference would mislabel route-less
published testimonials. Use authenticated title-prefix search, cancellation,
cursor continuation and editor-wide batched status resolution. Preserve CE10
URL-manifest and route-removal queries by filtering for URL purpose.

For delete or unpublish, evaluate direct delivered published occurrences
inside the guard. Any such typed occurrence blocks removal unconditionally.
For delete, surviving draft uses require explicit acknowledgment bound to the
observed graph, actor, action, target and revision. The existing URL receipt
has a different purpose. If both reviews apply the client supplies both in the
same guarded operation. Hidden-only published locations are informational.
Unpublishing preserves target identity and needs no typed draft deletion
confirmation. Preserve existing permissions, singleton restrictions, target
preconditions, idempotent replay and atomic public-state/build effects. A
source's stale pointer to a deleted target is repairable on an unrelated save.
New uses of an absent ID must be rejected. Use the prior snapshot and
descriptor context to distinguish retention, including legitimate reordering,
from insertion. Never synthesize a title or attach an old ID to a different
entry with the same slug.

Impact navigation carries source identity, phase/snapshot, block key, field
pointer and expected target. Reuse the editor's existing error-focus path to
open tabs, sections and collapsed blocks. Compare the current draft value
before focusing a list index. When a newer draft already removed the link,
explain why the publication is still blocking and offer the ordinary publish
workflow to an authorized user. Protect unsaved edits during navigation.

### 4. Export, blocks and preview

Keep format 2 and the authored opaque strings in public JSON. No extra
target copies or typed relations in `internalLinks` are needed. Build one
ID map after complete, version-bound traversal in
`packages/sdk/src/site/site-view.ts`. Check identity collisions. Expose
`site.reference(id)` as a single synchronous lookup returning an immutable
routed entry or route-less record, or `undefined` for an unknown selection.
Mapping an ordered list across this method preserves positions and repeated
IDs. The consumer chooses the next hop. Eager recursive expansion duplicates
data and pressures page, preview and transport budgets.

Pass a structurally typed lookup through render-core's `RenderableEntry` and
block props to site-owned components. Keep render independent of the SDK and
existing callers that supply a minimal entry usable. `publishedAt` and path
follow each existing view's contract. Fields continue to be site content
JSON; this change does not generate per-model public TypeScript classes.

PV1's admission validates the candidate against the current public graph
before replacing any ready generation. Require the admitted public version
and capture epoch for sealing. Use the same site view assembler for the
single-draft overlay and frozen published targets, never a lookup against
the live admin API. Existing media authorization and invalidation continue
to apply. A different author's later publication changes subsequent public
builds while an already-ready preview keeps its captured data.

### 5. Schema evolution and import

Sync compares allowlists as sets. Widening is compatible. Narrowing requires
checking retained occurrences against the new models, with bounded evidence
for refusal, including unresolved IDs whose eligibility cannot be proven.
Treat a hinted target-model rename as the existing logical model in the
comparison and validate the final registry. Field renames, pruning, defaults
and block migrations rederive typed occurrences and preserve the graph in the
same guarded units as snapshot data. Keep legacy URL checks when dropping a
route. Projects migrating an existing text author can introduce a new field,
explicitly map authors to entries and retire the old field through sync.

Check both the final overlay and the sequence of whole-entry block migration
units before any write. Each unit must be admissible in both phases against
the state left by its predecessors. D1 packing follows the same proof as
SQLite. For example, if drafts contain A → B and publications contain B → A,
a migration that reverses both graphs can leave an acyclic final overlay
while either first entry creates a cycle in one phase. Refuse that plan in
`sync --check` with the offending entry, phase and location. Ask the
operator to split the migration into stages that remove the blocking
dependencies before adding their reverses. Apply rechecks the scheduled
units and the final overlay against current data, including on restart.

For `lace import`, use the descriptor to convert a package `$entry` key to
either a raw target ID or a canonical URL token. Validate package-known
cycles even in draft-only import. Simulate draft saves and publications
separately using their starting state and final candidates. In a reversal,
schedule removal before introduction in each phase. Omit not-yet-created
targets in initial creates as the importer already does. Restrict remote reads
to allowed operations. Plan package-detectable failures before the first write.
The authoritative guarded server command still handles external dependencies
and concurrent changes. Preserve the state file and resumable/idempotent
behavior on a partially completed run.

## Risks / Trade-offs

- High fan-out or long paths can exhaust a runtime budget. Deduplicate
  visits, use set-based reads, cap witness data and measure complete Worker
  invocations including auth and dispatch (50 statements, at most 40 in one
  guarded mutation batch and 100 binds per statement). Measure successful and
  refused writes and publish the graph-work limit and recovery guidance.
- Two concurrent edits to different entries can close the same cycle.
  Interleave them across independent connections, exercising both commit
  orders. Fault-inject after projection changes and prove rollback on both
  adapters. A title-only save must have zero occurrence/revision writes.
- Publishing a new route-less review for a preview can immediately affect an
  existing whole-collection listing. Document that editorial sequence and
  show the selected target's status in the editor.

## Migration Plan

1. Add a forward migration following `0005_preview_capture_fence.sql`, update
   the Drizzle metadata and drift/upgrade checks, and exercise it on populated
   supported SQLite and D1 schemas. Existing rows are URLs, so the typed
   graphs start empty. Preserve public version, builds and authored JSON.
2. Upgrade the engine/admin and SDK/render/Astro together for sites opting
   into the new descriptor. A site without reference fields retains its
   existing config identity, wire format, list ordering and URL behavior.
3. Add the field, increase the appropriate model/block versions and use
   `content sync --check` before applying through the existing workflow.
   Roll back by restoring matching database backup and application/site
   artifacts. Older writers cannot maintain typed edges on a migrated DB.
