# ADR 0018: Conditional fields

- Status: accepted; SM5A and SM5B implemented, SM5C builds on it
- Date: 2026-11-01

## Context

Migrated portfolio content needs fields that apply only in some cases, such as
a gallery item whose `kind` decides whether `media` or `videoUrl` is filled.
CE9 deferred conditional forms. LIST2 added block `settingsVisibility`, a
presentation-only exception: hidden settings stay validated and delivered.
Owner decision 6 of the site-migration roadmap selects conditional fields as a
complete system: visibility, validation, value retention and delivery.

## Decision

Field-map owners (models, `field.group` including list-item groups, and block
data) declare an optional `visibility` map. Each key names an immediate sibling
target; each rule is exactly `{ field, values }`. The controller is an
immediate sibling `select` or `boolean`, never the target itself and never a
target of another rule (no chains). `values` is a nonempty unique subset of the
select's options or of `true`/`false`. Controllers may be optional. Scalar and
list descriptors, scalar list items and block settings take no rules; settings
keep `settingsVisibility`.

A target is visible when the controller's effective value (present value,
else declared default) is listed. An absent controller without a default
matches nothing, so its targets are hidden. Evaluation reads only the same
object occurrence; each list item evaluates independently; a hidden container
hides its subtree.

Validation normalizes unconditional fields first, then each target: visible
targets use the selected mode, hidden targets always use draft semantics.
Hidden fields are never required and never need `minItems`; types, options,
URL and rich-text safety, lengths, ranges and `maxItems` still apply. Hidden
values stay in drafts. A pure published projection removes hidden targets
recursively without changing list shape.

Rules are structural: they enter structure identity, need a model version
increase, and block data rules are block definition changes. Configuration
sync reports `field-visibility-added` (compatible), `field-visibility-removed`
(validated) and `field-visibility-changed` (compatible when strictly narrowed,
else validated). Sync prunes newly hidden values from published snapshots in
its guarded mutation, advancing the published-state version and requesting one
build ([ADR 0007](0007-schema-evolution-during-sync.md)); drafts keep values.
Global `seoDefaults` may not name a conditional field.

SM5A ships the declaration, validation, projection, identity, metadata and
sync behavior. SM5B applies the projection to publication and delivery: the
publish use case computes the projected fields, block data and their media and
internal-link references, and the guarded atomic publication writes them when
the model or a draft block declares rules; render removes hidden block data and
published value types make targets optional. SM5C adds admin show/hide.

## Rejected alternatives

- **Per-field `visibleWhen: { field, equals | in }`.** A field builder does not
  know its siblings, so types cannot check controller keys or option literals,
  and shared field objects would carry rules into other owners. Every other
  sibling reference already lives on the owner.
- **Validating hidden fields by type only.** It adds a third validation tier and
  lets stored drafts violate constraints that drafts always satisfy.
- **Clearing hidden values on save.** It loses work when an editor toggles a
  controller back.
- **Extending `settingsVisibility` to data.** Settings rules are presentation
  only; data rules change validation and delivery, so they stay separate.

## Consequences

Editors and import can leave inapplicable fields empty while the server still
enforces applicable ones. Removing a rule from a required field can be refused
when published items lack the value; the remedy matches making a field
required today. Revert restores published values, which carry no hidden
values. Older engines reject configurations that use `visibility`.
