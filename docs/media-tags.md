# Admin media tags

Tags organize media in the admin API. The tagging UI is delivered separately.
All endpoints require an authenticated session: `content:read` for reads and
`media:write` for changes. Build and MCP bearer tokens cannot use them.

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

## Upgrade and rollback

Migration `0014_media_tags` is additive: it creates the indexed join table and
leaves existing media without tags. Apply it before starting the new API; ship
API and admin of the same release together.

Stop Node API/dispatcher before migration and back up SQLite plus the object
store. In a generated project run `pnpm db:migrate`. For Cloudflare export D1
and preserve R2 objects, then run `pnpm exec lace db migrate --target
cloudflare-remote --operator-env .lace/cloudflare-operator.env`; local development
uses `pnpm cf:db:migrate`. Resume the API and check readiness.

An older engine ignores the additive table. Restore the pre-upgrade database
backup if rollback must remove stored tags. Keep object-store backups consistent
with the restored database and do not delete objects to undo tag metadata.
