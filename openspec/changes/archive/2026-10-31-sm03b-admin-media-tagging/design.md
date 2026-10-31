## Context

SM3A delivered tags end to end below the UI: every admin media DTO carries a
sorted `tags` array; `PATCH /api/v1/admin/media/:mediaId` replaces the set
under `If-Match`; upload accepts repeated `tags` parts; `GET
/api/v1/admin/media` takes up to five `tag` values (AND); `GET
/api/v1/admin/media/tags` returns `{tag, count}` pages in ascending order for a
normalized prefix. The admin client already exposes `listMedia(…, {tags})`,
`uploadMedia(file, {tags})` and `listMediaTags({q, limit, after})`
(`apps/admin/src/shared/api/admin-client.ts`), but nothing renders tags.

Relevant admin structure today:

- `/media` search parsing in `app/router/media-search.ts`; canonical query in
  `widgets/media-library/library-query.ts`; `MediaPage` navigates with
  `replace: true`.
- `MediaLibrary` and `MediaPickerDialog` each build `listQuery` and the
  `adminQueryKeys.mediaList` key from `q`, `type`, `sort`; the picker keeps its
  query in component state, reset on every opening.
- `MediaToolbar` renders search, type group, Clear filters, sort and view.
- `MediaDetailsPanel` (a Radix `Sheet`) hosts `MediaMetadataForm`
  (`features/edit-media-metadata`) with `metadataValues`/`metadataPatch`,
  conflict handling and a discard confirmation; read-only users get
  `MediaDescription`.
- `useMediaUploads` runs an ordered queue (two concurrent uploads) and
  invalidates `adminQueryKeys.media` after each confirmed upload; the metadata
  update invalidates `["admin","media","list"]`.
- The admin has no combobox component; `shared/ui` offers `Input`, `Popover`,
  `Badge` and `Button`. Radix `Dialog`/`Sheet` close on Escape through a
  document-level capture listener.

## Goals / Non-Goals

**Goals:**

- One tag input reused by the editor and both filters, keyboard operable and
  announced, with no new dependency.
- Client normalization identical to the server so users see the stored form
  before saving.
- No API, contract or database change.

**Non-Goals:**

- Ranking suggestions by popularity (the catalog is alphabetical by design).
- Optimistic list removal or reordering after a tag edit.
- A reusable generic combobox for other admin screens; the component lives
  with media until a second consumer exists.

## Decisions

### D1. A hand-built ARIA combobox in `entities/media`

`entities/media/MediaTagInput` renders chips (`Badge` plus a remove `Button`
labelled "Remove tag <tag>"), an `Input` with `role="combobox"`,
`aria-autocomplete="list"`, `aria-expanded`, `aria-controls` and
`aria-activedescendant`, and an inline listbox positioned under the input
(not portalled). Focus never leaves the input while moving through options. A
polite live region announces additions, removals and limit messages. Props:
`label`, `tags`, `onChange`, `limit`, `limitMessage`, `disabled`.

A sibling hook `useMediaTagSuggestions(text)` derives the normalized prefix,
debounces 200 ms, and reads `client.listMediaTags({ q, limit: 10 })` through
TanStack Query with key `adminQueryKeys.mediaTags(q)` =
`["admin","media","tags",q ?? null]` (`staleTime` 30 s). An empty input on
focus requests the first ten tags. Text that does not normalize sends no
request. Chosen tags are filtered out client-side, so a page can show fewer
than ten options; that is acceptable for autocomplete.

The entity layer may use `shared/api`, and both `features/edit-media-metadata`
and `widgets/media-library` may import entities, so dependency direction is
preserved.

Alternatives rejected: `cmdk`/`downshift` (new dependency for one widget);
Radix `Popover` for the list (moves focus or needs `onOpenAutoFocus`
suppression, portals outside the Sheet's focus trap, and adds a second
dismissable layer competing for Escape).

### D2. Escape closes only the open suggestion list

Radix `Sheet`/`Dialog` close on a document capture-phase Escape listener, so
stopping propagation in the input is too late. `MediaDetailsPanel` and
`MediaPickerDialog` pass `onEscapeKeyDown` to their content and call
`event.preventDefault()` when the event target is a tag combobox with
`aria-expanded="true"`; the input's own keydown handler then closes the list.
A shared predicate `isOpenTagCombobox(target)` exported next to
`MediaTagInput` keeps both call sites consistent.

### D3. Normalization and limits

The input calls `normalizeMediaTag`, the same function the server uses. The
admin depends on `@lacecms/contracts` but not `@lacecms/domain`, so contracts
re-exports it next to the existing `MAX_MEDIA_ALT_LENGTH` re-export: an
additive export with no schema or wire change. The limits
(20 per item, 5 per filter) are admin constants in `entities/media`
(`MAX_MEDIA_TAGS_PER_ITEM`, `MAX_MEDIA_TAG_FILTERS`). A unit test pins them to
the contracts by asserting that `mediaTagsInputSchema` rejects 21 distinct
tags and `mediaListQuerySchema` rejects six `tag` values, so drift fails CI
without exporting new constants from shared packages.

The invalid-text message is fixed text naming the rule ("Use ASCII letters,
digits, and hyphens, up to 40 characters.") rather than a per-character
diagnosis.

### D4. URL state for the library filter

`MediaSearch` and `MediaLibraryQuery` gain `tag: readonly string[] |
undefined`; the URL key `tag` mirrors the API parameter. TanStack Router's
default search serialization stores the array as JSON in one parameter.
`parseMediaSearch` accepts a string or an array, keeps valid normalized tags,
deduplicates, sorts ascending, keeps the first five and omits an empty list.
`normalizedMediaQuery` applies the same canonicalization so equivalent filters
share one URL and cache entry. Clear filters resets `q`, `type` and `tag`.

Alternative rejected: a custom `stringifySearch`/`parseSearch` to write
repeated `tag=` parameters. It would change serialization for every admin
route for a cosmetic gain.

### D5. Query keys and requests

`adminQueryKeys.mediaList` accepts `tags` and stores the sorted array (or
`null`) in its key object; `MediaLibrary` and `PickerBody` pass `tags` to
`client.listMedia`. The picker's local `CanonicalMediaQuery` state gains the
same `tag` field and still resets on every opening.

### D6. Tags in the metadata form

`MediaMetadataValues` gains `tags: readonly string[]` (sorted). `metadataPatch`
adds `tags` with the complete sorted set when the sets differ, so re-adding a
removed tag is not a change and `isMetadataChanged` needs no special case. The
existing conflict path ("save over newer") already recomputes the patch from
the writer's original base and sends only changed keys; tags follow it and
replace the newer set as a whole, which matches the API's full-replacement
semantics. `metadataIssue` is widened to report the first `/tags/<i>` issue,
and the form shows it under the tag editor naming the rejected tag. The
discard confirmation text becomes "The alt text, caption, focal point, or tag
changes of this media are not saved." `MediaDescription` lists tags as text or
"None".

After a save whose patch contained `tags`, `useMediaMetadataUpdate` also
invalidates `["admin","media","tags"]`. The existing list invalidation stays:
an item re-tagged out of the active filter leaves the filtered grid on that
refetch while its panel stays open (the panel already falls back to the
`updates` overlay), which is the honest result of the filter.

### D7. Uploads capture tags per queue entry

`useMediaUploads().add(files, { tags })` stores `tags` on each
`MediaUploadEntry` and passes them to `client.uploadMedia`; retry reuses the
entry's stored tags. The library passes `query.tag`, the picker its local
tags, so a file queued before a filter change keeps the tags it was queued
with. The existing invalidation of `adminQueryKeys.media` after a confirmed
upload already covers the tag catalog key (D1 places it under that prefix).
When a tag filter is active and the user can write media, the upload hint
reads "New uploads are tagged <tags>." next to the Upload images button in the
library and the picker.

### D8. Toolbar layout

The tag filter sits after the type group in `MediaToolbar` as a labelled
group "Tags (all must match)" containing `MediaTagInput` with
`limit={MAX_MEDIA_TAG_FILTERS}`. The toolbar already wraps; at 320 px the chip
row wraps under the input. `MediaToolbar` gains `tags`/`onTagsChange` props;
Clear filters shows when search, type or tags are set.

## Risks / Trade-offs

- [Escape handling depends on Radix calling `onEscapeKeyDown` before
  dismissing] → covered by a unit test per container and an end-to-end
  scenario that presses Escape with suggestions open in the panel and the
  picker.
- ["Save over newer" can drop another writer's tag additions] → this only
  happens after the writer explicitly chooses to overwrite after a conflict
  message; the spec states the full-set replacement.
- [Alphabetical suggestions hide popular tags for an empty prefix] → typing
  one or two characters narrows quickly; popularity ranking is a non-goal.
- [Counts in suggestions can be stale for 30 s] → invalidation after saves and
  uploads in this tab; other users' changes appear after the stale time.
- [JSON-encoded `tag` URL parameter is less readable] → URLs remain
  shareable and reload-safe; readability is not a requirement.

## Migration Plan

None. The admin ships with the API of the same release, and SM3A's API and
migration `0014` are already part of it. Rolling back the admin removes the
controls without affecting stored tags.
