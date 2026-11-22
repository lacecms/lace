## MODIFIED Requirements

### Requirement: Every structural change has one class
The system SHALL assign exactly one class to every structural change:

- `compatible`: adding a field; relaxing a constraint (removing or lowering
  `minLength`, removing or raising `maxLength`, removing or lowering `min`,
  removing or raising `max`, `required` → optional, adding a `select` option or widening a reference target-model set);
  adding, changing or removing a field `defaultValue`; allowing a new block
  type.
- `display`: reordering `select` options or the block allowlist without adding
  or removing an entry.
- `validated`: tightening a constraint on an existing or renamed field (adding
  or raising `minLength`, adding or lowering `maxLength`, adding or raising
  `min`, adding or lowering `max`, removing a `select` option or a target model from a reference, optional →
  required).
- `destructive`: removing a field, renaming a field through a hint, or removing
  a block type from the allowlist. A removal that a matching hint declares
  SHALL be marked as hinted.
- `migration`: changing the definition of a block type that both structures
  allow, including its version, fields or default value.
- `breaking`: changing a field type, including across a rename, changing a
  fixed path or collection route, or any other field-definition difference the
  system does not recognise.

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
- **WHEN** a field keeps its key but changes from `text` to `number`, or a
  field renamed through a hint has a different type than its former field
- **THEN** the change is reported as `breaking`

#### Scenario: Hinted destructive changes are classified
- **WHEN** a model renames field `headline` to `title` through a hint, removes
  field `legacy` listed in `removedFields`, and disallows block type `quote`
  listed in `removedBlocks`
- **THEN** the rename is reported as one `destructive` `field-renamed` change
  and both removals are reported as hinted `destructive` changes

#### Scenario: Target model constraints widen or tighten
- **WHEN** a reference field adds only allowed models, removes one, replaces one or merely reorders its unchanged model set
- **THEN** the changes respectively classify as compatible, validated, validated or no change; a field type change from text or URL to reference remains breaking

### Requirement: Adding or removing a collection route is a route change
Synchronization SHALL classify adding a route to a route-less collection and
removing the route of a collection as a `breaking` route change of a model
that stays of kind `collection`; it SHALL NOT report a kind change. Like every
path or route change it SHALL be refused while the model has a published
snapshot. Removing a route SHALL additionally be refused while any draft or
published snapshot of the model holds a slug, or while any current snapshot
holds an ordinary internal URL reference to an entry of the model; the refusal SHALL name
the model, the class, the total number of the model's affected snapshots
(holding a slug or targeted by an internal URL reference) and up to 20 of them by entry ID,
state and title, and SHALL tell the operator to clear the slugs or references
first. An applied change SHALL keep every stored value, SHALL
create or remove no published route, and SHALL require the model version
increase of any structural change. After a route is added, existing drafts
without a slug SHALL stay valid drafts and each entry's next publication
SHALL require a slug.

#### Scenario: Adding a route to an unpublished route-less collection
- **WHEN** the route-less `testimonials` collection with two drafts and no
  publication declares `route: "/testimonials/:slug"` and increases its version
- **THEN** synchronization applies the change, the drafts keep their content
  without slugs, and publishing one of them requires a slug

#### Scenario: Changing the route of a published collection is refused
- **WHEN** a collection with a published entry adds or removes its route
- **THEN** synchronization is refused as a `breaking` route change and nothing
  is written

#### Scenario: Removing a route while drafts hold slugs
- **WHEN** the unpublished `cv` collection removes its route while two drafts
  still hold slugs
- **THEN** synchronization is refused, the report names both snapshots and
  tells the operator to clear the slugs, and nothing is written

#### Scenario: Removing a route of a linked collection
- **WHEN** the unpublished `cv` collection removes its route while a page
  draft holds `entry:<cv-entry-id>`
- **THEN** synchronization is refused, the report names the linked `cv` entry,
  and nothing is written

#### Scenario: A typed data reference survives route removal
- **WHEN** a collection with no published snapshot, stored slug or incoming URL token drops its route, and a draft still selects one of its entries through a typed reference
- **THEN** synchronization allows the route change and preserves the source selection and incoming usage by ID

## ADDED Requirements

### Requirement: Synchronization preserves entry-reference graph integrity

Synchronization SHALL validate each new or changed populated reference at its
concrete location in the prospective configuration, including prospectively
renamed target models and references from migrated block data. For a narrowed
model set it SHALL check retained values in draft and published snapshots.
When a retained missing target prevents proving a narrowing safe, the plan
SHALL give an actionable source location and refuse it. Unchanged missing
draft usages SHALL continue to permit unrelated schema updates. A model rename
SHALL retain entry IDs and count the target at its configured new model key.
The existing prohibition on removing populated models SHALL apply.

Planning SHALL account for the combined changes to all affected sources,
including defaults, versioned block migrations, visibility, and explicit
field/block renames and removals. Every applied unit SHALL validate and update
its direct usages and both applicable acyclicity checks in the same guarded
unit as its content. Each resulting draft SHALL count all authored references
and each published graph SHALL use its delivered projection. Actual intermediate
states of resumable units SHALL also satisfy these rules. A source location
change SHALL be visible to subsequent impact reads and invalidate stale
acknowledgments. Graph-only concurrent changes SHALL be detected even when
the source's revision is unchanged.

Check mode SHALL verify that the scheduled sequence of whole-entry block
migration units preserves acyclicity in both phases at each step, even if D1
can commit multiple units together. If a final acyclic overlay requires an
unsafe intermediate write, the plan SHALL report the obstructing entry,
phase and reference location and instruct the operator to split the
migration into safe stages. This refusal SHALL occur before any write.

Reference defaults SHALL follow existing scalar and composite backfill and
container-presence rules. Wherever a default is materialized, the target
SHALL exist and belong to an allowed model. A delivered published reference
SHALL additionally have a published target. Defaults, hidden values, and
repeated entries SHALL count toward the combined 200 ordinary URL and typed
reference occurrence budget per normalized snapshot, independently of the
media budget. Invalid prepared plans SHALL write nothing; a rejected guarded
unit SHALL leave its inputs, reference indexes and publication effects intact.
A retry SHALL use current graph and snapshot evidence.

#### Scenario: An ancestor default would complete a cycle
- **WHEN** a group default would introduce `A → B` while B already reaches A in the affected draft graph
- **THEN** the plan names the offending entry and field path and applies no backfill

#### Scenario: A default or migration reaches unpublished content
- **WHEN** a default backfill or block migration would introduce a delivered reference to a draft-only review
- **THEN** synchronization rejects the published rewrite and no invalid snapshot becomes visible

#### Scenario: Two individually valid migrations form one cycle
- **WHEN** a single plan proposes `A → B` and `B → A` through separate rewrites in the same graph
- **THEN** check mode rejects the prospective graph before applying either rewrite

#### Scenario: Both possible first entries would introduce a cycle
- **WHEN** drafts contain A → B, publications contain B → A, and a block migration would reverse each graph by rewriting A and B
- **THEN** check mode refuses both runtime plans before any writes and recommends separate stages that remove the old edges before adding the new ones

#### Scenario: An editor changes another source after planning
- **WHEN** a cycle check succeeded at planning and another saved edge would make the prepared write cyclic
- **THEN** the guarded apply unit rejects the stale change without writing partial usages, content or build events

#### Scenario: A model rename retains authored identities
- **WHEN** target model `people` is explicitly renamed to `authors` and source declarations permit `authors` in the same valid configuration change
- **THEN** synchronization verifies existing selections against the renamed model and retains their exact target IDs

#### Scenario: A field move updates the repair location
- **WHEN** a guarded schema rewrite renames a group containing a missing draft reference, or explicitly prunes its reference field
- **THEN** impact lookup reports the new path for the retained occurrence or removes the pruned usage without creating a published dependency
