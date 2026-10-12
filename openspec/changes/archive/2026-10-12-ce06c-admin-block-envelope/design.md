## Context

Observed state after CE6B (`4ca805e`):

- `ContentBlockDto` (contracts) already carries `anchor?`, `className?`,
  `hidden` and `settings`; `ContentModelDto.blockDefinitions[].settings`
  carries the declared setting descriptors. Save requests accept the envelope
  with every value optional.
- `@lacecms/content` exports `isBlockAnchor`, `normalizeBlockClassName`,
  `MAX_BLOCK_ANCHOR_LENGTH`, `MAX_BLOCK_CLASS_NAME_LENGTH` and
  `MAX_BLOCK_CLASS_TOKENS`; server codes are `invalid_block_anchor`,
  `duplicate_block_anchor`, `invalid_block_class_name`, `invalid_block_hidden`,
  `invalid_block_settings` and `unknown_field` under `/blocks/<i>/settings`.
  Publication validates hidden blocks in draft mode, so a hidden block can only
  produce draft-mode issues (which also block Save) — never
  `missing_required_field`.
- Admin (`apps/admin/src`):
  - `widgets/block-editor/BlockCard` renders header (grip, icon, label,
    summary, collapse, actions menu), block-level problems and the fields in a
    `hidden` div that stays mounted.
  - `widgets/block-editor/BlockEditor` owns the field array, collapse state,
    insert/duplicate (drops `anchor`)/move/remove/undo, and `defaultSettings`.
  - `entities/content/editor-form.ts` holds `DraftEditorValues`, the local
    resolver (`fieldErrors`), `serverIssueMessage`, `issueLocation` (envelope
    paths currently map to `blocks.<i>.block`) and `withoutClearedValues`.
  - `entities/content/validation-problems.ts` builds the reading-order list;
    `pages/entry/EntryValidationSummary` renders it and focuses targets by DOM
    id.
  - `pages/entry/EntryPage` wraps the editor in
    `<fieldset disabled={readOnly}>` and `FieldRendererProvider readOnly`, and
    sets server errors with `type: "server"`.
  - `shared/ui/Tabs` (Radix tabs), `Switch`, `Badge`, `Input` exist.
- The build site URL is read with `client.loadBuildSite` (CE2B) and
  `siteUrlFor` + `resolvedPublicPath` build the "Open on site" link.

## Goals / Non-Goals

**Goals:**

- Edit anchor, hidden flag, declared settings and class name per block, with
  local validation equal to the server rules.
- Make hidden blocks and anchors recognizable in the block list.
- Route every envelope issue to a control or the block, in summary reading
  order, including into a non-selected tab.
- Keep the WCAG A/AA audit and keyboard-only flows green.

**Non-Goals:**

- Any API, contract, storage, SDK or template change.
- Settings on built-in blocks, previewing hidden blocks, bulk hide/show.
- Checking anchor uniqueness across entries or pages (the rule is per entry).

## Decisions

### 1. Form values hold anchor and class name as strings

`draftValues` sets `anchor: block.anchor ?? ""` and
`className: block.className ?? ""` on every loaded block, and new blocks and
duplicates start with `""`. RHF compares inputs against defaults, so an
`undefined` default under a text input would read as dirty after any
focus/blur round trip; the slug input uses the same convention.
`withoutClearedValues` (used by save and "Copy my JSON") removes blank anchors
and class names (after trimming) and drops `null`/`undefined` setting values,
so the server fills the setting default. The class name is sent trimmed; the
server normalizes spacing and repeats, and the saved response replaces the
form values, so the input shows the canonical form after save.

*Alternative rejected:* keeping `undefined` and registering inputs with
`setValueAs` — it hides the empty-string case inside every control and still
breaks `isDirty` for loaded blocks without an anchor.

### 2. Local envelope validation lives with the draft resolver

`fieldErrors` gains, per block: `anchor` (format via `isBlockAnchor`, duplicate
via a set over all non-blank anchors of the draft, hidden blocks included),
`className` (`normalizeBlockClassName` returns `undefined`), `settings.<key>`
(`fieldProblem` for each declared setting with a value) and a block-level
`settings` problem naming an undeclared setting key (as for undefined data).
Messages are new `BLOCK_MESSAGES` entries reused by `serverIssueMessage` for
the server codes, so local and server wording match:

- anchor format: "Start with a lowercase letter and use only lowercase
  letters, digits and hyphens, up to 64 characters."
- duplicate: "Another block in this entry already uses this anchor."
- class name: "Enter 1 to 16 class names separated by spaces, up to 256
  characters. Class names start with a letter, _ or - and use letters, digits
  and _ - : / . % # [ ]."
- undeclared setting: "This block has a value for the undeclared setting “x”."
- `invalid_block_hidden` / `invalid_block_settings`: "This block's settings
  could not be read." (block level).

Live validation: the Anchor and CSS classes controls compute their message
from the current values on every change (`useWatch` of all block anchors for
uniqueness) and show it immediately, independent of RHF's submit-first
validation mode; the resolver repeats the same functions so Save is blocked.
A shown live message and a resolver error for the same control are the same
string, so the control renders one message.

### 3. Tabs inside the card, state per block in `BlockEditor`

The card body becomes `Tabs` with `TabsContent forceMount` panels, the
inactive one carrying `hidden`. Tab selection is controlled: `BlockEditor`
keeps `Map<blockKey, "content" | "settings">` beside the collapse set, so it
survives reorders (field-array remounts by `formId` would reset local state)
and saves. Radix tabs supply the tabs keyboard pattern (automatic
activation). Tab triggers get an alert icon and visually hidden " (has
problems)" text when their panel has an error, computed from the block's
error object: Content ⇐ `data.<field>` errors; Settings ⇐ `anchor`,
`className`, `settings.<declared key>`.

A block with problems still forces the card open (existing rule); it does not
switch tabs, because both tabs may hold problems.

### 4. Summary reveal through a DOM event

`focusProblemTarget` checks whether the target element is inside a hidden tab
panel (`closest('[role="tabpanel"][hidden]')`). If so, it dispatches a
bubbling `lace:reveal-control` event from the element, the card's article
handles it by asking `BlockEditor` to select that panel's tab (flushed
synchronously with `flushSync`), and focus then moves to the now-visible
control. This keeps the summary unaware of block internals and works the same
for any future tabbed region.

*Alternative rejected:* lifting tab state into `EntryPage` and passing a
reveal callback into the summary — it couples the page to the widget's
internals for one case.

### 5. Settings panel layout and controls

Order: Anchor, Hide on site, declared settings, CSS classes (decided:
navigation-related first, the styling escape hatch last).

- Anchor: `Input` with a non-editable `#` adornment (`aria-hidden`), label
  "Anchor", description "Links to this block use #anchor. Unique within this
  entry." Copy link is a ghost button beside it, disabled (not removed) while
  the anchor is blank, invalid or repeated, so its position is stable; it
  writes with `navigator.clipboard.writeText` and confirms with
  `toast.success("Link copied.")`/`toast.error(...)` (the toaster is a polite
  live region, as for media URLs).
- Link base: `EntryPage` computes `linkBase = siteUrlFor(siteUrl, publicPath)`
  when the build site URL (`loadBuildSite`, already queried for SEO models,
  now enabled for every model with blocks) and `resolvedPublicPath` are
  known; globals have no path. The link is `${linkBase}#${anchor}` or
  `#${anchor}`; it is copied even before publication, matching "Open on
  site" not being conditional on the anchor being published.
- Hide on site: `Switch` with description "Hidden blocks stay in the draft and
  the publication but are not shown on the site."
- Declared settings: `FieldRenderer` with name
  `blocks.<i>.settings.<key>`; control ids follow `fieldControlId(name)` so
  summary targets resolve like data fields. Heading "Block settings" only
  when at least one setting is declared.
- CSS classes: `Input` labelled "CSS classes", description "Added to the
  block's root element on the site, separated by spaces."

### 6. Hidden presentation and menu action

Hidden cards use `bg-muted/40` and `border-dashed` (tokens only); text keeps
foreground colors so axe contrast holds. A `Badge variant="outline"` with
`EyeOffIcon` and "Hidden" sits after the label, and the article's
`aria-labelledby` lists title and badge. The menu gets *Hide block* /
*Show block* (Eye/EyeOff icons) before the separator; the action sets
`blocks.<i>.hidden` with `shouldDirty`. Announcement: a visually hidden
`role="status"` region in `BlockEditor` receives "Hero block 2 hidden from the
site." / "… shown on the site." (block label and position, never key, as for
reorder announcements). The header shows `#anchor` in monospace muted text
after the summary when the anchor is non-blank and valid.

### 7. Hidden blocks in the validation summary

Problems gain `blocking: boolean` and labels gain " (hidden)" for hidden
blocks: e.g. "Heading in Hero block 2 (hidden)". In `applyServerIssues`,
issues with code `missing_required_field` are set with
`type: "publication"` instead of `"server"`. `validationProblems` marks a
problem non-blocking when its block is hidden and its error type is
`"publication"`; non-blocking problems are listed after the rest under the
note "In hidden blocks, does not block publishing". The heading counts
blocking problems ("There are 2 problems to fix"); with none, it reads "The
remaining problems are in hidden blocks and do not block publishing" and the
summary uses the neutral (non-destructive) border. The field itself shows the
message followed by "This block is hidden, so this does not block
publishing." Showing the block again restores normal counting. The resolver
clears these server errors on the next submit, so a later Save and publish
starts clean; the server, not the admin, decides publishability.

Draft problems in hidden blocks stay blocking: the server validates hidden
blocks in draft mode on save and publish, so they would be rejected anyway.
This corrects the roadmap's broader wording ("errors in hidden blocks" do not
block publication), which only holds for publication-only problems.

### 8. Viewers

The `fieldset disabled` around the editor would disable tab triggers, so for
read-only sessions the card renders no tabs: content fields, then a
`<section aria-label="Settings">` with a description list (Anchor `#pricing`
or "None", Visibility "Hidden on site"/"Shown on site", each declared setting
through the read-only `FieldRenderer`, CSS classes or "None"). No Copy link,
no hide/show menu item. `BlockCard` receives `readOnly` from `BlockEditor`
(from `EntryPage`).

### 9. Issue mapping

`IssueLocation` adds `blocks.<i>.anchor`, `blocks.<i>.className` and
`blocks.<i>.settings.<key>`. `issueLocation` maps `/anchor` and `/className`
(exact length) to them, `/settings/<declared key>[/…]` to the setting,
`/settings` and `/settings/<undeclared>` and `/hidden` to the block.
`locationField` returns the setting descriptor for settings locations so
`serverIssueMessage` prefers the local field sentence.
`blockLevelProblems` adds `hidden` and `settings` (root message) keys and
undeclared setting keys.

## Risks / Trade-offs

- **Two validation paths for anchors (live and resolver).** → Both call the
  same pure function in `entities/content`; unit tests assert equal messages.
- **`flushSync` inside an event handler for reveal.** → Limited to the reveal
  event; covered by a BlockEditor unit test and the e2e summary scenario.
- **Copying a link before the anchor is published.** → The link is correct
  once published and built; the description says links use `#anchor`, and the
  roadmap asks for a copy action, not publication gating.
- **The build-site query now runs for block models.** → One cached GET, already
  issued by the publication details card for "Open on site".
- **`type: "publication"` relies on the code being publication-only.** →
  `missing_required_field` is only emitted in publish mode
  (`validateModelFields`); a unit test pins the mapping.

## Migration Plan

Admin-only release with the API from CE6A/CE6B; no data migration. Rollback
is reverting the admin bundle; envelopes saved by this admin remain valid for
the API.

## Open Questions

None.
