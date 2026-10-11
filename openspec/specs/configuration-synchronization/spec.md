# configuration-synchronization Specification

## Purpose

Defines portable, non-mutating planning and reporting for reconciling the
code-first configuration model identities with persisted content-model state.

## Requirements

### Requirement: Synchronization planning classifies normalized model identities
The system SHALL derive a deterministic synchronization plan from normalized
configuration models and persisted model identity records that include kind,
version, structural hash, projection hash, whether a valid structure baseline
exists, the baseline itself, draft/published snapshot counts, and a snapshot
fingerprint. The plan SHALL order results by current model key and classify
every affected model as create, label-only update, compatible version update,
explicit rename, baseline recording, safe removal, blocked removal, or
incompatible change. An unchanged model with a valid baseline SHALL not produce
a planned write. A label-only update SHALL be limited to a projection-hash
change with an unchanged structural hash and version; a compatible version
update SHALL never regress a stored version or accept a structural-hash change
without a version increase. Version updates and renames of models with
snapshots SHALL carry the classified structural changes, their affected
snapshot counts, and the planned backfills defined by the schema-evolution
capability.

#### Scenario: Planner identifies safe create and display update
- **WHEN** a normalized configuration adds a model that has no stored identity,
  or changes only the serializable display projection of an existing model
- **THEN** the plan contains respectively a deterministic create or label-only
  update operation and no invalid diagnostic

#### Scenario: Planner identifies an unchanged configuration
- **WHEN** every normalized model has the same key, kind, version, structural
  hash, and projection hash as its stored identity and every stored identity
  has a valid structure baseline
- **THEN** the plan contains no operations and reports that no apply is needed

#### Scenario: Planner rejects an unsafe version or hash transition
- **WHEN** an existing model changes kind, regresses its version, or changes its
  structural hash without increasing its version
- **THEN** the plan is invalid, names the model and reason, and contains no
  executable operation for that transition

#### Scenario: Populated model evolves compatibly
- **WHEN** a model with draft and published snapshots and a valid baseline adds
  an optional field and increases its version
- **THEN** the plan contains one valid version update that lists the added
  field as a `compatible` change with the affected draft and published counts

### Requirement: Synchronization planning protects stored content and requires explicit renames
The system SHALL treat a renamed model identity as a rename only when the
normalized model supplies `renamedFrom`, the former stored key exists, the new
stored key does not exist, and the former and new kinds are equal. It SHALL NOT
infer a rename from a removal and an addition, neither for a model nor for a
field. A field rename, field removal or block-type removal that affects stored
data SHALL be applied only through the explicit field `renamedFrom`,
`removedFields` or `removedBlocks` hints defined by the schema-evolution
capability. The planner SHALL mark a model removal as safe only when the
stored model has no entries, and as blocked when it has entries. When a model
with any draft or published snapshot changes its structural hash, the planner
SHALL decide the change from the structural diff against the stored baseline
as defined by the schema-evolution capability. When no valid baseline exists,
or the configured model carries no canonical structure, the planner SHALL mark
the structural change as incompatible and its diagnostic SHALL tell the
operator to restore the previous definition, run synchronization to record a
baseline, and then apply the change. Ambiguous, missing, or conflicting rename
evidence SHALL make the plan invalid and SHALL identify every affected current
and former key.

#### Scenario: Explicit compatible rename preserves a populated model identity
- **WHEN** a new page or collection key supplies a valid `renamedFrom` key for
  an existing stored model of the same kind with entries and a valid baseline,
  and increases the version
- **THEN** the plan contains one explicit rename operation rather than a create
  and removal, provided its structure is otherwise compatible with the stored
  snapshots

#### Scenario: Model rename combined with a field rename
- **WHEN** a populated model is renamed through the model-level `renamedFrom`
  and one of its fields is renamed through a field `renamedFrom` hint that
  applies to the former model's baseline
- **THEN** the plan contains one rename operation whose evolution moves the
  field values, and applying it stores the entries under the new model key
  with the values under the new field key

#### Scenario: Key replacement without a hint is blocked by existing entries
- **WHEN** a stored populated model disappears from configuration and a new
  model appears without a valid `renamedFrom` hint
- **THEN** the plan reports the create separately and marks the removal blocked
  without inferring a rename

#### Scenario: Empty model identity can be removed
- **WHEN** a stored model is absent from normalized configuration and has no
  entries
- **THEN** the plan contains one safe removal operation for its stored key

#### Scenario: Structural change is blocked for stored snapshots
- **WHEN** an existing model has draft or published snapshots, no valid
  structure baseline, and a normalized structural hash that differs from the
  stored structural hash
- **THEN** the plan reports an incompatible change that names the affected
  snapshot states, tells the operator to restore the previous definition and
  synchronize before changing it, and does not permit an apply

### Requirement: Synchronization plans have stable human and machine reports
The system SHALL render a plan as deterministic human-readable text and as
JSON-safe data without executable values. Both representations SHALL preserve
the ordered operations, invalid diagnostics, affected model keys, and whether
an apply is required. For every model they SHALL list each structural change
with its class, target field or block type, the former key of a renamed field,
whether a destructive change is hinted, affected draft and published snapshot
counts, and the planned writes (baseline recording, field renames, field
removals, block-type removals, block migrations and backfills). A planned block
migration SHALL list the block type, the configured version, the distinct
stored versions it migrates from, and the draft, published and block counts.
Diagnostics SHALL carry a stable code and, where relevant, the field key or
block type and the named affected snapshots; block-migration diagnostics SHALL
also name each affected block key and its stored version. Check mode SHALL be
non-mutating and SHALL return a non-zero outcome when the plan is invalid or
contains one or more operations; it SHALL return zero only for a valid no-op
plan.

#### Scenario: Machine reports are stable across equivalent inputs
- **WHEN** equivalent stored records and normalized configuration are supplied
  in different insertion orders
- **THEN** the JSON report has the same ordered content and serializes to the
  same canonical result

#### Scenario: Check mode distinguishes no-op from pending or invalid work
- **WHEN** check mode receives respectively an unchanged valid configuration, a
  valid configuration requiring synchronization, and an invalid configuration
- **THEN** it returns respectively zero, non-zero, and non-zero without writing
  model, entry, snapshot, public-state, or outbox data

#### Scenario: Check mode reports the evolution plan without writing
- **WHEN** check mode runs for a populated model that adds a defaulted field
  and tightens a satisfied constraint
- **THEN** the report lists both changes with their classes, the affected
  counts and the planned backfill, returns non-zero, and every snapshot,
  model, public-state and outbox row is unchanged

#### Scenario: Check mode reports hinted destructive writes
- **WHEN** check mode runs for a populated model that renames one field,
  removes one field and disallows one block type through hints
- **THEN** the report lists the rename with its former key and moved counts,
  both removals as hinted with their affected counts, and the planned renames,
  field removals and block removals, and no snapshot, block, media-reference,
  model, public-state or outbox row changes

#### Scenario: Check mode reports planned block migrations
- **WHEN** check mode runs for a populated model whose allowed block type moves
  from version 1 to version 3 with valid migrations
- **THEN** the report lists the `migration` change and a planned block
  migration from version 1 to version 3 with its draft, published and block
  counts, returns non-zero, and no snapshot, block, media-reference, model,
  public-state or outbox row changes

### Requirement: Synchronization plans apply atomically against current persisted state
The system SHALL apply only a valid configuration synchronization plan. When
the plan contains block migrations, the system SHALL first rewrite the stale
blocks in the guarded resumable units defined by the schema-evolution
capability. It SHALL then prepare the plan again from current stored state and
apply the fresh plan only when it is valid, contains no remaining block
migration, and equals the reviewed plan apart from its planned block
migrations; otherwise it SHALL stop as stale without the final mutation. Every
plan SHALL complete through one guarded atomic persistence operation (the
final mutation) that re-reads model identities, baseline presence,
entry/draft/published snapshot summaries and snapshot fingerprints before it
writes. The final mutation SHALL reject a plan that is invalid, no longer
matches current stored state, or cannot complete every planned operation, and
SHALL then leave model identities, baselines, entries, snapshots, public
state, and outbox work unchanged. A valid no-op plan SHALL perform no writes.
An explicit valid rename SHALL migrate the stored model key and every
dependent model foreign key atomically; the system SHALL NOT infer a rename.
Every applied create, label update, version update, rename, and baseline
recording SHALL store the configured canonical structure together with the
structural hash it was written for, in the same mutation as the planned field
rewrites and backfills. The apply result SHALL report the number of migrated
drafts, published snapshots and blocks.

#### Scenario: Concurrent synchronization invalidates a stale plan
- **WHEN** one synchronization changes a model identity after another caller
  has planned but before that caller applies
- **THEN** the later caller rejects its stale plan without overwriting the
  committed identity or partially changing any related content

#### Scenario: Reapplying an unchanged configuration is idempotent
- **WHEN** a valid plan is applied and a new plan is produced from the same
  unchanged normalized configuration and persisted state
- **THEN** the new plan is a valid no-op and applying it performs no writes,
  public-version increment, or build request

#### Scenario: Content change after planning invalidates the plan
- **WHEN** a draft of a model is saved after the plan was prepared
- **THEN** apply rejects the plan as stale without writing a baseline, a
  backfill, public state, or outbox work

#### Scenario: Migration completes with one final mutation
- **WHEN** a valid plan migrates stale blocks of a populated model with
  published content
- **THEN** the stale blocks are rewritten, then one final mutation stores the
  new identity and baseline, advances the published-state version once and
  leaves exactly one pending build request, and the apply result reports the
  migrated counts

#### Scenario: Final mutation is not reached after a failed unit
- **WHEN** a migration unit fails its guard during apply
- **THEN** the model identity, baseline, published-state version and outbox
  are unchanged, units committed earlier stay committed, and a rerun completes
  the synchronization

### Requirement: Synchronization creates page singletons and advances public projection state
The system SHALL create one draft-only singleton entry for every newly created
page model in the same guarded atomic operation as its model identity. That
entry SHALL use the configured model defaults, an empty block list, a `NULL`
slug, the model label (or its stable key when no optional label is configured)
as its title, and `system:content-sync` as its audit actor; it MAY omit
required model fields until publication. Collections SHALL NOT receive an entry
from synchronization. If one or more committed operations change a serializable
configuration projection visible to public consumers or rewrite a published
snapshot, the operation SHALL increment the global published-state version and
create or coalesce exactly one pending site-build request for that version in
the same atomic mutation. An apply whose operations only record structure
baselines SHALL NOT advance the version or enqueue build work.

#### Scenario: New page receives one system draft
- **WHEN** synchronization creates a page model that has no persisted identity
- **THEN** it commits the model and exactly one singleton draft entry with the
  configured defaults, empty blocks, `NULL` slug, model-label title, and
  `system:content-sync` audit values

#### Scenario: Projection-changing apply coalesces build work
- **WHEN** an atomic synchronization applies one or more operations that change
  a public configuration projection while a pending unlocked site-build request
  exists
- **THEN** it increments published state once and leaves exactly one pending
  site-build request targeting the new version

#### Scenario: Failed page creation rolls back the identity update
- **WHEN** a new page model cannot create its singleton draft during
  synchronization
- **THEN** neither the model identity nor any public-state or outbox change is
  committed

#### Scenario: Baseline-only apply does not request a build
- **WHEN** synchronization only records structure baselines for unchanged
  models
- **THEN** the baselines are stored and the published-state version and build
  outbox are unchanged

### Requirement: Synchronization records structure baselines for upgraded installations
The system SHALL plan a `record-baseline` operation for every configured model
whose stored identity matches it (same key, kind, version and structural hash)
but has no valid baseline. It SHALL also plan `record-baseline` when the stored
structural hash equals the configured model's pre-change structural hash and no
valid baseline exists; that operation SHALL store the current structural hash
with the baseline and SHALL NOT require a version increase. A baseline SHALL be
treated as valid only while the hash it was written for equals the stored
structural hash, so a later identity write by an engine that does not maintain
baselines invalidates it.

#### Scenario: First sync after upgrade records baselines
- **WHEN** an installation created before structure baselines existed runs
  synchronization with an unchanged configuration
- **THEN** the plan contains one `record-baseline` operation per model, apply
  stores every baseline, and a following plan is a no-op

#### Scenario: Pre-change hash is accepted once
- **WHEN** a stored model's hash was computed before display stripping became
  definition-scoped and its configuration is otherwise unchanged
- **THEN** synchronization records the baseline with the new structural hash
  without requiring a version increase

#### Scenario: Upgrade with a pending structural change is covered
- **WHEN** an installation without baselines changes a populated model's
  structure in the same sync
- **THEN** the change is refused with the restore-sync-apply guidance, and
  after restoring the definition one sync records the baseline and a second
  sync applies the compatible change

### Requirement: Synchronization planning uses the executable block registry
Preparing a synchronization plan SHALL receive the configured block registry
with its executable migrations and validators alongside the normalized models,
and SHALL use it only to migrate and validate stale blocks in memory. The
decision of a plan from scan evidence SHALL NOT need executable values, so a
persistence adapter can re-plan from the evidence alone. A configured model
that allows a block type absent from the supplied registry SHALL make
preparation fail before any scan or write.

#### Scenario: Plan is decided from evidence without executables
- **WHEN** a persistence adapter re-plans a prepared plan from its scan
  evidence and the normalized models
- **THEN** it derives the same plan, including planned block migrations,
  without the block registry

#### Scenario: Registry missing a configured block type
- **WHEN** preparation receives a registry that lacks a block type a
  configured model allows
- **THEN** preparation fails before reading snapshots and nothing is written
