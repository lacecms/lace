## MODIFIED Requirements

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

## ADDED Requirements

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
