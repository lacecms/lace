## Purpose

Defines conditional fields: portable `visibility` rules that make a field
apply only when a sibling `select` or `boolean` controller holds selected
values, including how rules are declared, checked, evaluated, retained in
drafts and omitted from published content.

## ADDED Requirements

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
