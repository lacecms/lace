## MODIFIED Requirements

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

## ADDED Requirements

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
