## MODIFIED Requirements

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
removals, block-type removals and backfills). Diagnostics SHALL carry a stable
code and, where relevant, the field key or block type and the named affected
snapshots. Check mode SHALL be non-mutating and SHALL return a non-zero
outcome when the plan is invalid or contains one or more operations; it SHALL
return zero only for a valid no-op plan.

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
