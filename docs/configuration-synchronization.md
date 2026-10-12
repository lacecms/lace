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

## Schema evolution (CE1A, CE1B, CE1C)

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
| `destructive` | removed field or allowed block type; field renamed through a hint | with a hint: data is moved or pruned (see below); without a hint: applied only when no snapshot holds the data |
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

### Rename and removal hints (CE1B)

Renaming or removing a field, or disallowing a block type, while stored content
uses it requires an explicit, reviewed hint. Sync never infers one from a
matching removal and addition.

```ts
defineCollection({
  key: "posts",
  version: 3,
  blocks: ["richText"],
  fields: {
    title: field.text({ renamedFrom: "headline" }), // moves headline → title
  },
  removedFields: ["legacy"], // prunes stored legacy values
  removedBlocks: ["quote"], // drops stored quote blocks
});
```

- `renamedFrom` is valid on model fields only; `defineBlock` rejects it because
  block data changes use block versions.
- Configuration rejects contradictory hints: a field renamed from its own key
  or from another configured field, two fields sharing a former key, a removed
  field that is still configured or is also a rename source, and a removed
  block type that is still allowed. A removed block type need not be
  registered anymore.
- Hints are not part of the structure, either hash or the public projection.
  Adding or removing a hint alone never needs a version bump.
- Hints are evaluated only when the model's structure changed and a baseline
  exists. A rename applies when the former key is in the baseline and the new
  key is not; once applied, it is inert. A rename is refused when both keys are
  in the baseline (`FIELD_RENAME_TARGET_EXISTS`) or neither is
  (`FIELD_RENAME_SOURCE_MISSING`). A removal hint for a key or block type absent
  from the baseline is inert.
- A renamed field is compared with its former definition: a type change is
  still `breaking`, and a tightened constraint is validated against the moved
  values. A rename onto a key that a stored snapshot already holds is refused
  (`FIELD_RENAME_TARGET_HAS_DATA`).
- In the guarded mutation that records the model, sync moves renamed values,
  prunes removed fields and drops blocks of removed types in every draft and
  published snapshot of the model, in that order and before default backfills.
  Media references move with a renamed field and are deleted with a pruned
  media field or a dropped block, so media usage and the deletion guard stay
  correct. Remaining blocks keep their keys, data and order. Revisions, audit
  actors and timestamps are unchanged; the published version advances and one
  build is coalesced.

Workflow: add the hint and bump the model version, review
`lace content sync --check`, run `lace content sync` in every environment, then
delete the hint (no version bump needed). Run sync right after deploying a
configuration with hints: an editor whose admin already uses the new
configuration but whose open draft predates sync could otherwise save an empty
renamed field over the moved value.

### Block migrations (CE1C)

Stored block data changes through block versions. To change a block that
stored content uses:

```ts
export const quote = defineBlock({
  type: "quote",
  version: 3,
  fields: { text: field.text({ required: true }), source: field.text() },
  migrations: {
    // Each key is a target version; each function receives the previous
    // version's { data, settings } and returns { data, settings? }.
    2: ({ data: { quote, ...rest } }) => ({ data: { ...rest, text: quote ?? "" } }),
    3: ({ data: { attribution, ...rest } }) => ({
      data: attribution === undefined ? rest : { ...rest, source: attribution },
    }),
  },
});
```

- **Rules.** Migration keys form one contiguous range that ends at the block's
  `version` (a version 1 block declares none). Each function is pure and
  synchronous, receives a frozen copy of the stored `{ data, settings }` and
  returns `{ data, settings? }` of JSON objects; leaving out `settings` keeps
  the input settings. A block that adds, removes or changes declared
  `settings` also bumps its version; new settings receive their defaults.
  Migrations never affect hashes, so adding or removing them alone needs no
  version bump. Every model that allows the block bumps its own version,
  because its structure embeds the block definition.
- **Dry run.** Planning reads the model's entries that hold a block of the type
  at another version (pages of 50 entries) and composes the chain from each
  stored `schemaVersion`. Each result is validated against the new definition:
  publish mode for visible blocks of published snapshots, draft mode for drafts
  and hidden blocks, declared settings with their defaults, the per-block
  size limit, the per-entry limit of 200 media references, and no media the
  snapshot did not already reference. `--check` therefore runs every
  migration. Refusals: `BLOCK_MIGRATION_MISSING` (no step reaches the stored
  version), `BLOCK_VERSION_AHEAD` (stored version newer than the
  configuration), `BLOCK_MIGRATION_FAILED` (a step threw) and
  `BLOCK_MIGRATION_INVALID` (non-JSON, invalid or media-introducing result).
  Each names the model, entry, state, title, block key, stored version and,
  for an invalid result, the validation path and code. A definition change
  without a version increase on a used block keeps
  `BLOCK_DEFINITION_CHANGE_HAS_BLOCKS`.
- **Apply.** Sync first rewrites stale blocks in place, one entry per guarded
  unit, re-running the same migrations. Each snapshot write is guarded on its
  revision, on still being the entry's current draft or published snapshot,
  and on every migrated block's stored `schema_version`; the migrated blocks'
  data and settings are replaced (anchor, class name and hidden flag are kept)
  and their media references are rebuilt. A draft gets `revision + 1` and the actor
  `system:content-sync`, so an editor with the entry open receives a revision
  conflict. A published snapshot that was in sync with its draft takes the same
  new revision; otherwise it keeps its revision, so entry status never changes.
  Node commits each unit in one transaction; D1 packs whole units into guarded
  batches of at most 40 statements and writes an oversized unit's published
  snapshot before its draft.
- **Final mutation.** Sync then prepares the plan again and applies it only
  when it equals the reviewed plan apart from the migrations. The final
  mutation records the baseline, advances the published version and coalesces
  one build. The report ends with `Migrated blocks: N (drafts=…, published=…).`
- **Interruptions.** A failed guard (for example, a draft saved meanwhile) or a
  crash stops sync before the final mutation. Committed units stay; rerun
  `lace content sync` and it migrates only the blocks still stale. Until the
  final mutation, public reads may already return migrated published blocks
  under the previous published version.

Workflow: bump the block version, add migrations, update the site component,
bump every allowing model's version, review `lace content sync --check`, then
deploy and run `lace content sync` immediately in every environment. Keep
migrations while any environment may still hold older blocks.

### Reports and diagnostics

Text and JSON reports list, per evolved model, the snapshot counts, each change
as `<class> <kind> <scope> <target>` with the former key of a rename, a
`hinted` marker, changed properties, affected counts, violations and backfill
counts, the stored and configured versions of a planned block migration, and
the planned renames, field removals, block removals, block migrations and
backfills. Refusals use stable
codes: `STRUCTURE_BASELINE_MISSING`, `FIELD_TYPE_CHANGED`,
`FIELD_CHANGE_UNSUPPORTED`, `CONSTRAINT_VIOLATED`, `FIELD_REMOVAL_HAS_DATA`,
`BLOCK_TYPE_REMOVAL_HAS_BLOCKS`, `BLOCK_DEFINITION_CHANGE_HAS_BLOCKS`,
`ROUTE_CHANGE_HAS_PUBLISHED`, `MEDIA_DEFAULT_BACKFILL_UNSUPPORTED`,
`BACKFILL_EXCEEDS_LIMIT` (any field rewrite above the content size limit),
`FIELD_RENAME_SOURCE_MISSING`, `FIELD_RENAME_TARGET_EXISTS`,
`FIELD_RENAME_TARGET_HAS_DATA`, `BLOCK_MIGRATION_MISSING`,
`BLOCK_VERSION_AHEAD`, `BLOCK_MIGRATION_FAILED`, `BLOCK_MIGRATION_INVALID` and
`SNAPSHOT_EVIDENCE_STALE`. Diagnostics that
concern stored values name up to 20 snapshots (entry ID, state, title) and the
total; block-migration refusals also name the block key and stored version;
unhinted removal refusals name the hint to declare.
