## Why

SM3A stored media tags and exposed them through the admin API, but editors
still cannot see, add or filter by tags: the media library and picker have no
tag controls. A portfolio with hundreds of images (tatianae.com: about 65
projects with several media each) needs tags in the UI before the library is
usable for project-based organization and before `lace import` (SM4) brings
tagged media in bulk.

## Roadmap unit

Session **SM3B** of step SM3 in
[`docs/site-migration-roadmap.md`](../../../docs/site-migration-roadmap.md).
Depends on SM3A (`sm03a-media-tag-storage-api`, archived 2026-10-31): the tag
fields of the media DTO, `tags` in the metadata update and upload, the `tag`
list filter and `GET /api/v1/admin/media/tags`. SM3C (multi-select picker) is
a separate session and is not combined here: it changes picker selection and
list fields, while this session only adds organization controls and is
verifiable through the library alone.

## What Changes

- **Tag editor in the details panel.** Writers edit an active item's tags as
  removable chips plus a text input with autocomplete from the existing tag
  catalog (prefix match, with item counts). Enter or a comma adds the typed
  tag after the SM3A normalization (trim, ASCII lowercase); invalid text is
  explained inline and not added. At most 20 tags per item. Tags are saved with
  the existing explicit Save/Discard, version guard, conflict choice and
  unsaved-changes protection of the descriptive metadata form. A tags-only
  save announces "Metadata saved." because it never requests a build.
  Viewers and items pending deletion see tags read-only.
- **Tag filter in the library.** The `/media` toolbar gains a tag filter with
  the same autocomplete. Up to five filter tags combine with AND, appear as
  removable chips, and live in the URL with the search, type, sort and view.
  Invalid or excess URL tags are ignored; Clear filters also clears tags.
- **Tag filter in the picker.** The media picker dialog gains the same filter.
  Like its other filters it stays local to the dialog and resets on every
  opening (the accepted picker requirement; the roadmap wording "held in URL
  state" applies to the library only and is corrected in the roadmap).
- **Uploads inherit the active tag filter.** Files uploaded in the library or
  the picker while a tag filter is active are uploaded with those tags; the
  upload area states which tags new uploads receive. A retry keeps the tags
  captured when the file was queued.
- Tag autocomplete, filter chips and the editor share one keyboard-operable
  combobox; suggestions failing to load never block typing a tag.

## Scope, Dependencies and Non-goals

Admin UI only (`apps/admin`), plus documentation. No API, schema, database,
public-delivery or template changes; no `TEMPLATE_VERSION` bump. The only
shared-package edit is an additive re-export of the existing domain
`normalizeMediaTag` from `@lacecms/contracts`, so the admin normalizes exactly
like the server.

Non-goals: multi-select picker (SM3C), import (SM4), tag rename, merge or
delete across items, bulk tagging, tags shown on grid tiles or list rows,
clicking a tag to filter, OR filter semantics, tag colors or descriptions,
folders, tags on content entries.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-media-library`: the URL-state requirement gains the tag filter; the
  picker requirement gains a local tag filter; the descriptive metadata
  editing requirement gains tags; new requirements for the tag input
  behavior and for uploads receiving the active filter's tags.

## Impact

- Architecture: none. §9.7 *Media* and §12 *Admin endpoints* already describe
  admin-only tags and their API (SM3A); this session consumes them unchanged.
  Invariant check: tags stay admin-only and tags-only edits never request
  builds.
- Code: `apps/admin` — route search parsing (`app/router/media-search.ts`),
  library query normalization and query keys (`widgets/media-library`,
  `shared/api`), a shared tag combobox (`entities/media`), the metadata form
  and conflict handling (`features/edit-media-metadata`), the upload queue
  (`features/upload-media`), the library, toolbar, picker and details panel;
  unit tests and Playwright end-to-end tests. `packages/contracts`: one
  re-export.
- Docs: `docs/media-tags.md` (tagging UI section), roadmap status and
  progress log.
