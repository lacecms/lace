## Purpose

Defines how the admin draft editor renders and validates fields: scalar, rich-text, SEO, composite, URL and conditional controls with their guidance and layouts.

## ADDED Requirements

### Requirement: Draft fields are rendered from validated model metadata
The authenticated entry route SHALL load the requested entry and its matching
configured model before presenting editable content. It SHALL render the title
of a page or collection entry, the
collection-only slug, and every supported model-field descriptor from the
validated serializable metadata supplied by the model API. The field surface
SHALL cover text, textarea, rich text, number, boolean, date, datetime, select,
URL, and media descriptor types; it SHALL not execute callbacks or accept
unvalidated descriptor data from a response. Select fields SHALL choose from
the descriptor's options through a labelled listbox control, and an optional
select SHALL offer a choice that clears its value. Date fields SHALL be chosen
from a keyboard-operable calendar and SHALL display the chosen calendar date in
words. Datetime fields SHALL combine that calendar with a time input and SHALL
state that the time is in UTC; they SHALL store a UTC ISO timestamp. Optional
date and datetime values SHALL be clearable. Boolean fields SHALL be a labelled
switch that exposes its on or off state. URL fields SHALL offer to open an
entered `http` or `https` URL in a new browsing context. Editable values SHALL
be locally validated against the same client-safe descriptor constraints before
save, and each field error SHALL be programmatically associated with its
control, which SHALL also be marked invalid.

#### Scenario: A configured form is loaded
- **WHEN** an authenticated writer opens an entry whose model has text, number,
  boolean, select, date, datetime, URL, media, textarea, or rich-text fields
- **THEN** the draft values appear in controls generated from their descriptor
  metadata with accessible labels, descriptions where configured, and the
  descriptor-appropriate constraints

#### Scenario: A writer picks a select option and a date
- **WHEN** a writer opens a select field, chooses the "release" option, then opens a date field's calendar and chooses 25 September 2026
- **THEN** the select shows "release", the date control reads "Sep 25, 2026", and the next complete-draft save carries `release` and `2026-09-25`

#### Scenario: A writer sets a datetime
- **WHEN** a writer chooses 25 September 2026 and enters 14:30 in a datetime field
- **THEN** the next complete-draft save carries `2026-09-25T14:30:00.000Z` and the control states that the time is UTC

#### Scenario: A writer toggles a boolean
- **WHEN** a writer activates a boolean field's switch with the keyboard
- **THEN** the switch reports that it is on and the next complete-draft save carries `true`

#### Scenario: Client validation prevents an invalid save
- **WHEN** a writer submits a draft with an invalid
  select choice, a string or numeric value outside declared bounds, or another
  locally detectable descriptor violation
- **THEN** the affected control exposes an accessible error and the browser does
  not issue a draft-save request

#### Scenario: Model metadata is malformed or does not match the entry
- **WHEN** the entry route receives invalid model metadata, the model key does
  not exist, or the entry belongs to another model
- **THEN** it presents a safe error or not-found state and does not expose an
  editable form using unvalidated metadata

#### Scenario: Incomplete draft remains savable
- **WHEN** a writer saves an otherwise valid draft with a missing required model or block field
- **THEN** the draft save is allowed, while publication still applies the existing required-field rules and hidden-block exception

### Requirement: System fields have predictable collection-slug behavior
Every page and collection entry editor SHALL present title as an explicit
required system field. A global editor SHALL not render a title control,
because a global's title is its model label and is owned by the system. A
collection editor SHALL additionally present slug as an explicit system field;
a page or global editor SHALL not render a slug control. A collection writer
MAY opt into slug suggestions derived from title. While suggestion is enabled
and the slug has not been manually changed, title edits SHALL update the
suggested slug; a manual slug edit SHALL stop automatic updates until the
writer explicitly re-enables suggestions. An empty slug control SHALL mean
that the draft has no slug: a complete-draft save SHALL omit the slug, and a
collection entry without a slug SHALL read as having no unsaved changes once it
is loaded or saved.

#### Scenario: An opted-in suggestion follows a title
- **WHEN** a writer enables slug suggestions for an unedited collection slug
  and changes the title
- **THEN** the slug control receives the deterministic slug suggestion and the
  writer can save the suggested value as part of the complete draft

#### Scenario: A manual slug is preserved
- **WHEN** a writer manually changes a collection slug after enabling
  suggestions and subsequently changes the title
- **THEN** the manually entered slug remains unchanged and automatic suggestion
  stays disabled until the writer explicitly opts in again

#### Scenario: A page entry is edited
- **WHEN** a writer opens a page entry
- **THEN** the editor renders title and model fields but no slug control or slug
  suggestion affordance

#### Scenario: A global entry is edited
- **WHEN** a writer opens the `settings` global
- **THEN** the editor renders its model fields without a title or slug
  control, and a complete-draft save carries the stored title unchanged and no
  slug

#### Scenario: A collection entry without a slug is saved
- **WHEN** a writer changes the title of a new or duplicated collection entry
  that has no slug and saves
- **THEN** the complete-draft request carries no slug and the editor shows the
  saved revision without unsaved changes

### Requirement: Rich text is edited only through the shared safe document subset
The editor SHALL provide rich-text controls for model rich-text fields and
rich-text block fields that create and edit the shared structured document
format. It SHALL enable only the shared allowed nodes, marks, heading levels,
and link URL forms, and SHALL not enable raw HTML input, HTML nodes, arbitrary
attributes, inline event handlers, styles, or unsafe link schemes. Every
document the editor produces, whether through the toolbar, a keyboard
shortcut, an input rule, or paste, SHALL pass the shared rich-text validation;
link marks SHALL carry href plus only optional target "_blank" and rel "nofollow", with unchecked options omitted rather than serialized as null; lists, code blocks and horizontal rules SHALL carry no attributes. Code blocks SHALL contain only unmarked text and preserve spaces, tabs and line breaks, including empty code blocks. H1–H4 SHALL remain available without rewriting existing headings. All rich-text leaves inside groups, lists and block data SHALL use this same feature set without per-field restrictions.
Invalid rich-text values SHALL expose an accessible local field error and SHALL
not cause a complete-draft request.

Each editable rich-text field SHALL show a fixed toolbar named after its field.
The toolbar SHALL offer the following controls:

- a text-style choice of Paragraph, Heading 1, Heading 2, Heading 3, and Heading 4;
- Bold, Italic, Strike, and Code toggles;
- Bulleted list, Numbered list, and Quote toggles;
- a plain Code block toggle and an Insert horizontal rule action;
- a Link control.

Each toggle SHALL expose whether its format is active at the current
selection, and the text-style choice SHALL show the current block's style. The
toolbar SHALL be a single tab stop whose controls are reached with the arrow,
Home, and End keys. Each control whose action has a keyboard shortcut SHALL
name it visibly on hover or focus and programmatically. The editor SHALL
support these shortcuts: undo and redo; the bold, italic, strike, and code
marks; the lists, quote, heading, and paragraph styles; `Shift+Enter` for a
line break; `⌘K`/`Ctrl+K` to open the link control; and `Alt+F10` to move focus
from the text to the toolbar. Escape SHALL return focus from the toolbar to the
text.

The Link control SHALL open a labelled URL input prefilled with the current
link's URL and independent Open in a new tab and nofollow switches, prefilled from the existing link and unchecked for a new link. Applying SHALL store target "_blank" only when new-tab is checked and rel "nofollow" only when nofollow is checked; renderer-derived noopener/noreferrer SHALL NOT be stored. Editing SHALL allow either option to be cleared independently. Selection SHALL remain attached to the original text while the popover controls have focus. It SHALL accept only URLs permitted by the shared allowlist; a
rejected URL SHALL leave the document unchanged and show an accessible error
that states the permitted forms. Applying a URL SHALL link the selection, or
the whole existing link when the cursor is inside one, or insert the URL as
linked text when nothing is selected. A Remove link action SHALL remove the
link. Closing the control SHALL return focus to the text without changing the
document.

An empty editable rich-text field SHALL show a placeholder that is also exposed
to assistive technology, and an empty heading SHALL show its heading level as
a placeholder. A read-only rich-text field SHALL show no toolbar and no
placeholder.

#### Scenario: A writer formats safe rich text
- **WHEN** a writer applies an allowed mark, heading, list, quote, hard break,
  or allowed link to rich text
- **THEN** the editor stores the corresponding structured document in the draft
  field without serializing raw HTML

#### Scenario: Unsafe rich text is prevented locally
- **WHEN** a rich-text value contains an unsupported structure or an unsafe link
  URL before Save
- **THEN** the affected control exposes an accessible validation error and the
  browser sends no draft-save request

#### Scenario: A link and a numbered list stay valid
- **WHEN** a writer links selected text to `https://example.com` and turns a
  paragraph into a numbered list
- **THEN** the stored document passes the shared rich-text validation, the link
  mark carries its URL without unchecked optional attributes, and the next Save sends a complete-draft request

#### Scenario: An unsafe link is refused in the link control
- **WHEN** a writer enters `javascript:alert(1)` in the link control and applies
  it
- **THEN** the control shows an error naming the permitted URL forms, the
  document is unchanged, and the field shows no validation error

#### Scenario: The toolbar reflects the selection
- **WHEN** a writer places the cursor inside bold text in a Heading 2
- **THEN** the Bold toggle reports that it is pressed and the text-style
  control shows Heading 2

#### Scenario: A writer formats with the keyboard only
- **WHEN** a writer presses `Alt+F10` in the text, moves to Italic with the
  arrow keys, activates it, and presses Escape
- **THEN** italic is toggled at the selection and focus returns to the text

#### Scenario: A writer opens the link control with the keyboard
- **WHEN** a writer selects text and presses `⌘K` or `Ctrl+K`
- **THEN** the link control opens with focus in its URL input

#### Scenario: An empty field shows its placeholder
- **WHEN** an editable rich-text field has no text
- **THEN** it shows a placeholder that is exposed as the control's accessible
  placeholder, and a viewer sees neither the placeholder nor the toolbar

#### Scenario: Expanded features remain editable
- **WHEN** a writer opens an existing document containing H1–H4, a horizontal rule, an empty or multiline code block and links with any of the four new-tab/nofollow combinations
- **THEN** opening preserves every feature without dirtying the draft, and the writer can create, change and remove those features through the fixed toolbar

#### Scenario: Link choices are independent
- **WHEN** a writer applies each combination of new-tab and nofollow, reopens the link and clears either switch
- **THEN** the link retains exactly the selected supported attributes after save/reload and no null or renderer-derived attributes are stored

#### Scenario: Link controls preserve the selected text
- **WHEN** a writer selects text, opens Link, focuses its URL and switch controls, then applies or removes a link
- **THEN** only the original selection or whole current link is updated and focus returns to the editor

#### Scenario: Ordinary paste remains safe
- **WHEN** a writer pastes ordinary HTML containing supported formatting alongside unsafe URLs or unsupported styles and attributes
- **THEN** accepted pasted content uses only the shared safe document format and an invalid resulting value cannot be saved

#### Scenario: Viewers inspect expanded documents
- **WHEN** a viewer opens a document containing the expanded features and selects text or uses a formatting shortcut
- **THEN** all content remains inspectable without mutation, fixed toolbar, bubble menu or editing popover

### Requirement: The editor edits the SEO group of SEO-enabled entries
The editor of a page or collection entry whose model enables SEO SHALL show an
*SEO* card in the right-hand column after the *Fields* card. The card SHALL
hold, in this order, an "SEO title" input, an "SEO description" text area, an
"SEO image" media control using the existing media picker, a "Canonical URL"
input, a "Hide from search engines" switch and a search-result preview. The
editor of a model without SEO, including every global, SHALL show no SEO card.

The SEO values SHALL be part of the draft form: changing one SHALL mark the
draft unsaved, and loading, saving, publishing, discarding unsaved changes,
reverting to published and adopting a reloaded server draft SHALL reset them
to the loaded values. "Copy my JSON" SHALL include them. For an SEO-enabled
model, every draft save SHALL carry a complete `seo` object with `title`,
`description`, `image`, `canonical` and `noindex`, where blank or
whitespace-only text and a removed image are sent as `null` and `noindex` is a
boolean. A save of an entry whose model has no SEO SHALL carry no `seo` key.
Viewers SHALL see the SEO values and the preview read-only, with the SEO image
shown without picker actions.

#### Scenario: Edit and save SEO values
- **WHEN** an editor opens the post "Hello" of an SEO-enabled collection, types
  "Hello from Lace" as the SEO title, checks "Hide from search engines" and
  saves
- **THEN** the draft is marked unsaved before the save, and the save request
  carries `seo` `{title: "Hello from Lace", description: null, image: null,
  canonical: null, noindex: true}`

#### Scenario: Clearing a stored value
- **WHEN** an editor clears the stored SEO description "Old text" and saves
- **THEN** the save request carries `seo.description` `null` and the reloaded
  draft has no SEO description

#### Scenario: Choose an SEO image
- **WHEN** an editor chooses an image through the SEO image control and saves
- **THEN** the card shows the selected image with its filename and alt text,
  and the save request carries its media ID as `seo.image`

#### Scenario: Revert restores SEO values
- **WHEN** an editor changes the SEO title of a published entry and reverts to
  the published version
- **THEN** the SEO title input shows the published SEO title again and the
  draft is not marked unsaved

#### Scenario: Model without SEO
- **WHEN** an editor opens and saves an entry of a model without SEO
- **THEN** no SEO card is shown and the save request has no `seo` key

#### Scenario: A viewer opens an SEO-enabled entry
- **WHEN** a `viewer` opens an entry with a stored SEO title and image
- **THEN** the SEO card shows the title, the image without Choose media,
  Replace or Remove, and the preview, and none of its controls accept edits

### Requirement: SEO text shows its length against recommendations
The SEO title and SEO description SHALL each show a visible character count of
the trimmed text in code points against a recommended length of 60 for the
title and 160 for the description, as part of the control's accessible
description. When the count exceeds the recommended length, a warning
associated with the control SHALL say that search results may shorten the
text. The warning SHALL NOT block saving or publishing and SHALL disappear
when the count is back within the recommendation. Neither the count nor the
warning SHALL be announced on every keystroke.

#### Scenario: Title within the recommendation
- **WHEN** an editor types a 45-character SEO title
- **THEN** the title shows "45 / 60" and no length warning

#### Scenario: Long description warns without blocking
- **WHEN** an editor types a 180-character SEO description and saves
- **THEN** the description shows "180 / 160" with a warning that search results
  may shorten it, and the save request is sent

#### Scenario: Shortening removes the warning
- **WHEN** an editor shortens a 70-character SEO title to 58 characters
- **THEN** the length warning disappears

### Requirement: SEO validation problems are shown on the SEO controls
The editor SHALL validate SEO values locally before saving, with the same
rules as the API: SEO title at most 200 and SEO description at most 500 code
points after trimming, both single-line plain text, and a non-blank canonical
URL that is an absolute `http` or `https` URL without credentials or fragment
of at most 2,048 characters. A violation SHALL block the save and SHALL be
shown on its control as a sentence that does not repeat the value. Server
issues whose paths are `/seo/title`, `/seo/description`, `/seo/image`,
`/seo/canonical` or `/seo/noindex` SHALL be shown on the matching control.
SEO problems SHALL appear in the validation summary after the model fields,
in card order, and activating one SHALL move focus to its control. A server
issue at `/seo` itself SHALL be listed in the summary as text.

#### Scenario: Relative canonical URL
- **WHEN** an editor enters `/posts/hello` as the canonical URL and saves
- **THEN** no save request is sent, the canonical URL control says to enter an
  absolute URL starting with `https://` or `http://`, and the summary links
  "Canonical URL" to it

#### Scenario: Line break in the description
- **WHEN** an editor enters a description containing a line break and saves
- **THEN** no save request is sent and the description control says to use a
  single line

#### Scenario: Server rejects the SEO image
- **WHEN** a save is rejected with an issue at `/seo/image`
- **THEN** the SEO image control shows the problem and the summary links
  "SEO image" to it

#### Scenario: SEO no longer enabled on the server
- **WHEN** a save is rejected with `seo_not_allowed` at `/seo`
- **THEN** the summary lists the problem as text without a link

### Requirement: Inherited SEO values are shown as placeholders
While an SEO value is empty, its control SHALL show what the site will use
instead, following the fallback chain of ADR 0011, and SHALL expose the same
text as part of its accessible description:
- SEO title: "Uses entry title: " followed by the current entry title formatted
  with the site title template, or "Uses entry title" while the entry title is
  empty.
- SEO description: "Uses {field label}: " followed by the text of the model's
  mapped description field when it has text, otherwise "Uses site
  description: " followed by the site default description when it has text;
  otherwise no placeholder.
- SEO image: a line "Uses the image from {field label}" when the model's
  mapped image field holds media, otherwise "Uses the site image" when the
  site default image is set, otherwise "No image is shared".
- Canonical URL: "Uses this page's URL: " followed by the page's absolute URL
  when the build site URL is configured and the entry has a path, otherwise
  "Uses this page's URL".

Inherited values SHALL reflect unsaved form values of the entry, and SHALL
read site defaults from the published entry of the global that declares
`seoDefaults`. When no global declares `seoDefaults`, it is not published, or
it cannot be read, the editor SHALL behave as if there were no site defaults
and SHALL NOT block editing. A stored SEO value SHALL replace its placeholder.

#### Scenario: Title from the entry title and template
- **WHEN** the published defaults global has site name "Lace" and no title
  template, and an editor opens the post "Hello" with no SEO title
- **THEN** the SEO title placeholder reads "Uses entry title: Hello | Lace"

#### Scenario: Description from the mapped field
- **WHEN** the model maps its description to the field "Excerpt" holding
  "A short intro" and the SEO description is empty
- **THEN** the SEO description placeholder reads "Uses Excerpt: A short intro"

#### Scenario: Description from the site default
- **WHEN** the mapped description field is empty and the published site
  default description is "Notes on Lace"
- **THEN** the SEO description placeholder reads "Uses site description:
  Notes on Lace"

#### Scenario: Unsaved edits update the placeholder
- **WHEN** an editor types "New intro" into the mapped Excerpt field without
  saving
- **THEN** the SEO description placeholder reads "Uses Excerpt: New intro"

#### Scenario: Defaults global not published
- **WHEN** the global declaring `seoDefaults` has only a draft and the post
  "Hello" has no SEO title
- **THEN** the SEO title placeholder reads "Uses entry title: Hello"

### Requirement: The SEO card previews the search result
The SEO card SHALL show a search-result preview labelled as such, computed from
the current form values and the published site defaults with the same rules
as the site's SEO resolver: the title is the SEO title, otherwise the entry
title formatted with the title template (a template applies only when it
contains `%s`; otherwise `{title} | {site name}`, or the bare title without a
site name); the URL is the canonical URL, otherwise the build site URL plus
the entry's path, otherwise the path alone, and is omitted for a collection
entry without a slug; the description is the first text of the SEO
description, the mapped field and the site default, otherwise a note that
search engines choose their own snippet. When "Hide from search engines" is
checked, the preview SHALL say that the page is hidden from search results.
The preview SHALL NOT be a live region.

#### Scenario: Preview with a custom template
- **WHEN** the site title template is "%s — Lace Notes", the site URL is
  `https://example.com/` and the post "Hello" at `/posts/hello` has no SEO
  title or canonical URL
- **THEN** the preview shows the title "Hello — Lace Notes" and the URL
  `https://example.com/posts/hello`

#### Scenario: Preview follows typing
- **WHEN** an editor types "Custom title" into the SEO title
- **THEN** the preview title reads "Custom title"

#### Scenario: Hidden entry
- **WHEN** an editor checks "Hide from search engines"
- **THEN** the preview says the page is hidden from search results

### Requirement: Composite fields support recursive generic authoring
The editor SHALL render groups as labelled fieldsets with descriptions and
nested controls and lists as labelled ordered repeatable items in every model
kind and block data. A group that is not a list item SHALL be a disclosure
whose toggle is a chevron icon button with an accessible name naming the
action and the group, consistent with block cards. A group used as a list
item SHALL render its fields directly inside the item's row, without its own
frame, legend or toggle. Every list and group label SHALL come from its
descriptor label or humanized key, never from per-block presentation code.
Scalar, media and rich-text leaves SHALL use the existing
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

#### Scenario: Group disclosure uses a chevron
- **WHEN** a writer views a standalone optional group named "Contact"
- **THEN** its toggle is an icon-only chevron button named "Collapse Contact" while open and "Expand Contact" while closed, with no visible "Collapse" text

#### Scenario: A list item group has no nested frame
- **WHEN** a writer opens a gallery item
- **THEN** the item's media, alt, caption and link controls appear directly in the opened row, with no inner group legend or second toggle

### Requirement: Composite editing explains normalized list budgets
Each list SHALL show a header with its label, its count and effective maximum
in the form "<count> / <maximum>", an Add action and a list actions menu
containing Clear when clearing is offered. The list SHALL have no frame or
toggle of its own. The publication minimum SHALL be part of the list's
accessible description and SHALL be visible while the list has fewer items
than the minimum or a problem, and always in view-only mode; otherwise it SHALL
be visually hidden. Its visibility SHALL NOT depend on focus. The editor SHALL show entry-wide usage against 500 elements, counting
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

#### Scenario: Header comes from the schema
- **WHEN** a gallery holds 3 of at most 50 images and a navigation submenu holds 1 of at most 20 links
- **THEN** the headers read "Images" with "3 / 50" and "Submenu links" with "1 / 20", each with its own Add and actions menu

#### Scenario: Minimum shown while unmet
- **WHEN** a gallery with a publication minimum of 1 is empty and later receives one item
- **THEN** the minimum guidance is visible while the list is empty and is visually hidden but still associated once the minimum is met

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

### Requirement: Selection formatting complements the fixed rich-text toolbar
An editable rich-text field SHALL offer a compact selection bubble menu for Bold, Italic, Strike, inline Code and Link when nonempty text is selected in the focused visible editor. Its toggles SHALL reflect the selection and operate on it without losing the selection when controls take focus. Code-block content SHALL NOT offer unsupported marks or links. Every action SHALL remain available through the fixed toolbar and keyboard; the bubble SHALL NOT steal focus on appearance. Its controls SHALL have accessible names, visible focus and keyboard operation, and Escape SHALL dismiss it and return focus to the text. It SHALL disappear for a collapsed selection, hidden editor, focus outside its editor/controls or read-only field. Opening Link SHALL preserve the selection until application or dismissal.

#### Scenario: Selected text can be formatted
- **WHEN** a writer selects ordinary text and activates Bold or Link in its bubble menu
- **THEN** the action applies to that selection, reports its active state where applicable, and the fixed toolbar remains available

#### Scenario: Bubble appearance does not interrupt typing
- **WHEN** a writer selects text using the keyboard and then collapses the selection or leaves the editor
- **THEN** the bubble appears without moving focus and disappears after selection collapse or focus departure

#### Scenario: Code blocks keep plain text
- **WHEN** a writer selects code-block text
- **THEN** controls cannot insert marks or links into that plain-text code block

### Requirement: Expanded rich text survives authoring and publication
Expanded rich-text content SHALL survive undo/redo, save/reload, list moves, group/list disclosures and block Content/Settings tabs while retaining existing editing identity and selection where applicable. Saving SHALL retain the complete document; a subsequent draft edit SHALL NOT change the published snapshot until publication. Published content SHALL render through the common Astro renderer with escaped code and exact whitespace, H4, horizontal rules and independent link options; new-tab links SHALL receive renderer-derived noopener noreferrer, merged with nofollow when requested. Existing H1–H3 and href-only documents SHALL remain editable without silent loss. Failed saves/publication or revision conflicts SHALL retain local expanded content under the existing recovery rules. Node and Cloudflare SHALL use the same document contract.

#### Scenario: Nested editor state survives movement
- **WHEN** a writer edits expanded rich text in a nested list item, moves it, closes and opens its disclosures and switches its block tabs
- **THEN** content, undo history and selection where applicable remain associated with that item and the saved/reloaded document preserves all features

#### Scenario: Published output matches the editor
- **WHEN** an admin publishes a document with H4, rules, code containing angle brackets and multiple lines and all four link option combinations, and Astro builds from the published export
- **THEN** output contains the matching safe elements, escaped code with exact whitespace and the corresponding target/rel attributes

#### Scenario: Draft changes remain isolated
- **WHEN** a writer changes expanded rich text after publication or receives a failed save or revision conflict
- **THEN** public content remains the last published snapshot and complete local edits remain available for recovery

### Requirement: Configured placeholders guide empty controls
Editable text, textarea, URL, number, select and rich-text controls SHALL show configured placeholders when empty at every supported model and block data/settings depth, including scalar list items. An explicit inherited SEO/media placeholder SHALL take precedence; inherited explanations and configured descriptions SHALL remain available. Omitted placeholders SHALL retain existing control fallback behavior; an empty configured string SHALL suppress a generic fallback. Rich-text placeholders SHALL be exposed through aria-placeholder and SHALL NOT appear for viewers. Placeholders SHALL NOT replace labels, become content, dirty the draft or change defaults. Metadata updates SHALL NOT reset rich-text history, selection or form values.

#### Scenario: Nested and scalar-item prompts
- **WHEN** a writer opens empty nested text, select and rich-text fields and scalar list items with configured placeholders
- **THEN** each appropriate control shows its configured prompt without creating values or unsaved changes

#### Scenario: Inherited guidance wins
- **WHEN** a field has a configured generic placeholder and an existing inherited media or SEO explanation
- **THEN** inherited guidance remains the effective prompt and its accessible explanation is preserved

#### Scenario: Rich-text metadata updates
- **WHEN** a configured rich-text placeholder changes while the draft has content and undo history
- **THEN** content, selection and undo history are retained without generating a content edit

### Requirement: Required and constraint guidance is consistent and accessible
Every applicable descriptor control SHALL show a visible required marker and explain required-for-publication semantics when required. Scalar labels and composite legends SHALL retain accessible names; controls SHALL expose required state through role-supported accessibility attributes or associated explanatory text without native required validation blocking draft saves. Guidance SHALL include configured descriptions and declared text length, numeric and list bounds with accurate draft/publication semantics. The required-for-publication explanation SHALL always be associated with its control and SHALL be available as the tooltip of the visible required marker; it SHALL be visible text only while the field has a problem and always in view-only mode, and otherwise SHALL be visually hidden. No guidance or counter SHALL appear, disappear or move on focus or blur, so focusing a control never shifts the layout under the pointer. List-maximum guidance SHALL always be associated and SHALL be visible as the list header's count and maximum. Configured descriptions, declared text-length and numeric guidance and errors SHALL remain visible. All associated description IDs SHALL resolve to existing elements, coexist with errors and inherited annotations, and remain readable in viewer mode. Guidance SHALL NOT materialize absent containers, change validation rules or introduce viewer mutation actions.

#### Scenario: Required nested group and leaves
- **WHEN** a model or block has a required group with required text, select, boolean, media and rich-text leaves
- **THEN** its legend and applicable control labels expose required guidance and associated descriptions while an otherwise valid incomplete draft remains savable

#### Scenario: List minima differ from hard maxima
- **WHEN** a list declares minItems 2 and maxItems 5
- **THEN** guidance explains the minimum applies to publication and the maximum to drafts as well, without changing existing list operations or budgets

#### Scenario: Read-only and errors coexist
- **WHEN** a viewer inspects nested fields with required state, constraints, configured descriptions and errors
- **THEN** guidance and errors remain associated with the controls, disclosures remain usable and mutation actions are absent

#### Scenario: Required explanation stays out of the layout
- **WHEN** a writer views and then focuses the empty required media field of an `image` block and activates Replace
- **THEN** "Required for publication only." is the required marker's tooltip and part of the field's accessible description but is not visible text, the layout does not change on focus, and the picker opens

#### Scenario: Required explanation is shown with a problem and to viewers
- **WHEN** publication validation reports the required media missing, or a viewer opens the block
- **THEN** "Required for publication only." is visible text with the field

### Requirement: Ordinary text counters distinguish declared hard limits from SEO advice
Text and textarea controls SHALL show a visible current count, including zero for an absent value, measured using raw UTF-16 length, associated with the control. The count SHALL be shown right-aligned in the field's label row rather than on a line of its own and SHALL be visible regardless of focus. When minLength or maxLength is declared, the counter and associated constraint guidance SHALL identify the declared bounds as validation limits. Unbounded fields SHALL show a count without inventing a limit. Counts SHALL be available in read-only inspection and absent from per-keystroke live announcements. Counter rendering SHALL NOT truncate input, block typing or replace existing save/publication validation. SEO counters SHALL explicitly identify 60/160 as recommendations, retain trimmed code-point counting, explain their separate existing hard limits and remain visible.

#### Scenario: Declared maximum and failed save
- **WHEN** a writer enters an ordinary text value longer than maxLength
- **THEN** the counter reflects its full raw length, guidance identifies the hard maximum and existing validation rejects saving without truncating the author's input

#### Scenario: Optional absent field with minimum
- **WHEN** an optional text field with minLength is absent
- **THEN** its count is zero and its minimum guidance does not claim that absence prevents saving or publication

#### Scenario: Counter after list moves and viewer inspection
- **WHEN** text items are moved or duplicated in a nested list and the saved entry is later viewed read-only
- **THEN** each visible count belongs to its current value and declared bounds and no counter announces every keystroke

#### Scenario: SEO advice remains advisory
- **WHEN** SEO title text exceeds 60 code points but remains within its hard limit
- **THEN** the counter labels 60 as recommended, shows the advisory warning and permits saving

#### Scenario: Counter sits in the label row
- **WHEN** a writer views an empty unbounded caption field, types "Hi" and moves focus away
- **THEN** "0 characters" and then "2 characters" are visible on the field's label row throughout, the field occupies no extra line for it, and the control's accessible description includes the count

### Requirement: Visual layouts preserve recursive form state and error access
The admin SHALL render declared sections with accessible headings and tabs with labelled tablists/panels in metadata order. The first tab SHALL initially be selected; Left/Right, Home and End SHALL select and focus tabs with the standard tabs keyboard behavior. Narrow viewports SHALL retain access to all tab controls and fields without page-level horizontal overflow. Unlisted fields SHALL follow the layout in declaration order. Each form owner and list item SHALL own independent navigation state. Model layouts SHALL affect only model fields, block data layouts only the Content panel, and settings layouts only declared settings inside the existing Settings panel; SEO and system/envelope controls SHALL retain their established behavior.

Hidden panels SHALL remain mounted, non-focusable and absent from the accessibility tree. Navigation SHALL preserve rich-text documents and editing identity, media selections, list item identity, local/transient values and validation errors. Navigating an absent group SHALL NOT create data or mark a draft dirty. Viewers SHALL be able to navigate layouts/disclosures but SHALL have no mutation affordances. Lifecycle requests SHALL retain existing editing locks.

Tabs and sections containing descendant problems SHALL display accessible problem indicators under the existing publication/hidden-block rules. Validation-summary activation SHALL select every containing tab, open ancestor block/group/list disclosures and focus the exact leaf/container in the rendered visual order. Save/discard/revert, conflict retention and list/block moves SHALL preserve values and map errors to the current correct item; presentation state SHALL never be submitted or included in dirty comparison/conflict JSON.

#### Scenario: Navigate and save a nested rich-text form
- **WHEN** a writer edits rich text and media in a list-item tab, switches tabs, moves the item and saves
- **THEN** current values and editing identity remain intact and the saved JSON uses the original paths

#### Scenario: Reveal a nested hidden error
- **WHEN** a summary entry targets a field inside an inactive tab of a collapsed item in an inactive block panel
- **THEN** all containing panels/disclosures open and the exact control receives focus with its error visible

#### Scenario: Navigate an unset group as a viewer
- **WHEN** a viewer navigates configured layouts around an absent group using keyboard controls
- **THEN** navigation works, values remain absent, no dirty change occurs and no mutation affordance appears

#### Scenario: Recover after save failure or revision conflict
- **WHEN** a layout-organized draft save fails or conflicts after editing nested fields
- **THEN** local values remain available in every panel and existing discard/reload/conflict recovery works without serializing navigation state

#### Scenario: Narrow-screen keyboard navigation
- **WHEN** an author visits every tab using arrows, Home and End at a narrow viewport
- **THEN** each selected tab is visible, its panel is keyboard accessible and no control is unreachable through overflow

### Requirement: Collection creation starts with an automatic editable slug
The collection Create entry dialog SHALL expose Slug and an initially enabled Suggest from title control. While enabled, title changes SHALL update the slug. Any manual slug change, including clearing it, SHALL disable automatic updates until explicitly re-enabled. Closing/cancelling or successfully completing creation SHALL reset dialog values and suggestion mode. Creation SHALL submit the displayed nonempty slug in the existing create request and omit an empty slug. The suggestion SHALL apply NFKD normalization, remove characters other than ASCII letters/digits, whitespace, underscore and hyphen, lowercase, trim, collapse whitespace/underscore/hyphen runs to one hyphen, trim boundary hyphens, truncate to the existing maximum slug length, and remove a resulting trailing hyphen. It SHALL NOT transliterate scripts, fabricate a fallback slug or promise uniqueness. Empty or wholly non-Latin titles SHALL yield an empty suggestion with guidance to enter a slug manually; an empty slug SHALL NOT prevent a valid draft creation.

On success the created entry SHALL open with its persisted slug and no unsaved changes. Subsequent title edits SHALL NOT change that persisted slug automatically. Ordinary loads, refreshes, duplicated entries and entries without slugs SHALL NOT imply new-creation suggestion mode. The existing entry-editor opt-in suggestion behavior SHALL remain available and use the same normalizer. Creation errors SHALL retain title/slug and manual/automatic mode. Route validation and conflicts SHALL remain server-authoritative and use normal accessible error feedback without auto-appending suffixes. Pages/globals and viewers SHALL acquire no creation/slug affordances.

#### Scenario: Follow a new title then stop on manual input
- **WHEN** a writer enters `Café & News` in the creation dialog then manually changes `cafe-news` to `updates` and edits the title again
- **THEN** `updates` stays unchanged until suggestions are explicitly re-enabled

#### Scenario: Non-Latin or empty title
- **WHEN** the title is empty or `Новости`
- **THEN** the suggested slug is empty, manual-entry guidance is visible, and the existing nonempty-title requirement alone determines whether draft creation can proceed

#### Scenario: Truncation leaves a valid boundary
- **WHEN** a long normalized suggestion has a hyphen at the truncation boundary
- **THEN** its trailing hyphen is removed and its nonempty result obeys the existing slug grammar and length limit

#### Scenario: Preserve the created and existing slug
- **WHEN** creation succeeds with `cafe-news` and the author edits the title in the editor or reloads the entry
- **THEN** the slug stays `cafe-news` and no automatic update runs unless the author explicitly opts in

#### Scenario: Preserve a slugless duplicate
- **WHEN** an author opens a duplicated collection entry with no slug and edits its title
- **THEN** its slug stays absent unless suggestions are explicitly enabled

#### Scenario: Creation failure retains author input
- **WHEN** the server rejects creation or a route conflict is reported by the existing lifecycle boundary
- **THEN** normal error feedback is accessible, local values and suggestion mode remain intact, and no alternate slug is generated

### Requirement: Generic select cards show static composition diagrams
The admin SHALL render a select with card presentation as one labelled,
single-selection radio group through the existing generic field controls. Each
card SHALL show its plain-text label, optional description and optional diagram
as neutral rectangles. Diagram rendering SHALL use metadata only: no media
reads, uploaded-image previews, site components, block-type branching or layout
setting-name branching. Mode and preset fields SHALL each own an independent
group. Missing diagrams SHALL leave a usable text card.

The selected card SHALL be identifiable beyond color. Keyboard users SHALL
enter/leave the group through ordinary Tab navigation, move and select with
arrow keys (wrapping at the ends), use Home/End for first/last choices and select
the focused choice with Space. An optional absent select SHALL offer a labelled
"No selection" choice. Disabled/busy and read-only states SHALL respect the
existing editing locks and authorization; viewers SHALL read the chosen label
and description without mutation controls. Diagrams SHALL be decorative, with
labels/descriptions providing accessible meaning. Group errors and field guidance
SHALL remain associated and validation-summary links SHALL focus the selected
radio or the first available radio when no value is selected.

Cards SHALL reflow without clipping or page-level overflow at 320px and larger,
support both admin themes, and keep every action usable without hover. Selection
SHALL update one ordinary string field and follow existing dirty comparison,
save/discard/revert, duplicate, block-move and conflict retention behavior.
Block settings SHALL use validated generic visibility metadata to hide controls
that do not apply to their selected mode, retaining their values and ordinary
validation. Relevant errors SHALL reveal the affected setting for correction and
summary focus, with text explaining why it is temporarily visible. Neither the
field renderer nor the settings panel SHALL branch on Gallery or layout-setting
names. Conditional requiredness/validation SHALL NOT be introduced.

#### Scenario: Generic custom block and nested field
- **WHEN** a custom block setting and a select inside a list item use card metadata
- **THEN** both use the same control and retain independent values and focus
  without any custom block editor

#### Scenario: Thumbnails without content
- **WHEN** Gallery is empty and its settings are opened
- **THEN** all three modes and all seven presets have schematic thumbnails and
  labels without loading any media or previewing the public site

#### Scenario: Keyboard selection and ordinary saving
- **WHEN** a writer focuses the mode group, uses arrows to choose horizontal,
  disables wrap and saves
- **THEN** the save includes the selected scalar values, normal dirty state
  clears on success, and thumbnails are absent from the content payload

#### Scenario: Server problem links to a choice
- **WHEN** the server reports an issue at a layout setting and the writer
  activates it in the summary
- **THEN** Settings opens, containing form tabs/disclosures open and the correct
  radio control receives focus with its error description

#### Scenario: Read-only and lifecycle locking
- **WHEN** a viewer reads layout settings or a writer is saving/publishing
- **THEN** the viewer has readable labels without mutation affordances and the
  writer cannot change cards during the lifecycle request

#### Scenario: Conflict retains layout edits
- **WHEN** two writers save from the same draft revision and one save conflicts
- **THEN** the losing writer keeps the chosen mode, wrap and preset locally and
  receives the existing conflict recovery UI without overwriting the winner

#### Scenario: Mode switch shows applicable controls and retains values
- **WHEN** a writer switches from grid to flex at a narrow viewport
- **THEN** preset cards are hidden, Wrap items is visible, previous values remain intact
  and the page has no horizontal overflow

#### Scenario: Hidden setting error is reachable
- **WHEN** Grid is selected and a validation issue identifies Wrap items
- **THEN** Wrap items appears with its error and the reason for its temporary visibility; activating the summary focuses it without changing mode, and resolving the error restores mode-based visibility

#### Scenario: Block scopes remain independent
- **WHEN** two list blocks select different modes and one is duplicated or moved
- **THEN** each block retains its own values and mode-specific controls with no cross-block visibility changes

### Requirement: Ordinary URL controls offer manual and CMS destinations
Every ordinary URL control SHALL offer Manual URL and CMS entry modes, a
paginated searchable page/collection picker, and selected-target title, model,
published path and availability. Selection SHALL store only the canonical token;
manual values SHALL remain unchanged. Switching modes SHALL not silently
convert a path to a reference or discard a value before an explicit edit/clear.
Missing/unpublished targets SHALL retain their IDs and show warnings, with
replace/clear actions. The editor SHALL resolve selected targets through one
deduplicated batch per current value set (bounded chunks), not one request per
control/render/keystroke. Search SHALL debounce and cancel obsolete requests.
Controls SHALL preserve existing nested form identity, error reveal, defaults,
viewer restrictions and keyboard/screen-reader operation. Provider-restricted
URL controls and rich-text link controls SHALL retain their current UI/grammar.
The picker SHALL apply to ordinary URL fields in model/global fields and block
data, including nested groups/lists. Block settings SHALL retain their existing
allowlist and controls; token-like text settings SHALL NOT acquire a URL picker.

#### Scenario: Image link and nested content fields
- **WHEN** an editor selects a CMS page in an image's Link field or a nested model/global/block URL field
- **THEN** both use the same picker/token/status behavior at their existing field paths

#### Scenario: Missing selected target
- **WHEN** a previously selected ID is no longer found
- **THEN** the control says the destination is missing, retains its ID for repair, and permits draft save

### Requirement: Conditional fields are shown and hidden reactively
The editor SHALL apply the `visibility` rules of validated metadata to model
fields, every present group value, every list item and each block's data.
Each occurrence SHALL evaluate only its own controller value: the controller's
current form value when it holds one, otherwise the controller's declared
default; a cleared or absent controller without a default SHALL hide its
targets. A target SHALL be shown exactly when its rule matches; a field without
a rule SHALL always be shown. A hidden group or list target SHALL hide its
whole subtree. Visibility SHALL update as soon as the controller value changes,
without saving.

Hidden targets SHALL stay mounted but SHALL be absent from the accessibility
tree and the tab order, and SHALL keep their values, local and transient
state, rich-text editing identity, media selection, list item identities and
open or collapsed state. Changing a controller SHALL NOT clear, reset, reorder
or normalize a target's value, and SHALL change the draft's dirty state only
through the controller's own value; switching it back SHALL show the earlier
target values again. The next save SHALL submit hidden values unchanged.
Layout sections and tabs whose fields are all hidden SHALL be hidden; when the
selected tab becomes hidden, the first tab with a shown field SHALL be
selected. Viewers SHALL see the same fields a writer would see for the same
values, without mutation affordances. Required markers, "Not set · Required
for publication" notes and other publication guidance SHALL appear only on
shown fields. Block settings SHALL keep their existing `settingsVisibility`
behavior.

#### Scenario: Switch a list item between kinds
- **WHEN** a list item group declares select `kind` (`image`, `video`, default `image`) with `media` and `alt` visible for `image` and `videoUrl` visible for `video`, and a writer opens a new item and selects `video`
- **THEN** `media` and `alt` disappear, `videoUrl` appears directly, and no save request is sent

#### Scenario: Toggle back restores the hidden value
- **WHEN** a writer chooses media `a.jpg` for an image item, switches `kind` to `video`, types a video URL, then switches back to `image`
- **THEN** the item shows `a.jpg` again, the draft is dirty only because of the changed values, and saving submits `kind`, `media` and the typed `videoUrl`

#### Scenario: Items evaluate independently
- **WHEN** a list holds an `image` item followed by a `video` item
- **THEN** the first item shows only its image fields and the second only its video fields, and changing one item's `kind` does not change the other's fields

#### Scenario: Absent controller without a default
- **WHEN** block data declares optional select `layout` without a default and `columns` visible for `grid`, and the block has no `layout`
- **THEN** `columns` is hidden until the writer selects `grid`, and clearing `layout` again hides it

#### Scenario: Boolean controller in model fields
- **WHEN** a model declares boolean `hasCta` and `ctaUrl` visible for `true`, and a writer turns `hasCta` on and then off
- **THEN** `ctaUrl` appears and disappears, keeps its typed value, and is not reachable by Tab while hidden

#### Scenario: A tab with only hidden fields
- **WHEN** a model layout puts `videoUrl` and `poster` alone in a *Video* tab and both are hidden
- **THEN** the *Video* tab is not shown, and it reappears with its earlier values when the controller makes them visible

#### Scenario: A viewer sees applicable fields
- **WHEN** a viewer opens an entry whose list holds an `image` item and a `video` item
- **THEN** each item shows only its applicable fields as read-only controls

### Requirement: Problems on conditional fields stay reachable
Validation problems SHALL remain reachable under visibility rules. A hidden
target holding a value with a draft validation problem, whether found locally
or reported by the server, SHALL be shown with its error and an accessible
note that names the controller and the values under which the field applies,
so the writer can correct or clear the value without changing the controller;
when the problem is resolved and the rule still does not match, the field
SHALL be hidden again. A publication-only problem reported for a target that
is now hidden SHALL NOT be shown on that field, SHALL NOT appear in the
validation summary, SHALL NOT mark its tab, section or list item as having
problems, and SHALL NOT keep its block card open; it SHALL reappear if the
controller makes the target visible again before the next validation replaces
it. Summary entries SHALL keep the existing reading order, labels and one-based
positions and SHALL list only problems on shown fields, on fields shown to
resolve a problem, and on containers or unknown paths as today. Activating an
entry SHALL reveal the containing block, tab, section and list item and focus
the exact control. Hidden-block rules SHALL be unchanged.

#### Scenario: A stale publication error disappears with its field
- **WHEN** publishing a `video` item without `videoUrl` reports `missing_required_field` at its `videoUrl`, and the writer switches the item's `kind` to `image`
- **THEN** the summary no longer lists the `videoUrl` problem, the item's row and the block card show no problem for it, and switching back to `video` shows the problem again until the next validation

#### Scenario: A hidden invalid value stays fixable
- **WHEN** a writer types `not a url` into `videoUrl`, switches `kind` to `image` and saves
- **THEN** the save is refused, `videoUrl` stays shown under the image fields with its error and a note that it applies when Kind is Video, and clearing the value lets the save succeed and hides the field

#### Scenario: Summary reveals a nested conditional field
- **WHEN** the server reports a draft problem at `/blocks/0/data/images/2/videoUrl` while block 1 is collapsed, item 3 is collapsed and item 3's `kind` is `video`
- **THEN** activating the summary entry opens the block's Content tab and item 3 and focuses its `videoUrl` control with the error

### Requirement: Summaries and previews use applicable values only
Collapsed list rows, block card summaries, leaf previews, the media-selected
fallback and the "No alt" indicator SHALL be derived only from fields shown
under the occurrence's current visibility. A hidden target's value SHALL NOT
supply a primary or secondary line, a thumbnail or an indicator. When the
list's `itemLabel` names a hidden target, the row SHALL fall back to the
existing summary order over shown fields. Summaries SHALL update when a
controller changes and SHALL NOT dirty the draft.

#### Scenario: A video item is not labelled by its stale image
- **WHEN** a list item holds `kind: "video"`, a hidden media `a.jpg` without alt text, a hidden blank `alt` and the caption "Studio walk-through"
- **THEN** the collapsed row shows "Studio walk-through" and no thumbnail and no "No alt" indicator

#### Scenario: Switching kind updates the row
- **WHEN** a writer switches that item's `kind` back to `image` and collapses it
- **THEN** the row shows the `a.jpg` thumbnail, the caption and the "No alt" indicator
