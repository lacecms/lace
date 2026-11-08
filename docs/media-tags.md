# Admin media tags

Tags organize media in the admin: editors tag items in the media details panel
and filter the library and the media picker by tag. All endpoints require an
authenticated session: `content:read` for reads and `media:write` for changes.
Build and MCP bearer tokens cannot use them; an import token can upload and
patch tags but cannot read the tag catalog.

A tag accepts ASCII letters, digits and the ordinary hyphen `-` only. Surrounding
spaces are trimmed and uppercase ASCII letters lowercased: ` Project-2026 `
becomes `project-2026`. Control characters are rejected before trimming;
internal spaces, Cyrillic, full-width letters, emoji and other punctuation are
invalid. No transliteration or automatic space replacement occurs. Normalized
tags contain 1–40 characters, with at most 20 distinct tags per item. Duplicates
collapse and returned arrays are unique and sorted in ascending ASCII order.

- `POST /api/v1/admin/media`: multipart `file` plus up to 20 optional text
  parts named `tags`, one tag per part (at most 200 code points before
  normalization). Invalid tags fail before any object is stored.
- `PATCH /api/v1/admin/media/:mediaId`: `{ "tags": ["project-2026"] }` replaces
  the complete set; `[]` clears it. Omission preserves it. Use the detail
  response's strong `ETag` as `If-Match`. Stale versions return
  `409 MEDIA_UPDATE_CONFLICT` without changing metadata or tags.
- `GET /api/v1/admin/media?tag=project-2026&tag=cover`: up to five tag parameters
  combine with AND and the existing `q`, `type` and `sort`. Unknown tags return
  an empty page. Cursors bind the normalized tag set and the other list options.
- `GET /api/v1/admin/media/tags?q=pro&limit=50`: literal normalized prefix,
  limit 1–100 (default 50), optional `after`. Returns
  `{ "items": [{ "tag": "project-2026", "count": 3 }], "nextCursor": "…" }`.
  `nextCursor` is omitted on the last page. A cursor can only continue the same
  normalized prefix. Counts include every lifecycle status until final deletion.

Every admin media DTO includes `tags`, empty when unset. Validation failures
return `422 VALIDATION_FAILED` with issue pointers such as `/tags/1` or `/tag/2`.
Tags-only edits advance `updatedAt` but never change the published version or
request builds. Combined descriptive edits retain the ordinary media metadata
build rule. Public content, build exports and MCP do not expose tags.

## Admin tagging

- **Tag input.** Every tag field shows the chosen tags as chips with a remove
  button and a text input that suggests existing tags by prefix, with their
  item counts. Arrow keys move through suggestions; Enter adds the highlighted
  suggestion or the typed text; a comma adds the typed text; Backspace in an
  empty input removes the last chip. Typed text is normalized like the API
  (` Cover-Shot ` becomes `cover-shot`); invalid text stays in the input with
  an explanation. Escape closes open suggestions without closing the panel or
  dialog. If suggestions cannot load, typing a tag still works.
- **Details panel.** Writers edit an active item's tags (up to 20) together
  with alt text, caption and focal point, using the same Save and Discard,
  version guard and conflict choice. A tags-only save reports "Metadata saved."
  and never requests a site build. Choosing "Save mine anyway" after a conflict
  replaces the newer version's tags with the writer's set. Viewers and items
  pending deletion show tags as text.
- **Library filter.** The `/media` toolbar filters by up to five tags; items
  must have all of them. The filter is part of the URL (`tag`, next to `q`,
  `type`, `sort` and `view`), so reloads and shared links keep it. Invalid or
  extra URL tags are dropped and the address is rewritten to the applied
  filter. Clear filters also clears tags.
- **Picker filter.** The media picker has the same tag filter, local to the
  dialog like its search and type filter; it resets on every opening.
- **Picking a tagged set.** Add on a gallery or another media list opens the
  picker in multiple mode. Filter it by a project's tag, select its images in
  the order they should appear, and add them all at once; the selection is kept
  while the filter changes.
- **Tagged uploads.** While a tag filter is active, files uploaded in the
  library or the picker receive those tags, and the upload area says so. A
  retried upload keeps the tags it was queued with.

## Upgrade and rollback

The baseline migration creates the indexed `media_tags` join table; ship API and
admin of the same release together. Restore a database backup if rollback must
remove stored tags. Keep object-store backups consistent with the restored
database and do not delete objects to undo tag metadata.
