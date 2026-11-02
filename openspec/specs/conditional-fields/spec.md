# conditional-fields Specification

## Purpose
Defines conditional fields: portable `visibility` rules that make a field
apply only when a sibling `select` or `boolean` controller holds selected
values, including how rules are declared, checked, evaluated, retained in
drafts and omitted from published content.

## Requirements

### Requirement: Field-map owners declare sibling visibility rules
Models, group descriptors (including groups used as list items or reached
through nested groups and lists at every permitted CE7 depth) and block data
SHALL accept an optional `visibility` map. Each key SHALL name an immediate
sibling field of that owner (the target); each value SHALL be a rule of
exactly `{ field, values }`, where `field` names an immediate sibling field of
the same owner (the controller). An owner SHALL declare at most one rule per
target. Scalar descriptors, list descriptors, scalar list items and block
settings SHALL NOT accept `visibility`; block settings keep
`settingsVisibility`. System title, slug, SEO and block envelope values are
not fields of any owner and SHALL NOT be targets or controllers.

TypeScript inputs SHALL restrict targets and controllers to the owner's
immediate field keys, the controller to a `select` or `boolean` field, and
`values` to that controller's option literals or to booleans. Omitting
`visibility` SHALL preserve existing descriptors, metadata encodings and
hashes. Normalized rules SHALL be detached, deeply frozen, portable JSON and
round trip through JSON unchanged.

#### Scenario: Gallery item kinds
- **WHEN** a list's group item declares `kind` as a required select of `image` and `video` with default `image`, and `visibility` makes `media` depend on `["image"]` and `videoUrl` on `["video"]`
- **THEN** configuration loads, metadata round trips, and each item evaluates its own rules

#### Scenario: Boolean controller
- **WHEN** block data declares optional boolean `hasCta` and `visibility: { ctaUrl: { field: "hasCta", values: [true] } }`
- **THEN** configuration loads and `ctaUrl` applies only to blocks whose `hasCta` is true

#### Scenario: Unsupported placement
- **WHEN** `visibility` is supplied on a text descriptor, a list descriptor, a scalar list item, or names a block setting as target
- **THEN** normalization rejects it before startup with the owner path

#### Scenario: Unopted configuration
- **WHEN** a configuration declares no `visibility`
- **THEN** its normalized metadata, projection hash and structure hash equal those produced before this change

### Requirement: Visibility rules are checked when configuration loads
Normalization SHALL reject, with a descriptive configuration path ending at
the offending target, `field` or `values`:

- a target that is not a declared sibling field;
- a rule that is not a plain object of exactly `field` and `values`;
- a controller that is not a declared sibling field, equals its target, or is
  not a `select` or `boolean` field;
- a controller that is itself a target of a rule in the same owner (chains
  and cycles are not allowed);
- `values` that is not a nonempty array of unique entries, or contains an
  entry that is not one of the select's options, or not a boolean for a
  boolean controller;
- non-portable or non-JSON input.

A controller MAY be optional and MAY omit a default. Removing a select option
that a rule lists, or changing a controller's type, SHALL make configuration
invalid until the rule is updated. The same checks SHALL reject forged
metadata at REST boundaries.

#### Scenario: Reject invalid rules
- **WHEN** a rule targets `missing`, names controller `title` of type text, references its own target, lists `values: []`, lists `"audio"` for a select without that option, lists `"yes"` for a boolean, or adds a property `equals`
- **THEN** configuration fails before startup naming the model or block and the rule path

#### Scenario: Reject a chain
- **WHEN** `videoUrl` depends on `kind` and `kind` depends on `hasMedia`
- **THEN** configuration fails at the `videoUrl` rule's `field` path explaining that a controller must be unconditional

#### Scenario: Shared controller
- **WHEN** `media` and `alt` both depend on `kind` with different values
- **THEN** configuration loads and each target evaluates its own rule

### Requirement: A target is visible when its controller holds a listed value
For one object occurrence (a model's fields, a present group value, one list
item, or one block's data), a target without a rule SHALL be visible. A target
with a rule SHALL be visible exactly when the controller's effective value is
listed in `values`. The effective value SHALL be the controller's present
value in that occurrence, otherwise its declared default; an absent controller
without a default SHALL match no rule, so its targets are hidden. Evaluation
SHALL never read values outside the occurrence. A hidden group or list SHALL
hide its whole subtree; rules inside a visible group or list item SHALL be
evaluated within that nested occurrence. Evaluation SHALL be pure, total and
identical on Node and Cloudflare, and SHALL be available to every layer
through one exported function.

#### Scenario: Default controller value
- **WHEN** an item omits `kind` whose default is `image`
- **THEN** `media` is visible and `videoUrl` is hidden

#### Scenario: Optional controller without a default
- **WHEN** optional select `layout` has no default and is absent, and `columns` depends on `["grid"]`
- **THEN** `columns` is hidden

#### Scenario: Items evaluate independently
- **WHEN** a list holds an `image` item and a `video` item
- **THEN** the first item's `videoUrl` and the second item's `media` are hidden, and no item reads another item's controller

### Requirement: Hidden values are retained in drafts and omitted from the published projection
Changing a controller SHALL NOT clear, reset, normalize away or reorder a
hidden target's stored value. Draft creation, draft saves and duplication
SHALL keep hidden values, so switching the controller back restores them.
Operations that copy published values into a draft carry only what the
published projection retained. Defaults of hidden absent targets SHALL be
materialized in drafts exactly as for visible fields.

The system SHALL define one published projection of a normalized value: it
SHALL remove every hidden target, recursively through visible groups, list
items and block data, and SHALL leave visible values, key order of retained
keys, list length and list order unchanged. The projection SHALL NOT remove a
visible field's value, insert values, or change block envelopes or settings.
Configuration synchronization SHALL use this projection when it rewrites
published snapshots.

#### Scenario: Toggle back restores a value
- **WHEN** an editor saves an item with `kind: "video"` and a `videoUrl`, then saves it with `kind: "image"` and a `media`, then switches back to `video`
- **THEN** the stored draft still holds the earlier `videoUrl`, and both saves succeed

#### Scenario: Projection removes only hidden values
- **WHEN** a draft item holds `kind: "image"`, a `media`, a stale `videoUrl` and a `caption` without a rule
- **THEN** the published projection of that item holds `kind`, `media` and `caption` and no `videoUrl`

#### Scenario: Projection keeps list shape
- **WHEN** a list holds three items whose hidden values differ
- **THEN** the projection holds three items in the same order

### Requirement: The server enforces conditional rules on every write path
Draft creation, draft saves, duplication and publication SHALL evaluate
`visibility` rules on the server for every write path: the admin REST API,
MCP tools and `lace import`. A client SHALL NOT be able to make a visible
required field optional by omitting it, nor be forced to fill a hidden one.
Validation issues for visible targets SHALL keep the existing codes and exact
paths, including list indexes and block keys. Behavior SHALL be identical on
Node and Cloudflare.

#### Scenario: Hidden required field is not demanded
- **WHEN** an MCP client publishes a gallery item with `kind: "image"`, a `media` value and no `videoUrl`, where both targets are required
- **THEN** publication succeeds

#### Scenario: Visible required field is demanded
- **WHEN** a REST client publishes an item with `kind: "video"` and no `videoUrl`
- **THEN** publication fails with `missing_required_field` at that item's `videoUrl` path, and the entry, route, published snapshot, public-state version and build queue are unchanged

#### Scenario: Import validates through the same rules
- **WHEN** `lace import --validate-only` submits an item whose controller hides a field that carries an over-long value
- **THEN** the item is rejected with the draft length issue at that path, and an item whose hidden field holds a valid value is accepted

### Requirement: Publication stores the published projection
Publication SHALL validate the stored draft in publish mode and SHALL write
the published projection of its fields and of every block's data, including
hidden blocks, as the new published snapshot within the same guarded atomic
publication: the expected draft revision, route and singleton checks,
idempotency, public-state version increase and build request keep their
existing behavior. The stored draft SHALL keep its hidden values and revision.
Block envelopes, settings, positions, keys, title, slug and SEO SHALL be
published unchanged. An entry whose model and draft blocks declare no rules
SHALL publish exactly as before. A replayed publication SHALL return the
original result without writing another projection.

#### Scenario: Gallery publication omits stale values
- **WHEN** a draft list holds an `image` item with a stale `videoUrl` and a `video` item with a stale `media`, and the entry is published
- **THEN** the published snapshot holds both items in order, the first without `videoUrl` and the second without `media`, while the draft still holds both stale values

#### Scenario: Model-level and block-data rules
- **WHEN** a model field and a block's data field are hidden by their owners' rules and the entry is published
- **THEN** neither hidden value appears in the published snapshot and every visible value is unchanged

#### Scenario: Hidden block data is projected too
- **WHEN** a block marked hidden holds a hidden conditional value and the entry is published
- **THEN** the published snapshot keeps the hidden block with its envelope and settings and without the hidden conditional value

#### Scenario: Stale draft revision
- **WHEN** another writer saves the draft after the publisher read it and the publisher publishes with the older revision
- **THEN** publication fails with the revision conflict and no projection of either revision is published

#### Scenario: Unopted content is unchanged
- **WHEN** an entry of a model without rules, using blocks without rules, is published
- **THEN** the published snapshot equals the draft values, as before this change

#### Scenario: Toggle back after publication
- **WHEN** an editor publishes a `video` item, switches it to `image` and publishes, then switches it back to `video` in the draft
- **THEN** the draft still holds the earlier `videoUrl`, and the current published snapshot holds no `videoUrl` until the next publication

### Requirement: Published references follow the projection
Media references and internal-link references of a published snapshot SHALL
be derived from its published projection. A media item referenced only by a
hidden value SHALL count as draft usage while the draft references it and
SHALL NOT count as published usage. Internal links inside hidden values SHALL
be recorded in the draft as not delivered, SHALL NOT be checked for a
published target at publication, SHALL NOT appear in the published snapshot
and SHALL NOT be reported as incoming usage of the published source. Visible
delivered internal links SHALL keep the existing strict publication check,
evaluated inside the atomic publication on the projected references. Media
metadata edits SHALL request builds only for published references that remain.

#### Scenario: Hidden media is draft usage only
- **WHEN** the only reference to an image is a hidden `media` value of a published entry
- **THEN** the image's usage lists that entry's draft location only, deletion stays refused while the draft keeps the value, and a metadata edit of the image requests no build

#### Scenario: Hidden link to an unpublished target
- **WHEN** a hidden URL field links to an unpublished entry and the source is published
- **THEN** publication succeeds, the published snapshot and its link references omit the link, and unpublishing or deleting the target reports no incoming usage from that publication

#### Scenario: Visible link to an unpublished target
- **WHEN** the controller makes that URL field visible and the source is published
- **THEN** publication fails with `internal_link_unavailable` at the field path and nothing changes

#### Scenario: Target unpublished during publication
- **WHEN** a visible link's target is unpublished after the use case checked it but before the source's atomic publication commits
- **THEN** the atomic publication refuses with `internal_link_unavailable` on Node and Cloudflare

### Requirement: Delivery contains only the published projection
Every read of published content SHALL contain no hidden values: public entry
and global reads, the paged build export with its media dictionary and link
manifest, and the published snapshot returned by admin and MCP entry reads.
Draft reads, including admin draft lists and configured collection queries,
SHALL keep operating on draft values with hidden values retained. Delivered
representations SHALL acquire no visibility keys or computed visibility state,
and their shapes SHALL stay unchanged.

#### Scenario: Public read and build export
- **WHEN** a published gallery holds an `image` item whose draft also holds a `videoUrl`
- **THEN** the public entry read and the build export page return the item without `videoUrl`, and the export's media dictionary includes no media referenced only by hidden values

#### Scenario: Admin read shows both views
- **WHEN** an MCP client calls `get_entry` for that entry
- **THEN** the draft holds the stale `videoUrl` and the published snapshot does not

#### Scenario: Draft queries keep draft values
- **WHEN** an admin draft list filters a collection with `isSet` on a model-level target that one entry's draft holds while hidden
- **THEN** that entry matches, because draft queries read the retained draft value

### Requirement: Published value types make conditional targets optional
Typed published values SHALL mark every conditional target optional, even
when its descriptor is required or has a default, because the target is
absent when hidden. This SHALL apply to model field values, group values
(including list-item groups at every depth) and block data, using the
owner's declared rules. Unconditional fields and controllers SHALL keep their
existing optionality and value types. Owners without rules SHALL infer
exactly the types they inferred before. Draft value types SHALL be unchanged.

#### Scenario: Required target becomes optional
- **WHEN** a block declares required `media` and `videoUrl` with rules on `kind`
- **THEN** its typed published data has a required `kind` and optional `media` and `videoUrl`

#### Scenario: Unopted inference unchanged
- **WHEN** a block or model declares no rules
- **THEN** type tests show the same inferred published value types as before this change

### Requirement: The admin presents rules the server enforces
The admin SHALL evaluate `visibility` rules only from the validated model and
block metadata it receives, with the same effective-value semantics as the
server, and SHALL use them only for presentation: which fields are shown,
which problems are reachable, and how items are summarized. The admin SHALL
NOT remove, rewrite or reorder hidden values before saving, and SHALL NOT be
the enforcement of any rule; drafts saved from the admin SHALL be validated and
published by the server exactly as drafts from MCP, REST or `lace import`.

#### Scenario: Admin save keeps hidden values
- **WHEN** an editor saves an item with `kind: "image"` that still holds a `videoUrl` typed earlier
- **THEN** the draft request contains the `videoUrl`, the server validates it with draft semantics, and publication omits it from the published projection

### Requirement: Block settings keep a separate presentation-only rule
Block settings SHALL keep `settingsVisibility` as a separate rule and SHALL NOT
accept `visibility`. `settingsVisibility` SHALL remain presentation-only:
settings hidden by it keep their defaults, validation and public delivery.
Data `visibility` SHALL remain the only rule that changes requiredness and
published content. Both maps SHALL remain available on the same block without
either replacing the other.

#### Scenario: A block uses both rules
- **WHEN** a block declares `settingsVisibility` for `layoutWrap` and `visibility` for a data field `videoUrl`, and an editor hides both through their controllers and publishes
- **THEN** the published block keeps its `layoutWrap` setting and omits `videoUrl`

### Requirement: Every layer evaluates rules through one shared evaluator
Server validation, the published projection (publication, block migration,
published internal links and render), configuration synchronization (pruning
newly hidden published values, skipping hidden backfills and checking newly
visible published occurrences) and the admin SHALL decide whether a target is
visible through one shared evaluator exported by the portable content
package. The evaluator SHALL first compute each controller's effective value
in the occurrence and SHALL then match the target's rule against it. The
effective value SHALL be the controller's present value; a controller that is
absent, or holds `null` as a cleared form value, SHALL take its declared
default, and without a default it SHALL match no rule. No layer SHALL apply
its own default, cleared-value or absence handling. For the same field
definitions, rules and occurrence values every layer SHALL report the same set
of visible keys, on Node and Cloudflare. The published projection SHALL apply
the same effective values to the values it is given, so projecting values that
omit a defaulted controller treats the default as the controller value.
Existing validation results, published snapshots, delivered values and admin
presentation of normalized content SHALL remain unchanged.

#### Scenario: Default applies the same everywhere
- **WHEN** an occurrence omits required select `kind` whose default is `image`, `media` depends on `["image"]` and `videoUrl` on `["video"]`
- **THEN** server validation, the published projection, synchronization pruning and the admin all report `media` visible and `videoUrl` hidden

#### Scenario: Cleared controller in the admin
- **WHEN** an editor clears `kind` so the form holds `null` for it
- **THEN** the admin shows the targets of the default `image`, exactly as the server evaluates an occurrence that omits `kind`

#### Scenario: Optional controller without a default
- **WHEN** optional boolean `hasCta` has no default and is absent, and `ctaUrl` depends on `[true]`
- **THEN** every layer reports `ctaUrl` hidden

#### Scenario: Projection of values without a defaulted controller
- **WHEN** the published projection receives a group value that omits `kind` (default `image`) and holds both `media` and `videoUrl`
- **THEN** the projection keeps `media`, removes `videoUrl`, and keeps the key order of retained keys

#### Scenario: Parity on both runtimes
- **WHEN** the same model, nested group and list-item rules and values are published on Node SQLite and on Cloudflare D1, and pruned by a synchronization that adds those rules
- **THEN** both stored published snapshots hold exactly the keys the shared evaluator reports visible, and equal the keys the admin shows for those values
