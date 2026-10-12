## Why

CE6A stores a block envelope (`anchor`, `className`, `hidden`, declared
`settings`) and CE6B renders it on the site, but editors still cannot see or
change it: the admin only keeps loaded envelopes, starts new blocks with
setting defaults and drops the anchor from duplicates. An anchor, a hidden
flag or a declared setting can only be set through the API. This change
implements session **CE6C — Admin block envelope** of step CE6 in
[`docs/content-editor-roadmap.md`](../../../docs/content-editor-roadmap.md),
which completes CE6 and wave 2.

Governing architecture: section 9.4 (envelope columns and per-entry anchor
uniqueness), section 10 (hidden blocks at publication), section 12 (admin block
DTO) and section 17 (admin editor, validation summary and accessibility
acceptance); [ADR 0012](../../../docs/adr/0012-block-envelope.md).

## What Changes

- **Content and Settings tabs.** An expanded block card gets a *Content* tab
  with the block's fields (unchanged) and a *Settings* tab. Both panels stay
  mounted, so rich-text and media controls keep their state. The tabs follow
  the tabs keyboard pattern (arrow keys, Home/End, one tab stop). A tab whose
  controls have problems shows a problem marker in its name.
- **Settings tab controls**, in this order:
  - *Anchor*: a text input shown with a `#` prefix, validated live as the
    writer types for format (lowercase letter first, then lowercase letters,
    digits and hyphens, at most 64 characters) and uniqueness within the entry
    (hidden blocks included), with a *Copy link* action. The link is the
    entry's absolute site URL plus `#anchor` when the build site URL and the
    entry's public path are known, otherwise `#anchor`.
  - *Hide on site*: a switch for the hidden flag, described as keeping the
    block in the draft and publication without delivering it to the site.
  - The settings the block definition declares, through the existing field
    controls (`select`, `boolean`, `number`, `text`).
  - *CSS classes*: a text input for the class name, validated with the shared
    class-name rule (1–16 tokens, at most 256 characters).
- **Hidden blocks in the list.** A hidden block's card is visibly muted (muted
  background and dashed border, text contrast unchanged) and shows a *Hidden*
  badge that is part of its accessible name. The card menu offers *Hide
  block* or *Show block*, and the change is announced. The card header shows
  the block's `#anchor` beside the summary, so a collapsed card still shows
  it.
- **Validation.** Local draft validation checks anchor format and uniqueness,
  the class name and declared setting values, and reports undeclared setting
  keys as a block problem; these block Save. Server issues at
  `/blocks/<i>/anchor`, `/className` and `/settings/<key>` map to their
  controls; `/hidden` and `/settings` map to the block. The validation summary
  lists Settings problems after the block's content problems, and activating
  one opens the Settings tab before focusing the control.
- **Hidden blocks in the summary.** Summary entries for a hidden block name it
  as hidden. A publication-only problem (a required field reported by a
  rejected publish) in a block that is now hidden is listed as not blocking
  publication, because publication validates hidden blocks in draft mode, and
  is left out of the count of problems to fix. Draft problems in a hidden
  block still block Save and are counted.
- **Form state.** Anchor and class name are held as strings (empty when
  absent) so the dirty baseline matches the inputs; blank values are left out
  of save requests and the "Copy my JSON" draft. A cleared declared setting is
  left out, so the server applies its default. Duplicates still start without
  an anchor; Undo after removal restores the anchor.
- **Viewers.** Viewers see the card without tabs: the content fields, then a
  read-only *Settings* section with the anchor, hidden state, declared
  settings and classes; no hide/show menu action and no Copy link.
- **Browser tests.** A mocked keyboard-only Playwright spec edits an anchor
  (format and duplicate errors, copy link), hides and shows a block from the
  card menu and the switch, edits a declared setting and the classes, checks
  the exact save request and the tabs' keyboard behavior; the accessibility
  spec audits an editor with the Settings tab open, a hidden block and an
  anchor problem in both themes.
- **Documentation.** Architecture section 17 (block card tabs, hidden blocks,
  envelope validation mapping), ADR 0012 consequences (the editor now edits
  envelopes), the roadmap (CE6 done).

Not in this change: API, contracts, template or SDK changes (the envelope
contract is complete since CE6A/CE6B); settings on built-in blocks; a site
preview of hidden blocks; real-stack admin acceptance for envelopes; bulk
hide/show.

Dependencies: CE6A (`ce06a-block-envelope-contract`) and CE6B
(`ce06b-block-rendering-delivery`), both archived; CE2B's `LACE_BUILD_SITE_URL`
for absolute copied links.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-draft-editor`: block cards gain Content/Settings tabs with envelope
  controls, hidden-block presentation and menu action, the anchor in the
  header, envelope validation and issue mapping, hidden-block marking in the
  validation summary, and read-only envelope presentation for viewers; the
  "preserves block envelopes it does not edit" requirement becomes a
  requirement that envelopes survive draft operations.

## Impact

- `apps/admin`: `widgets/block-editor` (BlockCard tabs and Settings panel,
  BlockEditor hide/show and link base), `entities/content` (form values,
  local envelope validation, issue mapping, validation problems with
  blocking/hidden flags), `pages/entry` (link base, server issue types,
  summary heading and reveal), unit tests and Playwright e2e/accessibility
  specs.
- Reuses `isBlockAnchor`, `normalizeBlockClassName` and the envelope limits
  from `@lacecms/content`; no package API, REST, storage or template change.
- Docs: `docs/mvp-architecture.md` section 17, `docs/adr/0012-block-envelope.md`,
  `docs/content-editor-roadmap.md`.
