## Context

See proposal.md for the CE7C scope. CE7A added recursive descriptors, values,
validation paths and budgets; CE7B added recursive synchronization. The existing
`FieldRenderer` uses one Controller per root field and `FieldControls` still
provides composite inspection. `editor-form.ts` currently validates composites
as a whole, strips cleared values only at root keys and truncates nested issue
locations to a root field. `validation-problems.ts` enumerates root fields.
`EntryPage` maps server issues into form errors and owns save/reload baselines.
`BlockEditor` has its own sortable block context and collapse/tab state keyed
by block key. Its useFieldArray is appropriate for block objects but cannot be
copied directly for primitive list arrays.

These are client-side changes over the existing fields/block JSON. The package
direction and portability rules in architecture §6 remain. The transitional §17
paragraph and §8 presentation rules must be updated before production edits.

## Goals / Non-Goals

**Goals:** one recursive field implementation for model and block data, stable
UI identity through edits, exact error focus, and budget checks matching shared
normalization. Use existing design tokens and controls across desktop/375px
and both themes. Keep every non-mutating disclosure accessible to viewers.

**Non-Goals:** source/runtime-specific editors, storing form identities, new
query persistence, database migrations, CE7D example blocks, CE9 layout hints
or additional drag libraries. No arbitrary summary callbacks or templates.

## Decisions

### 1. Add narrowly scoped presentation metadata

`field.list({ item: field.group(...), itemLabel: "title" })` accepts an immediate
text/textarea/select/url child key. `packages/content` owns normalization,
readonly metadata and type contracts. Validate strings and child membership at
runtime, including forged descriptors. Avoid an unnecessarily complex generic
API: value inference is unchanged; runtime validation rejects invalid targets.
`packages/contracts` carries this optional property through the existing shared
metadata validator and recursive OpenAPI schema. Configuration canonicalization
and recursive sync comparisons exclude it at list descriptor positions only.
Verify model, block and whole-config structure/projection hashes; default or
field keys named itemLabel remain structural. Existing fixtures without the
option are pinned. Removing/renaming its target requires updating itemLabel in
the configuration or configuration validation fails before sync.

Use label text as plain React text, collapse whitespace and truncate visually
at 80 characters, retaining an accessible full label. Fallback traverses useful
scalar leaves in declaration order without showing raw IDs; include current
position in accessible action names. This metadata is projection-only, like a
field description, and needs no version increase or block migration. Rejected:
callbacks, arbitrary templates and nested selector paths add execution or
ambiguous resolution to portable form metadata.

### 2. Keep recursive values and UI identities separate

Add recursive field composition inside `entities/content`, retaining the
renderer provider so media and rich-text controls remain higher-layer
integrations. Groups use fieldset/legend, description and a disclosure button.
Lists have a labelled focusable container and ordered item rows. A viewer's
native editable controls stay disabled, but disclosures sit outside disabled
fieldsets. Mutation actions are separately permission/busy gated.

Use a root Controller for a composite and recursive value/onChange composition
inside it, rather than nested Controllers competing for the same value. Build
leaf control IDs and issue paths from typed key/index segments. One list adapter
handles both object and scalar arrays without React Hook Form's unsupported
flat useFieldArray. An editor-scoped sidecar tree allocates opaque UI tokens for
items and keys descendant state by ancestor item tokens plus field keys. Move
splices values and identity subtrees together; Duplicate deep-clones values and
allocates new tokens for the entire copied subtree; Remove drops that subtree.
Equal values are never used as keys. Block ancestry uses persisted block keys.

Keep item subtrees mounted when collapsed using hidden/inert presentation, so
Tiptap instances, selection bookmarks and media UI state survive collapse.
Stable item keys preserve instances on reorder; scalar renderer state receives
current paths without changing its React key. Selection bookmarks restore only
when returning to that editor, without stealing focus from action buttons.
Focus insertion on the first control (or item heading), removal on adjacent
item heading/Add, and movement on the moved action/handle. This also provides
predictable pointer and keyboard behavior when data is visually identical.

Identity/reset policy: initialize tokens on load; preserve them on normal
same-shape normalized save responses by submitted order; rebuild on explicit
reload/discard/revert or metadata change. Resetting is never a dirty change.
Transient tokens are never assigned as properties of the content objects and
all serializers accept only content values. No public envelope is introduced.
Rejected: index/content keys and exposing synthetic IDs in stored group data.

### 3. Explicit absence, defaults and item creation

Opening a disclosure never changes data. Absent named containers show Create;
Create group yields a present object with applicable child defaults and Create
list yields [], overriding a whole-list default. Clear removes a named field
on serialization and the server's normal default behavior is explained in the
control. Present {} and [] must never be collapsed to absence.

Add first clones the item's declared default and applies shared recursive draft
normalization. Otherwise a group starts with its applicable child defaults;
text/textarea/url/media/date/datetime/number/select/rich-text items use existing
controls to collect a draft-valid value if a valid empty value is unavailable.
Boolean can start false; text can start empty only when shared validation accepts
it. The inline labelled insertion editor has Add/Cancel and no committed slot
until valid. Cleared scalar item input is transient editing state, not a null
slot or implicit removal: keep the prior committed value, show a blocking
control error and prevent save until corrected or Remove is chosen. This avoids
silently shifting indices or creating content the server rejects.

Recursive clear serialization omits sentinels only at named object properties;
it preserves array order/length, rejects invalid slots and treats rich-text JSON
as a scalar document rather than field data. Use the same content serialization
for save, conflict JSON and dirty comparisons. Rejected: filtering falsy array
values or serializing form internals as content.

### 4. Central prospective budget gate

A pure editor helper takes metadata and current values, applies recursive
defaults using shared validation semantics and counts only descriptor-defined
lists. Reuse exported limits and normalization; do not count block/rich-text
arrays. The helper must collect budget feedback even when other leaves are
invalid, without swallowing those validation errors. Walk missing containers
only when their defaults apply; inspect all blocks, including hidden ones.

Every growth operation computes a full prospective snapshot before committing,
including nested defaults/copies and block Add/Duplicate. Also gate container
creation/clearing when applied defaults could increase usage. Exactly 100 (or
a lower declared maximum) and 500 are allowed. Display counts and the disabled
reason near actions. Moves/removal remain available; maxima/byte limits remain
validated by shared draft rules and the server. Do not invent a client media
reference algorithm: retain authoritative server media/payload errors and
existing control behavior. Budget feedback is advisory when legacy/unknown
block metadata cannot be evaluated; server failures remain visible.

### 5. Recursive error identity and reveal protocol

Extend descriptor/path traversal in `editor-form` to collect all draft issues,
publication guidance and root/container errors; preserve scalar message quality.
Render errors through the composite subtree without flattening everything to
its parent. Maintain typed paths (keys versus indices), canonical JSON Pointer
transport, and readable one-based breadcrumb labels. Rich-text stops traversal
at the descriptor leaf. Unknown paths stay visible without guessed targets.
`validation-problems` walks fields/items recursively in reading order and
retains SEO/settings/hidden-block conventions. Required and list_too_short are
publication-only; hidden blocks receive their existing non-blocking treatment.

Server issue records are anchored to item tokens at receipt, derived from the
submitted snapshot. Surviving item tokens carry issues through move, edits
revalidate/clear affected issues and removal deletes them; duplication never
copies stale server errors. Derive current indexed display paths from tokens.
Disable all content mutations while save/publish/reload/revert is pending, while
allowing disclosures; this eliminates response-index races. Guard obsolete
responses after entry replacement using the existing mutation lifecycle.

Summary activation dispatches a typed reveal request through the editor-owned
registry: select Content for block data (Settings for envelope/settings), expand
block, open ancestor groups/items from outside inward, then focus the registered
leaf or container after React commits and scroll it into view. Use stable
registrations instead of guessing CSS selectors or arbitrary fixed delays.
Preserve summary focus on rejection and existing save shortcuts/navigation guards.

### 6. Reuse sorting and accessibility primitives

Each list gets its own dnd-kit scope and sortable IDs from the sidecar. Nested
scopes isolate drop targets; block drag does not claim item handles. Provide
Move up/down independently of drag, keyboard drag cancellation and list/item
position announcements. Drag only from the dedicated handle, keeping text
selection and media interaction usable. New actions use shared Buttons and
disclosure patterns, accessible names, visible focus, reduced-motion support
and design tokens. Axe runs without globally disabled rules, in both themes
and narrow layouts. No extra dependency or generic global state library.

## Risks / Trade-offs

- [Nested renderer remounts or stale paths lose selection/errors] → token-based
  keys, mounted disclosures and tests with identical items and nested reorder.
- [Mounted rich-text controls increase DOM size] → bounded 500-item data,
  lightweight summaries and browser checks with boundary fixtures; avoid eager
  duplicate network reads beyond existing media query caching.
- [Defaults consume unexpected budget] → preflight full normalized candidates,
  including creation, block copies and hidden blocks; unit fixtures at 499/500/501.
- [Metadata hash stripping removes content keys] → descriptor-position removal,
  pinned fixtures and itemLabel keys in defaults/field maps.
- [Indexed response maps to a newer array] → busy mutation lock and server-error
  anchors established against the immutable submitted snapshot.

## Migration Plan

1. Update architecture §§8/17 and ADR 0013 with these contracts during apply.
2. Ship metadata/contracts/configuration and generic controls together; regenerate
   OpenAPI through the repository script and preserve metadata compatibility.
3. Existing snapshots need no rewrite. Operators may add itemLabel and run normal
   sync without a version bump. Rollback to the previous admin restores read-only
   inspection without changing data; remove newly introduced itemLabel options
   before running an older engine that rejects unknown metadata.
4. Run focused package/component tests and browser regression flows, then root
   typecheck, lint, format check and strict change validation. Record evidence in
   the roadmap; sync/archive only on a later explicit request.

No new persistence transaction, SQL migration, runtime adapter or telemetry
stream is required. Existing save atomicity, revisions, media authorization and
failure reporting remain authoritative in Node and Cloudflare. Browser logs and
announcements must not include copied payloads or raw media/item identities.
