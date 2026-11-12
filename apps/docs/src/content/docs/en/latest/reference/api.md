---
title: API reference
description: Every REST endpoint of the versioned API with its audience and required credential, the OpenAPI contract and the query grammar.
kind: reference
verifiedAgainst: 0.1.0-rc2
---

The REST contract is versioned under `/api/v1`. Admin and account operations require a signed-in browser session with the listed permission; public reads are anonymous except the build export. Runtime validation, revisions and concurrency checks apply to direct requests too. The [MCP content server](../mcp/) is a separate OAuth endpoint.

[Download the OpenAPI JSON](/lace/reference/openapi.json). This is copied from the repository's committed API contract at docs build time. It can be read without a running CMS. A particular installation can be older than the latest docs; inspect its own contract before sending requests.

## Enable an installation's interactive reference

Set `LACE_API_DOCS_ENABLED=true` and restart the Node runtime, or set the Worker var to the exact string `true` and redeploy. Visit `/api/docs` at your installation's API origin. Omit the variable or set `false` to disable; empty strings and other values are invalid (Node rejects startup; Worker uses its sanitized invalid-environment 503 boundary).

The reference loads `/api/v1/openapi.json` from the same origin; that JSON endpoint remains available when the UI is disabled. The UI is anonymously reachable when enabled, while executed requests retain normal authentication, permissions, validation and concurrency rules. Existing same-origin sessions apply. No server secrets or prefilled/persisted credentials are included. Browser access to the pinned Scalar script at `cdn.jsdelivr.net` is required, so this interactive page is not an offline viewer.

## Credentials and permissions

| Credential                | Purpose                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| None                      | Public reads of published content and published media.                                                                                                                   |
| Build token               | `Authorization: Bearer <token>` for the build export; read-only, issued in Admin Settings.                                                                               |
| Setup token               | One-time token from `lace auth bootstrap`, sent in the body of the first-administrator request.                                                                          |
| Invitation or reset token | Token from an invitation or password reset link, sent in the request body.                                                                                               |
| Session                   | Browser session cookie from sign-in. Cookie-authenticated changes must come from the installation's own origin.                                                          |
| Import token              | `Authorization: Bearer <token>` for `lace import`; accepted only by the routes marked "or import token". Every other admin or account route refuses a Bearer credential. |

Session permissions come from the user's role:

| Permission        | Roles                 | Purpose                                                        |
| ----------------- | --------------------- | -------------------------------------------------------------- |
| `content:read`    | admin, editor, viewer | Read models, entries, media and link destinations.             |
| `content:write`   | admin, editor         | Create, save, duplicate, revert and delete draft entries.      |
| `content:publish` | admin                 | Publish and unpublish entries; delete published entries.       |
| `media:write`     | admin, editor         | Upload media, edit media metadata and tags, delete media.      |
| `users:manage`    | admin                 | Manage users and invitations.                                  |
| `settings:manage` | admin                 | Settings, build and import tokens, email test, build requests. |

## Public endpoints

| Method | Path                                           | Purpose                                                                                         | Credential  |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------- |
| GET    | `/api/v1/public/build-export`                  | Read one page of the published build export; follow `nextCursor` with `after`.                  | Build token |
| GET    | `/api/v1/public/pages/{modelKey}`              | Read a published page.                                                                          | None        |
| GET    | `/api/v1/public/globals/{modelKey}`            | Read a published global.                                                                        | None        |
| GET    | `/api/v1/public/collections/{modelKey}`        | List published entries of a collection with a route.                                            | None        |
| GET    | `/api/v1/public/collections/{modelKey}/{slug}` | Read a published collection entry by slug.                                                      | None        |
| GET    | `/api/v1/public/records/{modelKey}`            | List published entries of a route-less collection.                                              | None        |
| GET    | `/api/v1/public/content/by-path`               | Read the published page or collection entry at `?path=`.                                        | None        |
| GET    | `/api/v1/public/media/{mediaId}`               | Stream media that a current publication uses, with a strong `ETag` and `If-None-Match` support. | None        |

## Setup, invitation and password reset endpoints

| Method | Path                             | Purpose                                                                                          | Credential       |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------- |
| GET    | `/api/v1/setup/state`            | Report whether setup is complete.                                                                | None             |
| POST   | `/api/v1/setup/admin`            | Create the first administrator.                                                                  | Setup token      |
| POST   | `/api/v1/invitations/inspect`    | Check an invitation token and show its email, role and expiry.                                   | Invitation token |
| POST   | `/api/v1/invitations/accept`     | Accept an invitation by choosing a password.                                                     | Invitation token |
| POST   | `/api/v1/password-reset/request` | Request a password reset link by email; the response does not reveal whether the account exists. | None             |
| POST   | `/api/v1/password-reset/confirm` | Choose a new password with a reset token.                                                        | Reset token      |

## Account endpoints

Every account endpoint acts on the signed-in user and needs a session of any role.

| Method | Path                                                    | Purpose                                                          | Credential |
| ------ | ------------------------------------------------------- | ---------------------------------------------------------------- | ---------- |
| PATCH  | `/api/v1/account`                                       | Change your display name.                                        | Session    |
| GET    | `/api/v1/account/capabilities`                          | Report account features, such as whether MCP is enabled.         | Session    |
| POST   | `/api/v1/account/password`                              | Change your password.                                            | Session    |
| GET    | `/api/v1/account/sessions`                              | List your sessions.                                              | Session    |
| DELETE | `/api/v1/account/sessions/{sessionId}`                  | End another of your sessions.                                    | Session    |
| POST   | `/api/v1/account/sessions/revoke-others`                | End all your other sessions.                                     | Session    |
| GET    | `/api/v1/account/mcp-connections`                       | List your MCP connections; `404` while MCP is disabled.          | Session    |
| POST   | `/api/v1/account/mcp-connections/{connectionId}/revoke` | Revoke one of your MCP connections; `404` while MCP is disabled. | Session    |

## Admin endpoints

### Session, models and entries

| Method | Path                                          | Purpose                                                                                                              | Credential                                                          |
| ------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| GET    | `/api/v1/admin/session`                       | Read the signed-in user, role and permissions.                                                                       | Session                                                             |
| GET    | `/api/v1/admin/content-models`                | List models with fields, blocks, `listOptions` and `listQueryLimits`.                                                | `content:read`, or import token                                     |
| GET    | `/api/v1/admin/models/{modelKey}/entries`     | List draft entries of a model with search, sort and filters ([grammar below](#configured-admin-collection-queries)). | `content:read`, or import token                                     |
| POST   | `/api/v1/admin/models/{modelKey}/entries`     | Create an entry from a complete draft.                                                                               | `content:write`, or import token                                    |
| GET    | `/api/v1/admin/entries/{entryId}`             | Read an entry with its draft revision and published snapshot.                                                        | `content:read`, or import token                                     |
| PUT    | `/api/v1/admin/entries/{entryId}/draft`       | Replace the complete draft at the expected revision.                                                                 | `content:write`, or import token                                    |
| POST   | `/api/v1/admin/entries/{entryId}/publish`     | Publish the saved draft; accepts an `Idempotency-Key` header.                                                        | `content:publish`, or import token issued with publishing           |
| POST   | `/api/v1/admin/entries/{entryId}/unpublish`   | Withdraw the published snapshot; accepts an `Idempotency-Key` header.                                                | `content:publish`                                                   |
| POST   | `/api/v1/admin/entries/{entryId}/revert`      | Replace the draft with the published version.                                                                        | `content:write`                                                     |
| POST   | `/api/v1/admin/entries/{entryId}/duplicate`   | Copy a collection entry into a new unpublished entry.                                                                | `content:write`                                                     |
| DELETE | `/api/v1/admin/entries/{entryId}`             | Delete a collection entry at the expected revision.                                                                  | `content:write`; also `content:publish` when the entry is published |
| GET    | `/api/v1/admin/entries/{entryId}/link-impact` | List published links to the entry before delete or unpublish.                                                        | `content:read`                                                      |
| GET    | `/api/v1/admin/link-targets`                  | Search pages and collection entries that a URL field can link to.                                                    | `content:read`                                                      |
| POST   | `/api/v1/admin/link-targets/resolve`          | Resolve up to 200 distinct destination IDs.                                                                          | `content:read`                                                      |

### Media

| Method | Path                                           | Purpose                                                                             | Credential                                               |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------- |
| GET    | `/api/v1/admin/media`                          | List media with `q`, `type`, `sort` and up to five `tag` filters.                   | `content:read`, or import token                          |
| POST   | `/api/v1/admin/media`                          | Upload a file (multipart `file`) with optional `tags` parts.                        | `media:write`, or import token                           |
| GET    | `/api/v1/admin/media/{mediaId}`                | Read media details and its `ETag`.                                                  | `content:read`, or import token                          |
| PATCH  | `/api/v1/admin/media/{mediaId}`                | Update alt text, caption, focal point or tags with the item's `ETag` in `If-Match`. | `media:write`, or import token                           |
| DELETE | `/api/v1/admin/media/{mediaId}`                | Request media deletion; `?detach=drafts` first removes it from current drafts.      | `media:write`; also `content:write` with `detach=drafts` |
| POST   | `/api/v1/admin/media/{mediaId}/retry-deletion` | Retry a failed media deletion.                                                      | `media:write`                                            |
| GET    | `/api/v1/admin/media/{mediaId}/preview`        | Stream the media file for Admin previews.                                           | `content:read`                                           |
| GET    | `/api/v1/admin/media/tags`                     | List media tags with item counts by prefix.                                         | `content:read`                                           |

### Builds and tokens

| Method | Path                                    | Purpose                                                                        | Credential        |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------ | ----------------- |
| GET    | `/api/v1/admin/build-site`              | Read the configured build site identity; not proof of a deployment.            | `content:read`    |
| GET    | `/api/v1/admin/site-builds`             | List recent site builds.                                                       | Session           |
| GET    | `/api/v1/admin/site-builds/{buildId}`   | Read one site build.                                                           | Session           |
| POST   | `/api/v1/admin/builds`                  | Request a site build.                                                          | `settings:manage` |
| POST   | `/api/v1/admin/builds/{buildId}/retry`  | Retry a failed site build.                                                     | `settings:manage` |
| GET    | `/api/v1/admin/api-tokens`              | List build tokens without their secrets.                                       | `settings:manage` |
| POST   | `/api/v1/admin/api-tokens`              | Create a build token; the plaintext is returned once.                          | `settings:manage` |
| DELETE | `/api/v1/admin/api-tokens/{tokenId}`    | Revoke a build token.                                                          | `settings:manage` |
| GET    | `/api/v1/admin/import-tokens`           | List import tokens without their secrets.                                      | `settings:manage` |
| POST   | `/api/v1/admin/import-tokens`           | Create an import token valid for 1–7 days; publishing needs `content:publish`. | `settings:manage` |
| DELETE | `/api/v1/admin/import-tokens/{tokenId}` | Revoke an import token.                                                        | `settings:manage` |
| GET    | `/api/v1/admin/import-credential`       | Describe the presented import token and its effective permissions.             | Import token only |

### Users and settings

| Method | Path                                              | Purpose                                                | Credential        |
| ------ | ------------------------------------------------- | ------------------------------------------------------ | ----------------- |
| GET    | `/api/v1/admin/users`                             | List users.                                            | `users:manage`    |
| PATCH  | `/api/v1/admin/users/{userId}`                    | Change a user's role or disable or enable the account. | `users:manage`    |
| POST   | `/api/v1/admin/users/{userId}/password-reset`     | Send a password reset to a user.                       | `users:manage`    |
| POST   | `/api/v1/admin/users/{userId}/sessions/revoke`    | Sign a user out everywhere.                            | `users:manage`    |
| GET    | `/api/v1/admin/invitations`                       | List pending and expired invitations.                  | `users:manage`    |
| POST   | `/api/v1/admin/invitations`                       | Invite an email address with a role.                   | `users:manage`    |
| POST   | `/api/v1/admin/invitations/{invitationId}/resend` | Resend an invitation with a new link.                  | `users:manage`    |
| DELETE | `/api/v1/admin/invitations/{invitationId}`        | Revoke an invitation.                                  | `users:manage`    |
| GET    | `/api/v1/admin/settings/status`                   | Read engine version, readiness, email and MCP status.  | `settings:manage` |
| POST   | `/api/v1/admin/settings/email-test`               | Send a test email to the signed-in administrator.      | `settings:manage` |

Outside `/api/v1`, `/health/live` and `/health/ready` report liveness and readiness, `/api/v1/openapi.json` serves the contract and `/api/docs` the optional interactive reference.

## Consume exports safely

Build exports are paginated and tied to a published-state version. Use the matching SDK, which assembles them, or follow these rules when reading the raw REST export. Optional transport keys can be added within the versioned contract; block schema versions and rich-text grammar remain strict. Handle authentication failures and revision conflicts explicitly rather than silently using incomplete content. Build export format 2 carries internal link manifests and needs the SDK of the same release ([Internal links](../../content-modeling/links/)).

- `GET /api/v1/public/build-export` returns a first page `{formatVersion, version, entries, globals, seo, media, nextCursor?}`; `?after=<nextCursor>` returns continuation pages `{formatVersion, version, entries, media, nextCursor?}`. An optional `limit` (1–100, default 100) caps entries per page; the server also ends a page at a fixed byte budget and always delivers at least one entry.
- Follow `nextCursor` until it is absent and merge the pages' `entries` and `media`; `globals` and `seo` come from the first page. Do not mix pages from different versions.
- A continuation whose cursor was issued before a publication fails with `409 BUILD_EXPORT_VERSION_CHANGED` and details `{expectedVersion, actualVersion}`. `client.getBuildExport()` then restarts from the first page, at most two traversals in total (`restart: false` disables this). The published-site loader disables restarts when `LACE_EXPECTED_PUBLISHED_VERSION` is set and reports the conflict as `version_mismatch`; without it, exhausted restarts also fail with `version_mismatch`.
- `If-None-Match` applies to the first page only; continuation pages ignore it, and every `200` page carries the strong ETag of its version.

## Configured Admin collection queries

`GET /api/v1/admin/models/:modelKey/entries` retains `q`, `status`, `limit`,
`after` and, for collections, an exact draft `slug`, and accepts `sort=field:year` or `sort=-field:year` plus one JSON-encoded
`filters` array. Namespacing distinguishes a user field named `title` from the
system `sort=title`. Example filter objects:

```json
[
  { "field": "summary", "op": "contains", "value": "Launch" },
  { "field": "year", "op": "range", "min": 2020 },
  { "field": "featured", "op": "eq", "value": false },
  { "field": "category", "op": "in", "values": ["news", "events"] },
  { "field": "date", "op": "range", "from": "2026-01-01", "to": "2026-12-31" },
  { "field": "updated", "op": "range", "from": "2026-10-25T12:00:00+02:00" },
  { "field": "source", "op": "isSet" }
]
```

Only configured draft targets are accepted. Text equality uses `eq` with a
string; numeric equality uses a finite number. Existence uses `isSet` or
`isNotSet` without operands. Limits are 16 distinct fields, 50 select values,
200 UTF-16 units per text operand and 8192 decoded UTF-8 bytes for `filters`.
Objects are strict and duplicate query parameters fail validation.

`GET /api/v1/admin/content-models` emits `listOptions` on collections and
`listQueryLimits` alongside `items`: Node `{maxSearchLength:200,
maxLikePatternBytes:null}`, Cloudflare `{maxSearchLength:48,
maxLikePatternBytes:50}`. Legacy metadata without limits defaults to Node.
LIKE budgets include literal escaping and two wrappers; see
[collection query rules](../../content-modeling/#collection-list-queries).
Limits are runtime metadata, outside model hashes.

Invalid requests return value-free `422 VALIDATION_FAILED` issues at `/q`,
`/sort`, `/filters/<index>/<member>` or `/after`. A cursor is bound to the model,
canonical query, effective capabilities, LIKE version and runtime policy.
Reordering filters/select operands is equivalent; changing operands, targets,
select options or runtime policy expires it. Labels/column order do not. Custom
string continuations use bounded draft/revision anchors; any successful boundary
draft save, deletion or replacement expires them, including an empty next page.
Restart without `after` while retaining the query. Public collection APIs keep
their independent published ordering and expose none of these field queries.

## Media tags

A tag contains ASCII letters, digits and hyphens only. Surrounding spaces are trimmed and uppercase ASCII letters lowercased, so `Project-2026` becomes `project-2026`. Control characters, internal spaces, non-ASCII letters, emoji and other punctuation are invalid; nothing is transliterated. A normalized tag has 1–40 characters, and an item has at most 20 distinct tags. Returned tag arrays are unique and sorted in ascending ASCII order; every admin media response includes `tags`, empty when unset.

| Request                                              | Tag behavior                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/admin/media`                           | Up to 20 optional multipart text parts named `tags`, one tag each, at most 200 code points before normalization. Invalid tags fail before the file is stored.                                                                                                                                        |
| `PATCH /api/v1/admin/media/{mediaId}`                | `{ "tags": ["project-2026"] }` replaces the whole set, `[]` clears it, and omitting `tags` keeps it. Send the detail response's strong `ETag` as `If-Match`; a stale version returns `409 MEDIA_UPDATE_CONFLICT` and changes nothing.                                                                |
| `GET /api/v1/admin/media?tag=project-2026&tag=cover` | Up to five `tag` parameters, combined with AND and with `q`, `type` and `sort`. An unknown tag returns an empty page. Cursors are bound to the normalized tag set and the other options.                                                                                                             |
| `GET /api/v1/admin/media/tags?q=pro&limit=50`        | Tags starting with the normalized prefix `q`, with item counts: `{ "items": [{ "tag": "project-2026", "count": 3 }], "nextCursor": "…" }`. `limit` is 1–100 (default 50); continue with `after` for the same prefix; `nextCursor` is absent on the last page. Counts include items pending deletion. |

Invalid tags return `422 VALIDATION_FAILED` with pointers such as `/tags/1` or `/tag/2`. A tags-only change updates `updatedAt` but never changes the published version or requests a build. Public content, build exports and MCP do not expose tags. An import token can upload and patch tags but cannot list the tag catalog.

## Related pages

- [Internal links](../../content-modeling/links/): URL fields that link to CMS entries, unavailable links and site helpers.
- [MCP reference](../mcp/) and [MCP setup](../../operations/mcp/): the optional OAuth content server.
