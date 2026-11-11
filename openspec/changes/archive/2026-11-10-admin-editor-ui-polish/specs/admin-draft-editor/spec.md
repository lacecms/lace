## MODIFIED Requirements

### Requirement: The editor layout keeps actions and entry details at hand
The entry editor SHALL place its save-state indicator, its single Save action, for administrators its Publish (or Save and publish) action, and its entry actions menu when one is offered in the shell header beside the breadcrumbs, so they stay visible while the editor scrolls. The save-state indicator SHALL distinguish unsaved changes, saving, a failed save with local changes kept, the saved revision, and view-only access in text. Save SHALL be available through the platform save shortcut (`⌘S` on Apple platforms, `Ctrl+S` elsewhere), which the Save control SHALL advertise visibly and programmatically. While the editor is mounted, the shortcut SHALL NOT open the browser's page-save behavior. The shortcut SHALL submit exactly like the Save control and SHALL do nothing when the draft is clean, a save is in progress, or the user cannot save. The title SHALL be presented as a prominent input with an accessible "Title" label. At wide viewports the editor SHALL show the title and blocks in a main column and the publication details and entry fields (collection slug and model fields) in a right-hand column, and SHALL be horizontally centered in content areas wider than its maximum width. When the model allows no block types and the entry holds no blocks, the editor SHALL show no Blocks section and SHALL show the entry fields in the main column after the title, leaving the publication details (and the SEO card, when enabled) in the right-hand column. At narrow viewports the right-hand column SHALL follow the main column in reading and keyboard order. The editor SHALL show the entry-wide list budget ("List items: n / 500") only while the entry uses at least 400 list elements, and SHALL always show the budget problem when the entry exceeds the budget. The editor SHALL keep one page-level heading for assistive technology that names the entry being edited without repeating the breadcrumbs visibly.

#### Scenario: A writer saves with the keyboard
- **WHEN** a writer changes the title and presses `Ctrl+S` (or `⌘S` on an Apple platform)
- **THEN** exactly one complete-draft request is sent, the browser does not open its save-page dialog, and the indicator changes from unsaved changes to saving to the saved revision

#### Scenario: The shortcut is pressed on a clean draft
- **WHEN** a writer presses the save shortcut without having changed the loaded draft
- **THEN** no draft-save request is sent and the browser's page-save behavior is still suppressed

#### Scenario: Header actions stay visible
- **WHEN** a writer scrolls a long entry
- **THEN** the breadcrumbs, the save-state indicator, Save, (for admins) Publish, and the entry actions menu remain visible in the header

#### Scenario: Entry fields sit in the right-hand column
- **WHEN** a collection entry with model fields is opened at a wide viewport
- **THEN** the title and blocks appear in the main column and the publication details, slug, and model fields appear in the right-hand column

#### Scenario: The entry column stacks on a narrow screen
- **WHEN** a collection entry with model fields is opened at a 375px-wide viewport
- **THEN** the publication details and entry fields appear below the last block, keyboard focus reaches them after the block controls, and the page does not scroll horizontally

#### Scenario: A global without blocks uses the main column
- **WHEN** an admin opens the `settings` global, whose model allows no blocks, at a wide viewport
- **THEN** no Blocks section or "does not allow blocks" text is shown, the global's fields appear in the main column below its label, and the publication details appear in the right-hand column

#### Scenario: A model without block types keeps orphaned blocks visible
- **WHEN** an entry holds a block although its model now allows no block types
- **THEN** the Blocks section is shown with the block and its problem, and the entry fields stay in the right-hand column

#### Scenario: The list budget appears near the limit
- **WHEN** a writer edits an entry using 12 list elements and then adds items until it uses 400
- **THEN** no list budget line is shown at 12 elements and "List items: 400 / 500" is shown at 400

#### Scenario: The editor is centered on a wide screen
- **WHEN** an entry is opened in a content area wider than the editor's maximum width
- **THEN** the empty space is divided equally on both sides of the editor
