## MODIFIED Requirements

### Requirement: Validation problems are shown where they occur and summarized
Every local or server validation problem SHALL be shown at its location. A
field problem SHALL be shown on its field. A block problem that belongs to no
single field SHALL be shown inside that block's card, together with a text
marker that the block has problems. Such problems include a disallowed or
unregistered type, a version that is not current, a missing, malformed, or
duplicate key, data for an undefined field, a setting the definition does not
declare, and an invalid hidden flag or settings object. A problem with the
block's anchor, class name or a declared setting SHALL be shown on that
control in the Settings tab. A problem with the block list as a whole SHALL be
shown with the block list. An existing block whose type the model no longer
allows SHALL still render as a card with a default icon, its type as label,
and its problem, so the writer can remove it. Field messages SHALL be complete
sentences that state what is wrong or what to enter. They SHALL NOT repeat
validator-internal phrasing and SHALL NOT include the rejected value.

When local validation blocks a Save, or the server rejects a save or publish
with validation issues, the editor SHALL show a validation summary above the
title and move focus to it. The summary SHALL state the number of problems to
fix. It SHALL list each problem in the editor's reading order: the title, then
each block in order (its block-level problems, its content fields, then its
anchor, declared settings and CSS classes), then the slug, then the model
fields. Each entry SHALL be a link that names the field and, for a block
field or setting, the block's label and position, and for a hidden block that
the block is hidden. Activating an entry SHALL move focus to that control, or
to the block card for a block problem, and scroll it into view; for a control
in a Settings tab it SHALL first select that tab. Because the list follows
reading order, the first block entry links to the first invalid block. A
server issue whose path does not match a visible location SHALL be listed as
text without a link. The summary SHALL replace the generic failure message for
validation rejections. It SHALL update as problems are resolved and disappear
when none remain.

A problem that only publication reports (a field required for publication or a list below minItems)
and that belongs to a block that is hidden SHALL be listed after the other
problems as not blocking publication, SHALL NOT be counted among the problems
to fix, and SHALL be shown on its control with the same note. When only such
problems remain, the summary SHALL state that the remaining problems are in
hidden blocks and do not block publishing. Every other problem in a hidden
block SHALL be counted and SHALL block Save as in a visible block.

The editor SHALL map server JSON Pointer issue paths as follows:

- `/title`, `/slug`, and `/fields/<key>` map to their controls.
- `/blocks/<index>/data/<key>` maps to that block's field.
- `/blocks/<index>/anchor` and `/blocks/<index>/className` map to that
  block's Anchor and CSS classes controls.
- `/blocks/<index>/settings/<key>` maps to that block's setting control when
  the definition declares `<key>`, and to the block otherwise.
- `/blocks/<index>/key`, `/type`, `/schemaVersion`, `/hidden`, and
  `/settings`, as well as `/blocks/<index>` and `/blocks/<index>/data`, map to
  that block.
- `/blocks` maps to the block list.

Pointers through composite fields SHALL traverse declared group keys and
in-range list indices to the exact leaf or container control. Unknown children
and out-of-range indices SHALL remain unlinked summary text. A deeper pointer
inside a scalar field or setting, such as a rich-text document, SHALL map to
that field or setting. Activation SHALL reveal every containing disclosure and
the block's appropriate tab before focus. Mapping SHALL preserve the writer's
complete local draft and dirty state.

#### Scenario: Local validation blocks a save
- **WHEN** a writer saves a draft whose second block has a text field below its
  minimum length and whose model field has an unsafe URL
- **THEN** no draft-save request is sent, focus moves to a summary stating two
  problems, the first entry names the block's label, its position 2, and the
  field, and each field shows a complete-sentence message

#### Scenario: A summary link reaches the first invalid block
- **WHEN** a writer activates the summary entry for a field in a collapsed block
- **THEN** the block is expanded, the field's control receives focus, and it is
  scrolled into view

#### Scenario: A summary link opens the Settings tab
- **WHEN** a writer activates the summary entry for a block's anchor while that
  block's Content tab is selected
- **THEN** the Settings tab is selected and the Anchor input receives focus

#### Scenario: Server issues map to the same locations
- **WHEN** the server rejects a save with issues at
  `/blocks/0/data/body/content/0`, `/blocks/1/anchor` and `/fields/summary`
- **THEN** the first block's Body field, the second block's Anchor input and
  the Summary field show the rejection, the summary lists all three with links,
  and the local values remain unchanged and dirty

#### Scenario: A server issue has no visible location
- **WHEN** the server rejects a save with an issue at a path the editor cannot
  map
- **THEN** the summary lists that issue's message as text without a link and
  no field is marked invalid

#### Scenario: A block of a disallowed type is loaded
- **WHEN** a writer opens an entry containing a block whose type the model no
  longer allows
- **THEN** the block renders as a card marked as having problems, states that
  its type is not allowed, and can be removed, after which Save is no longer
  blocked by it

#### Scenario: A publish is rejected with validation issues
- **WHEN** an admin publishes a draft and the server rejects it because a
  required model field is missing for publication
- **THEN** that field shows that it is required to publish and the summary
  links to it

#### Scenario: Hiding a block makes its publication problems non-blocking
- **WHEN** a publish is rejected because a required field of the second block
  is empty, and the writer then hides that block
- **THEN** the summary lists that problem as being in a hidden block that does
  not block publishing, no longer counts it, and Save and publish is not
  blocked by it

#### Scenario: A draft problem in a hidden block still blocks Save
- **WHEN** a writer saves a draft whose hidden block has a text field above its
  maximum length
- **THEN** no draft-save request is sent and the summary counts the problem and
  names the block as hidden

#### Scenario: Fixing problems clears the summary
- **WHEN** a writer corrects every listed problem and saves again
- **THEN** the summary disappears and exactly one complete-draft request is
  sent

## REMOVED Requirements

### Requirement: Composite data is safely inspectable before nested authoring
**Reason**: CE7C replaces transitional read-only JSON inspection with generic recursive controls.
**Migration**: Existing composite JSON loads unchanged in recursive fields. No content migration or persisted item identity is introduced; lifecycle and draft-mode guarantees continue below.

## ADDED Requirements

### Requirement: Composite fields support recursive generic authoring
The editor SHALL render groups as labelled fieldsets with descriptions and
nested controls and lists as labelled ordered repeatable items in every model
kind and block data. Scalar, media and rich-text leaves SHALL use the existing
controls and authorization rules. Group absence SHALL be distinguishable from
present `{}`, and list absence from present `[]`. Opening or collapsing a
field SHALL NOT materialize data, apply defaults or dirty the form. Writers
SHALL be able to create an absent group/list, clear a named field to absence,
and retain explicit empty objects/arrays. Defaults SHALL follow the shared
recursive contract. Clearing an item leaf SHALL NOT create a null/undefined
list slot: scalar items are removed through Remove. An incomplete group item
SHALL remain a valid draft starting point.

#### Scenario: Nested controls across content kinds
- **WHEN** a writer opens model or block fields containing a group with a nested list of groups and media/rich-text leaves
- **THEN** every value has a labelled editable control using the existing picker and safe rich-text toolbar

#### Scenario: Absence and explicit emptiness
- **WHEN** a writer creates an absent optional group, leaves it empty, creates an empty list and saves
- **THEN** the payload contains explicit {} and [], subject to declared child defaults, without synthesizing unrelated optional containers

#### Scenario: Clear a field with a default
- **WHEN** a writer clears a named nested field and saves
- **THEN** the field is omitted from the payload and the confirmed normalized response applies its declared default exactly as the shared validation contract requires

#### Scenario: Read-only inspection
- **WHEN** a viewer opens composite data
- **THEN** every nested value is inspectable and disclosures are operable, while editing, picker/upload, Add, Remove, Duplicate and reorder actions are unavailable

### Requirement: List operations preserve item content and editing identity
Writers SHALL be able to Add, Remove, Duplicate, Move up/down and reorder by
pointer or keyboard drag within each list, including scalar lists. Add SHALL
use a detached declared item default, otherwise a draft-valid group with child
defaults or a draft-valid scalar starting value. When a scalar has no valid
empty starting value, Add SHALL request a value and commit only when valid;
cancel SHALL leave the list unchanged. Duplicate SHALL insert an independent
deep copy immediately after the source. Remove SHALL affect only its item.
Move boundary actions SHALL be disabled; cancelled drag SHALL preserve order.
Actions SHALL name the list, item and position accessibly and announce results.
Focus after insertion SHALL reach the new item, after removal the next item,
then the previous item, then Add for an empty list; move focus SHALL follow
the item. Nested lists SHALL reorder only within their own list.

Complex items and groups SHALL be collapsible with summaries, item counts and
problem indicators. Summaries SHALL use nonblank itemLabel text when declared,
otherwise the first useful text/textarea, rich-text plain text, URL/select,
then a generic media-selected label, then Empty item. Summaries SHALL collapse
whitespace, truncate long text and never expose media IDs or raw rich-text JSON.
Accessible names SHALL include current one-based position to disambiguate
identical items. Moves and collapse SHALL preserve local values, field errors,
media state and rich-text editor state/selection where applicable. UI item
identity SHALL be independent of values and array positions, detached on
Duplicate, and excluded from saves, copied JSON and public responses.

#### Scenario: Duplicate then edit nested content
- **WHEN** a writer duplicates a group with a nested link list and changes the duplicate's URL
- **THEN** the original stays unchanged, the duplicate follows it and saved JSON contains ordinary arrays/objects without UI IDs

#### Scenario: Equal scalar values have distinct editing identities
- **WHEN** a writer reorders two equal scalar items and then removes one
- **THEN** only the selected item's editing state is removed and the remaining item retains its state

#### Scenario: Move and collapse a rich-text item
- **WHEN** an item with edited rich text, media selection and a field error moves and is collapsed then reopened
- **THEN** those values, selection where applicable and error remain associated with that item

#### Scenario: Scalar insertion requires a value
- **WHEN** a number list has no item default and min 10, and a writer chooses Add
- **THEN** the editor requests a valid number before insertion, and cancellation leaves the array unchanged

#### Scenario: Nested keyboard reordering
- **WHEN** a keyboard user reorders a child-list item and cancels a second drag
- **THEN** only the child list changes, the second drag leaves its order intact, focus is visible and positions are announced without internal IDs

### Requirement: Composite editing explains normalized list budgets
Each list SHALL show its count and effective maximum and any publication
minimum. The editor SHALL show entry-wide usage against 500 elements, counting
normalized defaults and all nested list lengths across model fields and block
data including hidden blocks. Growing actions, including Add, Duplicate and
container creation, SHALL preflight the prospective normalized snapshot and
be disabled with an accessible explanation when a list maximum or aggregate
budget would be exceeded. Block Add/Duplicate and nested default
materialization SHALL obey the same budget gate. Removal, collapse and moves
SHALL remain possible to recover. Required/minimum issues SHALL be labelled
as publication-only and SHALL NOT prevent saving otherwise-valid drafts;
maxima, wrong present values and payload-size failures SHALL block draft save.
The server SHALL remain authoritative for validation and authorization.

#### Scenario: Nested duplication exhausts the entry budget
- **WHEN** current usage is 490 and duplicating an item would add one outer item and ten inner items
- **THEN** Duplicate is unavailable with a limit explanation and the draft remains unchanged

#### Scenario: Exact budget and list boundaries
- **WHEN** a prospective edit results in exactly 500 total elements and no list exceeds its maximum, or results in 501 or a list above its maximum
- **THEN** the first is allowed and the latter actions are prevented, including contributions from hidden blocks and defaults

#### Scenario: Publication-only minimum
- **WHEN** an incomplete group or list below minItems is saved
- **THEN** Save succeeds if all present values are valid, and publication guidance distinguishes the missing required/minimum values from draft-blocking errors

### Requirement: Recursive validation reaches exact visible controls
Local and server validation SHALL preserve exact group-key/list-index paths
and show errors at the matching scalar or container control. Rich-text-internal
paths SHALL target their enclosing rich-text field. Summary entries SHALL
follow existing editor reading order with nested descriptor order and list
position order, use readable labels/one-based positions and distinguish
publication-only problems. Activating a nested problem SHALL select the
relevant block tab, reveal the block and every containing disclosure, then
focus and scroll to the exact control; a container problem SHALL focus its
labelled container. Hidden-block required/minimum publication issues SHALL
remain non-blocking as in the accepted hidden-block contract. Unresolvable
paths SHALL remain summary text without a guessed leaf target. After structural
edits, local issues SHALL be recomputed and server issues for surviving items
SHALL follow their UI identity; removed-item issues SHALL disappear. Old
asynchronous responses SHALL NOT attach indexed issues to different items.

#### Scenario: Reveal a nested invalid URL
- **WHEN** the server reports /blocks/0/data/links/2/url and its block and item are collapsed
- **THEN** activating the summary opens Content, the block and all containing disclosures and focuses item 3's URL with its accessible error

#### Scenario: Container and unknown paths
- **WHEN** validation reports list_too_short at /fields/links and another issue under an unknown child
- **THEN** the list issue targets the list container and the unknown issue stays visible without a misleading focus link

#### Scenario: Errors follow surviving items
- **WHEN** an item with a server error moves from position 3 to position 1 and another item is removed
- **THEN** its error remains on that same item at position 1 and errors belonging to the removed item disappear

### Requirement: Composite authoring preserves draft lifecycle recovery
Initialization, scalar edits, save normalization, dirty comparison, discard,
reload, unsaved-navigation guards, save shortcuts, revert, block duplication
and entry lifecycle actions SHALL retain complete recursive values and order,
including {} and []. Local clear sentinels SHALL be removed only from named
fields and never used to filter or shift list indices. View-only disclosures
and summaries SHALL NOT create unsaved changes. A revision conflict or failed
save/publish SHALL preserve the complete local draft; Copy my JSON SHALL
contain content only with no transient item identities. Save success SHALL
use the returned normalized draft as baseline. Pending mutations SHALL prevent
structural edits or reconcile response paths to the exact submitted item
identities, so indexed server errors cannot refer to a changed array.

#### Scenario: Conflict after nested edits
- **WHEN** a writer edits and reorders nested data and Save receives a revision conflict
- **THEN** local content and order remain available, Copy my JSON includes every nested value and no UI IDs, and explicit reload adopts the server draft

#### Scenario: Save and discard remain predictable
- **WHEN** a writer saves nested edits, edits them again and discards
- **THEN** the confirmed normalized draft is restored, explicit empty containers survive and the form is clean
