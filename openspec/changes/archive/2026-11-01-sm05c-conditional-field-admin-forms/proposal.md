## Why

SM5A and SM5B made conditional fields a server-enforced system: `visibility`
rules decide which fields apply, hidden values stay in drafts and published
content omits them. The admin still renders every field, so writers see video
inputs on image items, collapsed rows can be labelled from stale hidden values,
and a stale publication error can point at a field that no longer applies.
This change implements **Session SM5C — Admin forms and documentation** of
`docs/site-migration-roadmap.md` (Step SM5, ADR 0018) so the editor matches
the rules the server already enforces.

## What Changes

- Generic forms show and hide conditional targets reactively in model fields,
  group values, list items (each item on its own) and block data, for writers
  and viewers. The controller's effective value is its form value, otherwise
  its declared default; a cleared or absent controller without a default hides
  its targets. Hidden targets stay mounted and keep their values, editing
  identity and list identity; changing a controller never clears, resets or
  dirties a target. Sections and tabs whose fields are all hidden disappear.
- Validation stays reachable: a hidden target that holds a draft-invalid value
  (the server still validates hidden values as drafts) stays shown with a note
  naming its controller, so the writer can fix or clear it; publication-only
  problems of targets that are now hidden are dropped from the field, the
  summary, tab/section indicators and block-card error state. Summary entries
  keep reading order and focus the exact control, revealing tabs, sections,
  blocks and list items as today.
- Collapsed list rows, block-card summaries, media previews and the "No alt"
  indicator derive only from applicable values, so a stale hidden value never
  labels an item.
- Eligible media lists (multi-select Add) additionally require the single
  required media field to be visible in the item's starting value.
- Documentation: a public *Conditional fields* section in Content modeling,
  editing notes (hidden values kept, revert restores published values only,
  hidden values are not published), and updates to the internal
  `field-guidance.md`, `form-organization.md`, `composite-fields.md`,
  architecture §8 and ADR 0018.
- Owner decision recorded: block `settingsVisibility` stays a separate,
  presentation-only rule and does not converge on `visibility` (settings stay
  validated and delivered regardless of visibility).
- Roadmap: the shipped example (gallery items that hold an image or a video)
  moves to a new Session SM5D; SM5 becomes four sessions.

No REST, OpenAPI, database, block registry or template change. The server
remains the authority; the admin only presents rules it receives in model and
block metadata.

### Non-goals

- Changing the built-in `gallery` block or any shipped block or template
  (SM5D).
- New rule kinds (chains, multiple controllers, settings as controllers,
  rules on scalar list items).
- Clearing hidden values from drafts, or a "clear hidden values" action.
- Client-side publish-mode validation; publication problems still come from
  the server.

### Dependencies

SM5A (`conditional-fields`, metadata in DTOs, shared `isFieldVisible`) and SM5B
(server enforcement, published projection) are archived. CE9B layouts, LIST2
`visibleKeys` support in `FieldLayout`, CE7 composites and SM3C media-list
eligibility are the admin surfaces this change extends.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-draft-editor`: conditional targets are shown and hidden reactively
  with values preserved; problems on hidden targets stay reachable or are
  dropped when publication-only; summaries and previews use applicable values
  only; media-list eligibility requires the media field to be visible by
  default.
- `conditional-fields`: the admin presents the rules without being their
  enforcement, and block settings keep `settingsVisibility` as a separate,
  presentation-only rule.
- `public-documentation`: public guidance covers authoring and editing
  conditional fields.

## Impact

- Admin: `apps/admin/src/entities/content` (new visibility helper, editor-form
  error filtering, `validation-problems.ts`, `item-summary.ts`,
  `media-list.ts`, `FieldLayout`, `FieldRenderer` group rendering),
  `apps/admin/src/pages/entry/EntryPage` (model fields),
  `apps/admin/src/widgets/block-editor` (`BlockCard`, `block-presentation.ts`),
  `apps/admin/src/widgets/media-library/MediaItemPreview`; unit tests and a new
  Playwright journey `conditional-fields.e2e.ts` with axe checks at 320 px.
- Docs: `apps/docs/src/content/docs/en/latest/content-modeling/`,
  `editing-content/index.md`, `docs/field-guidance.md`,
  `docs/form-organization.md`, `docs/composite-fields.md`,
  `docs/mvp-architecture.md` §8, `docs/adr/0018-conditional-fields.md`,
  `docs/documentation-maintenance.md` topic map,
  `docs/site-migration-roadmap.md` (SM5C/SM5D).
- Architecture: §8 "The admin hides fields in SM5C" becomes delivered
  behavior; no invariant changes.
