# Configuration synchronization planner

Step 6A provides the portable, non-mutating decision layer for reconciling
normalized `lace.config.ts` models with persisted model identities. It is shared
application behavior; the executable `lace content sync` command and its
atomic write path are introduced later.

The planner emits operations in stable key order:

- `create` creates a previously unknown model identity;
- `label-update` changes only the serializable display projection;
- `version-update` accepts a version increase, including a structural change
  when the model has no snapshots;
- `rename` requires a valid explicit `renamedFrom` key and compatible kind;
- `remove` is safe only for a stored model with no entries;
- `blocked-removal` and `incompatible-change` are never executable.

Invalid plans name a stable diagnostic code and affected model key. They cover
kind changes, version regressions, structural changes without a version bump,
structural changes with draft or published snapshots, unsafe removals, and
missing or ambiguous rename evidence. The planner never infers a rename from a
create/removal pair.

The same canonical plan produces deterministic human text and JSON reports.
Its check result is zero only for a valid no-op plan; a valid plan that needs
work and every invalid plan return non-zero. Planning and check mode do not read
or write an adapter through a mutation callback, change content, advance public
state, or enqueue a build.

`renamedFrom` remains available only to the normalized runtime model for this
planning step. It is excluded from public configuration projections and all
identity hashes, so it can be removed after a rename has reached every
environment without appearing as a structural content change. Session 6B will
re-read and guard stored state transactionally before applying any approved
plan; it does not perform automatic content migrations.

## Atomic apply boundary

Session 6B adds portable dry-run and guarded-apply contracts; the executable
`lace content sync` CLI and the Cloudflare adapter are still deferred. A caller
first reads persisted model summaries and renders the canonical plan. Apply
then supplies that exact summary and approved plan to one specialized
repository operation. The repository re-reads the summary and re-plans inside
its write transaction, rejecting an invalid or stale plan without any writes.
Reapplying unchanged configuration therefore becomes a valid no-op and neither
advances the public version nor creates build work.

The atomic operation may create, update, explicitly rename, or safely remove
model identities. A rename requires the plan's explicit `renamedFrom` evidence;
the Node implementation updates the model key and relies on the database's
foreign-key cascade for attached entries. Sync never transforms arbitrary
content (it only backfills declared defaults, see below) or infers a
replacement from an addition/removal pair.

When sync creates a page model, it also creates exactly one incomplete draft
singleton in the same mutation. The draft uses normalized field defaults, no
blocks, a `NULL` slug, `system:content-sync` audit values, and the configured
label as title (falling back to the stable model key when label is absent).
Collections never receive generated entries, and required fields without a
default remain absent until publication.

Every non-no-op applied plan changes public configuration as one unit: it
increments `published_state.version` once and creates or coalesces one pending
`site.build.requested` event for that new version. The only exception is a plan
whose operations all record structure baselines (see below), which changes
neither. Any failed statement rolls
back model identities, generated page drafts, public state, and outbox work
together.

## Schema evolution (CE1A)

Sync can now evolve a model that already has draft or published content.
Decisions follow [ADR 0007](adr/0007-schema-evolution-during-sync.md) and the
classification table in architecture section 8.

### Structure baseline

`content_models` stores the canonical structure of the last successful sync in
`structure_json` and the structural hash it was written for in
`structure_json_hash`. A baseline counts only while that hash equals
`structure_hash`, so an older engine that rewrites the hash invalidates it.
Every create, label update, version update, rename and `record-baseline`
operation writes the configured structure.

The canonical structure removes `label` and `description` only from model,
field and block definitions. Fields named `description` or `label` are
structural. Runtime models carry their `structure` and, when the earlier
whole-tree stripping produced a different hash, a `legacyStructureHash`; both
are excluded from the public projection.

### Upgrading an existing installation

1. Run `lace db migrate` (migration `0005_content_model_structure`).
2. `lace content sync --check` lists one `record-baseline` operation per model
   and exits with the pending code.
3. Run `lace content sync` once. Baselines are stored; a baseline-only apply
   does not advance `published_state.version` or request a build. A stored hash
   that equals a model's `legacyStructureHash` is accepted once and replaced by
   the new hash without a version bump.

If a populated model changes structure before it has a baseline, sync refuses
with `STRUCTURE_BASELINE_MISSING`: restore the previous definition, sync once,
then apply the change.

### Classes and decisions

For populated models sync diffs the baseline against the configured structure
(model key and version are identity, not structure) and decides each change:

| Class | Examples | Decision |
| --- | --- | --- |
| `compatible` | added field, relaxed limit, `required` → optional, new `select` option, default added/changed/removed, newly allowed block type | applied |
| `display` | reordered `select` options or block allowlist | applied |
| `validated` | tightened limit, removed `select` option, optional → required | applied only if every stored value conforms (published snapshots must hold a newly required value) |
| `destructive` | removed field or allowed block type | applied only when no snapshot holds the data |
| `migration` | changed definition of an allowed block type | applied only when no snapshot holds such a block |
| `breaking` | field type change, unknown field property change, path/route change | refused (path/route only while entries are published) |

Data-dependent decisions read current snapshots through
`readConfigurationSyncSnapshots` in pages of 100. Each scan is valid only for
the model's snapshot fingerprint (snapshot count, revision sum, update-time sum
and maximum), which is part of the guarded stored state; any save, publication
or deletion between planning and apply makes the plan stale.

### Default backfill

A field that is added with a `defaultValue`, or newly gains or changes one, is
written into every draft and published snapshot of the model that lacks the
key, in the same guarded mutation as the model update, using one set-based
`json_set` statement per field. Stored values are never overwritten, and
revisions, audit actors and timestamps are unchanged. The mutation advances the
published version and coalesces one build. Media-field defaults are refused
(`MEDIA_DEFAULT_BACKFILL_UNSUPPORTED`), as is a backfill that would exceed the
content size limit (`BACKFILL_EXCEEDS_LIMIT`).

### Reports and diagnostics

Text and JSON reports list, per evolved model, the snapshot counts, each change
as `<class> <kind> <scope> <target>` with changed properties, affected counts,
violations and backfill counts, and the planned backfills. Refusals use stable
codes: `STRUCTURE_BASELINE_MISSING`, `FIELD_TYPE_CHANGED`,
`FIELD_CHANGE_UNSUPPORTED`, `CONSTRAINT_VIOLATED`, `FIELD_REMOVAL_HAS_DATA`,
`BLOCK_TYPE_REMOVAL_HAS_BLOCKS`, `BLOCK_DEFINITION_CHANGE_HAS_BLOCKS`,
`ROUTE_CHANGE_HAS_PUBLISHED`, `MEDIA_DEFAULT_BACKFILL_UNSUPPORTED`,
`BACKFILL_EXCEEDS_LIMIT` and `SNAPSHOT_EVIDENCE_STALE`. Diagnostics that concern
stored values name up to 20 snapshots (entry ID, state, title) and the total.
Destructive hints and block migrations are not available yet; see the
[content and editor roadmap](content-editor-roadmap.md) steps CE1B and CE1C.
