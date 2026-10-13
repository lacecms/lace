## REMOVED Requirements

### Requirement: CE7A composite adoption does not silently enable nested evolution
**Reason**: CE7B replaces the temporary refusal with recursive evolution and explicit nested hints.
**Migration**: Retain scalar CE1 behavior and version rules; use recursive model evolution below and versioned block migrations for block data. No SQL schema migration is required.

## ADDED Requirements

### Requirement: Composite model differences are classified recursively
Synchronization SHALL compare groups by named children and lists by their item descriptor recursively against the stored baseline. It SHALL apply the existing change classes independently at each schema path: additions/default changes and relaxations are compatible; tightening `required`, scalar constraints, `minItems` or `maxItems` is validated; hinted renames and removals are destructive; type changes at any level are breaking. List-item descriptor changes SHALL use a trailing `*` schema segment. Reordering data arrays SHALL NOT be a schema operation. Display metadata SHALL remain projection-only at descriptor positions; content/default keys named `label` or `description` SHALL remain structural. Model version increases SHALL remain necessary for structural changes. Block data changes SHALL retain the existing block-version/migration rules, including refusal of used block changes without a version increase.

#### Scenario: Add a child across items
- **WHEN** a populated model adds `caption` inside a list's group item and increases its model version
- **THEN** sync reports compatible addition `/images/*/caption` and preserves list length, order and existing values

#### Scenario: Tighten list bounds
- **WHEN** a configured list lowers maxItems below a stored length or raises minItems above a published stored length
- **THEN** sync reports a validated change at the list schema path and refuses the offending snapshots without truncating or padding arrays

#### Scenario: Draft minimum remains incomplete
- **WHEN** a list raises minItems and only draft snapshots fall below it while all published occurrences satisfy it
- **THEN** sync accepts the tightening, preserving incomplete draft values

#### Scenario: Type conversion and scalar list item change
- **WHEN** a populated model converts a scalar into a group, or changes a list item from text to number
- **THEN** sync refuses as breaking at the field or trailing-star schema path even if a rename hint exists

#### Scenario: Preserve nested display and default data
- **WHEN** only child descriptor labels change, or instead a default object's `label` value changes
- **THEN** the first change is projection-only and the second is structural and requires a model version increase

### Requirement: Nested rewrites preserve container presence and stored values
Model-field renames/removals/backfills SHALL operate on every matching existing object occurrence; collisions SHALL be checked within the same occurrence, not across different list items. Ancestor renames SHALL precede descendant transforms, removals SHALL precede backfills, and defaults SHALL never replace a present value. Descendant backfills SHALL occur for added fields and newly declared/changed defaults, only inside present containers or containers introduced by an explicit applicable ancestor default. An absent container without its own applicable default SHALL stay absent. Empty objects/arrays SHALL override container defaults. Existing list items SHALL never be inserted, removed or reordered to satisfy a schema constraint. A changed list-item default SHALL NOT replace present items or merge properties into them; changed defaults on named children SHALL apply normally.

Any backfill whose recursively normalized inserted value would introduce a media leaf SHALL be refused with path/snapshot evidence, preserving the scalar media-default prohibition; this SHALL include media introduced by descendant defaults inside an inserted composite. Existing media moved by hints SHALL be permitted. A default not needed by any stored occurrence SHALL not itself cause a refusal. Removed containers SHALL remove their entire media-reference subtree; renamed containers SHALL relocate every descendant reference. Unhinted removal SHALL be refused if any matching occurrence holds the removed key. A renamed target already present in any matching occurrence SHALL invalidate the whole plan even when its value equals the source or the source is absent there.

#### Scenario: Nested default and absent parent
- **WHEN** a group child gains a text default and snapshots contain respectively an absent group, `{}`, and a group with an explicit child value
- **THEN** only the present empty group receives the default; the other two retain their values and all revisions/audit fields remain unchanged

#### Scenario: New required child without default
- **WHEN** a present group gains a required child without a default
- **THEN** sync accepts the compatible addition without inventing values and enforces the new requirement on the next publication

#### Scenario: No collision between distinct items
- **WHEN** one list item holds `headline` and another holds `title`, and `title` is renamed from `headline`
- **THEN** the existing `title` occurrence causes refusal; the report identifies its concrete item path

#### Scenario: Nested media defaults are refused
- **WHEN** an applicable composite backfill would insert media through an explicit or descendant default
- **THEN** sync refuses before writes and names the media schema path and affected snapshots

#### Scenario: Nested media rename and removal
- **WHEN** hinted operations rename `/images/*/photo` to `/images/*/image` and remove `/profile/portrait`
- **THEN** stored JSON and usage paths move/prune atomically, and retained list item order and media deletion protection remain correct

### Requirement: Prospective synchronization snapshots satisfy combined limits
Before any write, synchronization SHALL evaluate the combined prospective snapshot after applicable model hints/defaults, block removals and versioned block migrations. It SHALL validate changed present values and tightened requirements with draft/published semantics, including hidden blocks' draft minima, and enforce JSON limits, every list maximum, the aggregate 500-list-element budget and the 200-media-location limit across all retained data. Existing published fields unrelated to tightening SHALL retain grandfathering for missing required values and previously permitted minima; validation SHALL NOT silently republish, normalize unrelated values or backfill unchanged defaults.

Nested required tightening SHALL apply only within present parent occurrences. Snapshots whose prospective values violate constraints SHALL invalidate the whole prepared plan without writes. Migration units SHALL also validate their actual intermediate snapshot before committing, counting unchanged fields/blocks and defaults actually materialized in that unit; a hypothetical later removal SHALL NOT excuse an invalid intermediate snapshot. Existing migration media provenance, revision guards and resumability SHALL remain. Combined validation findings SHALL carry the responsible schema path and a concrete value path when one exists.

#### Scenario: Model backfill plus block migration exceeds budget
- **WHEN** model backfills add 20 elements and a block migration adds 30 while retained data consumes 460
- **THEN** preparation refuses the 510-element result before any migration unit or final mutation

#### Scenario: Aggregate boundary includes hidden blocks
- **WHEN** prospective snapshots have respectively 500 and 501 elements including hidden and unchanged blocks
- **THEN** the first passes the aggregate check and the second is refused without writes

#### Scenario: Tightening a child does not invent a parent
- **WHEN** a child becomes required but its optional parent is absent in a published snapshot
- **THEN** sync accepts that snapshot, while refusing a present parent lacking the child unless an applicable backfill supplies it

#### Scenario: Unrelated required fields remain grandfathered
- **WHEN** a published snapshot lacks an unchanged required model field and a valid nested rename or block migration is applied elsewhere
- **THEN** the unrelated absence does not block synchronization

#### Scenario: Invalid migrated nested output
- **WHEN** a versioned migration produces malformed nested data, unsafe values or new unreferenced media
- **THEN** preparation reports invalid migration with block, snapshot and nested path evidence and performs no writes
