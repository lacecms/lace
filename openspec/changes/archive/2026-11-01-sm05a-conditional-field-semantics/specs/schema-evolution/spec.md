## ADDED Requirements

### Requirement: Visibility changes have their own change kinds and classes
Synchronization SHALL compare model-level and group-level visibility rules by
target schema path, pairing applicable rename hints for both targets and
controllers, so a renamed target or controller whose rule is otherwise
unchanged reports no visibility change. It SHALL report:

- `field-visibility-added` when an existing target gains a rule: class
  `compatible`;
- `field-visibility-removed` when a target loses its rule while it remains
  declared: class `validated`;
- `field-visibility-changed` when the controller or `values` change: class
  `compatible` when the controller is unchanged and the configured `values`
  are a strict subset of the baseline `values`, otherwise `validated`.

A target added together with its rule SHALL report only `field-added`; a
removed target SHALL report only its removal. Nested targets SHALL use the
existing schema paths, including trailing `*` segments for list items. Block
data visibility SHALL remain part of the block definition and report
`block-definition-changed` under the existing migration rules. Visibility
changes SHALL never be classified `display` or `breaking`. Every visibility
change SHALL need stored-snapshot evidence when the model has snapshots.

#### Scenario: Add a rule to a populated model
- **WHEN** a populated model adds a rule for `/gallery/*/videoUrl` and increases its version
- **THEN** sync reports one compatible `field-visibility-added` change at that path

#### Scenario: Widen a rule
- **WHEN** a rule's `values` change from `["video"]` to `["video", "embed"]`
- **THEN** sync reports a validated `field-visibility-changed` change

#### Scenario: Rename the controller
- **WHEN** controller `type` is renamed to `kind` through a hint and the rule is updated to name `kind` with the same values
- **THEN** sync reports the rename and no visibility change

#### Scenario: Block data rule
- **WHEN** a used block type adds a data visibility rule without increasing its block version
- **THEN** sync refuses with the existing `migration` diagnostic

### Requirement: Synchronization prunes newly hidden published values
Whenever synchronization rewrites the fields of a model whose baseline or
configured structure declares visibility rules, it SHALL evaluate every
published occurrence under the configured structure and prospective values,
after hinted renames, removals, backfills and block migrations, using the
controller's stored value or else its configured default. Every target that is
hidden there and holds a value SHALL be removed from that published snapshot
by the published projection; values already hidden under the baseline are
removed as well, so a published snapshot never retains a hidden value after
such a sync. Drafts SHALL keep every value. Pruning
SHALL happen in the same guarded atomic mutation that records the new model
state, SHALL update the snapshot's media and internal-link references for the
removed values, SHALL NOT change revisions, audit actors, timestamps, slug,
title, envelopes, settings or other values, and SHALL advance the
published-state version once and coalesce one build request when any
published snapshot changes. Default backfill SHALL NOT insert a value into a
published occurrence where the target is hidden. A failed or stale apply SHALL
leave every row unchanged on both runtimes.

#### Scenario: Narrowing prunes only published values
- **WHEN** a populated model with one published and one draft-only entry adds a rule that hides their `videoUrl` values
- **THEN** after sync the published snapshot holds no `videoUrl`, both drafts still hold it, revisions are unchanged, the published-state version advances once and exactly one build request is pending

#### Scenario: Pruning releases media usage
- **WHEN** a rule change hides a published `media` value that references an item used nowhere else
- **THEN** after sync that item's published usage is gone while the draft usage remains

#### Scenario: Backfilled controller hides a target
- **WHEN** optional controller `kind` without a default gains default `image` and published items lacking `kind` hold `videoUrl` values
- **THEN** sync backfills `kind`, prunes those published `videoUrl` values and leaves drafts holding them

#### Scenario: Stale plan
- **WHEN** a pruning plan is applied after its baseline changed
- **THEN** sync rejects it without partial writes on Node and Cloudflare

### Requirement: Evidence checks apply visibility to every published occurrence
Validated visibility changes SHALL be applied only when every published
occurrence in which the configured rule makes a target visible while the
baseline rule hid it, both evaluated on the prospective values, satisfies
publish semantics for that target under the configured structure: a required
target SHALL hold a value, and its subtree SHALL satisfy nested requiredness
and `minItems`. A target revealed only by a controller default backfill is
enforced at the entry's next publication, like an added required field. Draft
occurrences SHALL satisfy
draft semantics as before. Constraint-tightening evidence for a conditional
target SHALL check hidden published occurrences with draft semantics only.
Refusals SHALL use the existing diagnostic format, naming the model, the
target schema path, the class, the total of affected snapshots and up to 20
affected snapshots with a concrete value path. A refused change SHALL make
the whole plan invalid without writes.

#### Scenario: Removing a rule from a required field
- **WHEN** a rule is removed from required `videoUrl` and one published item with `kind: "image"` lacks it
- **THEN** sync refuses with a validated diagnostic naming that snapshot and the item's `videoUrl` path

#### Scenario: Removing a rule from an optional field
- **WHEN** the same rule is removed while `videoUrl` is optional
- **THEN** sync applies the change without rewriting any snapshot

#### Scenario: Required while hidden
- **WHEN** a conditional target becomes required and published occurrences where it is hidden lack it
- **THEN** sync accepts the change and refuses only visible published occurrences lacking it
