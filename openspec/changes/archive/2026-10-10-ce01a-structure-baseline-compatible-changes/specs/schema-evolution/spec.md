## Purpose

Defines how configuration synchronization compares a model's stored structure
baseline with its configured structure, classifies every difference, decides
data-dependent changes from stored snapshot values, and backfills field
defaults into existing content.

## ADDED Requirements

### Requirement: Structural differences are derived from the stored baseline
The system SHALL derive a model's structural changes by comparing the stored
structure baseline with the configured canonical structure. It SHALL compare
model fields by key, the ordered block allowlist, the definitions of block
types allowed by both structures, and the fixed path or collection route. It
SHALL treat the model key and version as identity, not as structural changes:
a rename is governed by the explicit `renamedFrom` rules and a structural change
still requires a version increase. Display metadata SHALL never produce a
structural change. The diff SHALL be deterministic: changes are ordered by
model key, then by change target, then by change kind.

#### Scenario: Unchanged structure yields no changes
- **WHEN** the configured structure of a model equals its stored baseline
  except for its version
- **THEN** the diff reports no structural change and a version increase alone
  is a compatible version update

#### Scenario: Equivalent inputs give the same diff
- **WHEN** the same baseline and configuration are supplied with fields and
  blocks in different insertion orders where order has no meaning
- **THEN** the reported changes and their order are identical

### Requirement: Every structural change has one class
The system SHALL assign exactly one class to every structural change:

- `compatible`: adding a field; relaxing a constraint (removing or lowering
  `minLength`, removing or raising `maxLength`, removing or lowering `min`,
  removing or raising `max`, `required` → optional, adding a `select` option);
  adding, changing or removing a field `defaultValue`; allowing a new block
  type.
- `display`: reordering `select` options or the block allowlist without adding
  or removing an entry.
- `validated`: tightening a constraint on an existing field (adding or raising
  `minLength`, adding or lowering `maxLength`, adding or raising `min`, adding
  or lowering `max`, removing a `select` option, optional → required).
- `destructive`: removing a field, or removing a block type from the
  allowlist.
- `migration`: changing the definition of a block type that both structures
  allow, including its version, fields or default value.
- `breaking`: changing a field type, changing a fixed path or collection
  route, or any other field-definition difference the system does not
  recognise.

A single field change that both relaxes and tightens SHALL be reported as one
`validated` change listing every changed property.

#### Scenario: Compatible additions are classified
- **WHEN** a model adds an optional field, a required field without a default,
  a required field with a default, raises a `maxLength`, adds a `select`
  option and allows a new block type
- **THEN** each change is reported as `compatible` and the defaulted field is
  marked for backfill

#### Scenario: Tightening is classified as validated
- **WHEN** a model lowers a `maxLength`, removes a `select` option, or makes an
  optional field required
- **THEN** each change is reported as `validated`

#### Scenario: Type change is breaking
- **WHEN** a field keeps its key but changes from `text` to `number`
- **THEN** the change is reported as `breaking`

### Requirement: Changes are applied according to class and stored data
When the model has no draft or published snapshot, the system SHALL apply
every classified change without scanning content. When the model has one or
more snapshots, the system SHALL decide each change as follows:

- `compatible` and `display` changes SHALL be applied.
- A `validated` change SHALL be applied only when every stored value
  satisfies the configured definition: a present value in any snapshot SHALL
  conform to the new field definition, and a published snapshot SHALL hold a
  value for a field that becomes required unless the field is backfilled.
  Otherwise synchronization SHALL be refused.
- A `destructive` change SHALL be applied only when no snapshot holds a value
  for the removed field or a block of the removed type. Otherwise
  synchronization SHALL be refused.
- A `migration` change SHALL be applied only when no snapshot holds a block of
  that type. Otherwise synchronization SHALL be refused.
- A `breaking` field change SHALL always be refused. A path or route change
  SHALL be refused while the model has a published snapshot.

A refusal SHALL name the model, the field key or block type, the class, the
total number of affected snapshots, and up to 20 affected snapshots by entry
ID, state (draft or published) and title. A refused change SHALL make the whole
plan invalid.

#### Scenario: Adding fields to a populated model succeeds
- **WHEN** a model with draft and published content adds an optional field and
  a required field without a default and increases its version
- **THEN** synchronization applies the new structure, existing drafts and
  published snapshots keep their stored values, and the required field is
  enforced at the next publication of each entry

#### Scenario: Failing tightening names the offending snapshots
- **WHEN** a model lowers a text field's `maxLength` below the length of a
  value stored in one draft and one published snapshot
- **THEN** synchronization is refused, the report names both snapshots with
  their entry ID, state and title and the total count, and no model, snapshot,
  public-state or outbox data changes

#### Scenario: Satisfied tightening is applied
- **WHEN** every stored value of a field already satisfies a tightened
  constraint
- **THEN** synchronization applies the change without rewriting any snapshot

#### Scenario: Unused field and block type can be removed
- **WHEN** a model removes a field that no snapshot holds and a block type that
  no snapshot uses
- **THEN** synchronization applies the removal without rewriting any snapshot

#### Scenario: Removal of stored data is refused
- **WHEN** a model removes a field that a snapshot holds or a block type that a
  snapshot uses
- **THEN** synchronization is refused with a `destructive` diagnostic that
  names the field or block type and the affected snapshots

#### Scenario: Changed definition of a used block is refused
- **WHEN** the definition of a block type changes and a snapshot of the model
  holds a block of that type
- **THEN** synchronization is refused with a `migration` diagnostic

### Requirement: Field defaults are backfilled into existing snapshots
When a model with snapshots adds a field that declares a `defaultValue`, or an
existing field newly declares or changes its `defaultValue`, the system SHALL
write that default into every draft and published snapshot of the model whose
stored fields lack the key. It SHALL NOT overwrite a stored value. The backfill
SHALL happen in the same guarded atomic mutation that records the new model
state and SHALL advance the published-state version and coalesce one build
request when any published snapshot is written. Backfill SHALL NOT change a
snapshot's revision, audit actor, timestamps, slug, title or blocks. A
`defaultValue` on a `media` field SHALL NOT be backfilled; such a change on a
model with snapshots lacking the key SHALL be refused. A backfill that would
push a snapshot's fields above the content size limit SHALL be refused and name
the snapshot.

#### Scenario: Required field with a default is backfilled
- **WHEN** a model with one draft-only entry and one published entry adds a
  required text field with a default
- **THEN** both drafts and the published snapshot contain the default after
  synchronization, revisions are unchanged, the published-state version
  advances once and exactly one build request is pending

#### Scenario: Stored values are never overwritten
- **WHEN** an existing field gains a default and some snapshots already hold a
  value for it
- **THEN** only the snapshots lacking the key receive the default

#### Scenario: Media default is refused on populated models
- **WHEN** a model with snapshots adds a media field with a default
- **THEN** synchronization is refused and names the field

### Requirement: Stored content is scanned in bounded pages
The system SHALL read stored snapshot values for data-dependent decisions only
through a repository read operation that returns a bounded page of at most 100
current draft or published snapshots of one model, ordered by snapshot ID with
an opaque continuation cursor. Each item SHALL carry the entry ID, snapshot ID,
state, revision, title, fields, and the key, type and schema version of each
block. The system SHALL scan only models with snapshots whose diff contains a
data-dependent change or a backfill, and SHALL NOT write during the scan. Scan
results SHALL be derived for the exact stored snapshot fingerprint read before
the scan; apply SHALL reject the plan when that fingerprint changed.

#### Scenario: Scan pages cover every snapshot
- **WHEN** a model has more snapshots than one page holds
- **THEN** the scan follows continuation cursors until every current draft and
  published snapshot of the model has been evaluated exactly once

#### Scenario: Content written after the scan makes the plan stale
- **WHEN** an editor saves or publishes an entry of a scanned model after the
  plan was prepared and before it is applied
- **THEN** apply rejects the plan as stale and writes nothing
