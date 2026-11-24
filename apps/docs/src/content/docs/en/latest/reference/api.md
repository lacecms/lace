---
title: API reference
description: Every REST endpoint of the versioned API with its audience and required credential, the OpenAPI contract and the query grammar.
kind: reference
verifiedAgainst: 1.0.0
---

The REST contract is versioned under `/api/v1`. Admin and account operations require a signed-in browser session with the listed permission; public build export and build thumbnail reads require a build token. Runtime validation, revisions and concurrency checks apply to direct requests too. The [MCP content server](../mcp/) is a separate OAuth endpoint.

[Download the OpenAPI JSON](/lace/reference/openapi.json). This is copied from the repository's committed API contract at docs build time. It can be read without a running CMS. A particular installation can be older than the latest docs; inspect its own contract before sending requests.

## Enable an installation's interactive reference

Set `LACE_API_DOCS_ENABLED=true` and restart the Node runtime, or set the Worker var to the exact string `true` and redeploy. Visit `/api/docs` at your installation's API origin. Omit the variable or set `false` to disable; empty strings and other values are invalid (Node rejects startup; Worker uses its sanitized invalid-environment 503 boundary).

The reference loads `/api/v1/openapi.json` from the same origin; that JSON endpoint remains available when the UI is disabled. The UI is anonymously reachable when enabled, while executed requests retain normal authentication, permissions, validation and concurrency rules. Existing same-origin sessions apply. No server secrets or prefilled/persisted credentials are included. Browser access to the pinned Scalar script at `cdn.jsdelivr.net` is required, so this interactive page is not an offline viewer.

## Credentials and permissions

| Credential                | Purpose                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| None                      | Public reads of published content and published media.                                                                                                                   |
| Build token               | `Authorization: Bearer <token>` for the build export and published-media thumbnails. Admin Settings issues read-only build tokens.                                       |
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

Failures use one JSON envelope: `error.code`, `error.message` and, for some codes, `error.details`. Missing or rejected credentials return `401 AUTHENTICATION_REQUIRED` with `Cache-Control: no-store` and a `WWW-Authenticate` challenge: `Session realm="lace"` for session routes, `Bearer realm="lace"` for build export and build thumbnails, and both for import routes. An authenticated actor without permission, an unsupported credential kind, or a rejected origin or CSRF check returns `403 AUTHORIZATION_DENIED`. A request that breaks the contract returns `422 VALIDATION_FAILED` with value-free issues. The OpenAPI contract names the accepted credentials of each operation through the `session`, `buildToken` and `importToken` security schemes.

## Public endpoints

| Method | Path                                             | Purpose                                                                                         | Credential  |
| ------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------- |
| GET    | `/api/v1/public/build-export`                    | Read one page of the published build export; follow `nextCursor` with `after`.                  | Build token |
| GET    | `/api/v1/public/build-media/{mediaId}/thumbnail` | Read or revalidate the WebP thumbnail of media used by a current publication.                   | Build token |
| GET    | `/api/v1/public/pages/{modelKey}`                | Read a published page.                                                                          | None        |
| GET    | `/api/v1/public/globals/{modelKey}`              | Read a published global.                                                                        | None        |
| GET    | `/api/v1/public/collections/{modelKey}`          | List published entries of a collection with a route.                                            | None        |
| GET    | `/api/v1/public/collections/{modelKey}/{slug}`   | Read a published collection entry by slug.                                                      | None        |
| GET    | `/api/v1/public/records/{modelKey}`              | List published entries of a route-less collection.                                              | None        |
| GET    | `/api/v1/public/content/by-path`                 | Read the published page or collection entry at `?path=`.                                        | None        |
| GET    | `/api/v1/public/media/{mediaId}`                 | Stream media that a current publication uses, with a strong `ETag` and `If-None-Match` support. | None        |

Each page, global, collection item, by-path lookup and list response reflects
one committed publication state. A concurrent republish at the same address
can return the complete earlier or later content with its matching media.
A request made after a move or withdrawal returns `404` at the old address
while it remains absent. For collections and records, the items, order, media and
`nextCursor` agree within each response. Following `nextCursor` with
`after` reads the next page from the state available to that request.
Build export cursors pin a published-state version.

The build thumbnail route checks current publication eligibility before serving
bytes or returning a conditional response. Unpublished or unknown media returns
`404`.

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

| Method | Path                                                    | Purpose                                                                 | Credential |
| ------ | ------------------------------------------------------- | ----------------------------------------------------------------------- | ---------- |
| PATCH  | `/api/v1/account`                                       | Change your display name.                                               | Session    |
| GET    | `/api/v1/account/capabilities`                          | Report account features, such as whether MCP is enabled.                | Session    |
| POST   | `/api/v1/account/password`                              | Change your password.                                                   | Session    |
| GET    | `/api/v1/account/sessions`                              | List your sessions.                                                     | Session    |
| DELETE | `/api/v1/account/sessions/{sessionId}`                  | End another of your sessions.                                           | Session    |
| POST   | `/api/v1/account/sessions/revoke-others`                | End all your other sessions.                                            | Session    |
| GET    | `/api/v1/account/mcp-connections`                       | Page through your MCP connections. Returns `404` while MCP is disabled. | Session    |
| POST   | `/api/v1/account/mcp-connections/{connectionId}/revoke` | Revoke one of your MCP connections; `404` while MCP is disabled.        | Session    |

## Admin endpoints

### Session, models and entries

| Method | Path                                               | Purpose                                                                                                              | Credential                                                          |
| ------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| GET    | `/api/v1/admin/session`                            | Read the signed-in user, role and permissions.                                                                       | Session                                                             |
| GET    | `/api/v1/admin/content-models`                     | List models with fields, blocks, `listOptions` and `listQueryLimits`.                                                | `content:read`, or import token                                     |
| GET    | `/api/v1/admin/models/{modelKey}/entries`          | List draft entries of a model with search, sort and filters ([grammar below](#configured-admin-collection-queries)). | `content:read`, or import token                                     |
| POST   | `/api/v1/admin/models/{modelKey}/entries`          | Create an entry from a complete draft.                                                                               | `content:write`, or import token                                    |
| GET    | `/api/v1/admin/entries/{entryId}`                  | Read an entry with its published snapshot and draft revision, also returned in `ETag`.                               | `content:read`, or import token                                     |
| PUT    | `/api/v1/admin/entries/{entryId}/draft`            | Replace the complete draft at the expected revision.                                                                 | `content:write`, or import token                                    |
| POST   | `/api/v1/admin/entries/{entryId}/publish`          | Publish the saved draft; accepts an `Idempotency-Key` header.                                                        | `content:publish`, or import token issued with publishing           |
| POST   | `/api/v1/admin/entries/{entryId}/unpublish`        | Withdraw the published snapshot; accepts an `Idempotency-Key` header.                                                | `content:publish`                                                   |
| POST   | `/api/v1/admin/entries/{entryId}/revert`           | Replace the draft with the published version.                                                                        | `content:write`                                                     |
| POST   | `/api/v1/admin/entries/{entryId}/duplicate`        | Copy a collection entry into a new unpublished entry.                                                                | `content:write`                                                     |
| DELETE | `/api/v1/admin/entries/{entryId}`                  | Delete a collection entry at the expected revision.                                                                  | `content:write`; also `content:publish` when the entry is published |
| GET    | `/api/v1/admin/entries/{entryId}/link-impact`      | List published links to the entry before delete or unpublish.                                                        | `content:read`                                                      |
| GET    | `/api/v1/admin/link-targets`                       | Search pages and collection entries that a URL field can link to.                                                    | `content:read`                                                      |
| POST   | `/api/v1/admin/link-targets/resolve`               | Resolve up to 200 distinct destination IDs.                                                                          | `content:read`                                                      |
| GET    | `/api/v1/admin/reference-targets`                  | Find eligible page and collection entries, including route-less records.                                             | Browser session with `content:read`                                 |
| POST   | `/api/v1/admin/reference-targets/resolve`          | Resolve the publication status of up to 200 distinct selected IDs.                                                   | Browser session with `content:read`                                 |
| GET    | `/api/v1/admin/entries/{entryId}/reference-impact` | Find direct sources and exact reference locations before delete or unpublish.                                        | Browser session with `content:read`                                 |

### Typed entry references

`reference-targets` requires `modelKey` and accepts a literal title prefix
in `search` (up to 100 characters), `limit` (1–50, default 20) and an
`after` cursor. The batch resolver accepts `{ "ids": [...] }` and returns
statuses keyed by ID. A published route-less target has state `published`
with no `path`. Other states include `unpublished`, `missing` and
`ineligible`.

Request `reference-impact?action=delete` or `action=unpublish` to page
direct source snapshots. Supply both `sourceEntryId` and `snapshotId` to page
that source's locations. Locations carry the source key, area, JSON Pointer
and delivery status. The same read permission applies to both pages.

A delivered published reference returns `409 CONTENT_REFERENCES_IN_USE`
on delete and unpublish. To release it, publish the corrected source first.
For a delete with only draft uses, repeat with
`referenceImpact: { receipt, acknowledgeDraftReferences: true }` in the JSON
body using the current impact receipt. A missing confirmation returns
`CONTENT_REFERENCE_REVIEW_REQUIRED`; an obsolete receipt returns
`CONTENT_REFERENCE_IMPACT_CHANGED`. URL impact uses the independent
`linkImpact: { receipt, acknowledgePublishedLinks: true }`. Both may be
required on the same deletion.

Draft writes, publication and preview can return path-addressed
`reference_target_missing`, `reference_target_model`,
`reference_target_unpublished`, `reference_cycle` or `reference_graph_limit`
issues under `422 VALIDATION_FAILED`. Cycle details include a witness up to
16 IDs, `truncated` and, when verified, `publishFirst` with an entry ID and
title. The proof can examine up to 2,048 reachable entry IDs per changed
source and phase. If that limit is reached, reduce dependencies and retry.

### Protected draft preview

| Method | Path                                      | Purpose                                                                     | Credential                           |
| ------ | ----------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| GET    | `/api/v1/admin/preview/config`            | Read safe preview readiness and supported viewer mode.                      | Browser session with `content:read`  |
| GET    | `/api/v1/admin/entries/{entryId}/preview` | Read the current preview's state and captured revision.                     | Browser session with `content:read`  |
| POST   | `/api/v1/admin/entries/{entryId}/preview` | Request a preview of the expected saved revision with an `Idempotency-Key`. | Browser session with `content:write` |

### Media

| Method | Path                                           | Purpose                                                                             | Credential                                               |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------- |
| GET    | `/api/v1/admin/media`                          | List media with `q`, `type`, `sort` and up to five `tag` filters.                   | `content:read`, or import token                          |
| POST   | `/api/v1/admin/media`                          | Upload a file (multipart `file`) with optional `tags` parts.                        | `media:write`, or import token                           |
| GET    | `/api/v1/admin/media/{mediaId}`                | Read media details and its `ETag`.                                                  | `content:read`, or import token                          |
| PATCH  | `/api/v1/admin/media/{mediaId}`                | Update alt text, caption, focal point or tags with the item's `ETag` in `If-Match`. | `media:write`, or import token                           |
| DELETE | `/api/v1/admin/media/{mediaId}`                | Queue an unused item or start, advance and finish draft detachment.                 | `media:write`; also `content:write` with `detach=drafts` |
| POST   | `/api/v1/admin/media/{mediaId}/retry-deletion` | Retry a failed media deletion.                                                      | `media:write`                                            |
| GET    | `/api/v1/admin/media/{mediaId}/preview`        | Stream the media file for Admin previews.                                           | `content:read`                                           |
| GET    | `/api/v1/admin/media/{mediaId}/thumbnail`      | Read or revalidate the WebP thumbnail of active media, including unpublished items. | Browser session with `content:read`                      |
| GET    | `/api/v1/admin/media/tags`                     | List media tags with item counts by prefix.                                         | `content:read`                                           |

Both thumbnail routes return static WebP up to 320 pixels on the longest
edge and 96 KiB. Responses carry a strong thumbnail `ETag` and
`Cache-Control: private, no-cache`. Send `If-None-Match` to revalidate a cached
thumbnail. A matching validator returns `304` after access and availability
checks. An unavailable derivative returns `503 MEDIA_THUMBNAIL_UNAVAILABLE` with
`Cache-Control: no-store`.

#### Delete media used by drafts

**Compatibility change.** A direct client that previously expected one
`202` for `?detach=drafts` must now handle intermediate `200` responses.
Use a same-origin editor session. Pass the distinct entry IDs the editor
confirmed in the usage list to this example.

```js
async function deleteFromDrafts(mediaId, confirmedIds) {
  const path = "/api/v1/admin/media/" + encodeURIComponent(mediaId);
  async function send(params = {}) {
    const query = new URLSearchParams({ detach: "drafts", ...params });
    const response = await fetch(path + "?" + query, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error.code);
    return { status: response.status, body };
  }
  function receipt({ status, body }) {
    if (
      status !== 202 ||
      body.id !== mediaId ||
      body.status !== "deleting" ||
      body.usageCount !== 0
    )
      throw new Error("Unexpected deletion receipt");
    return body;
  }
  const start = await send();
  if (start.status === 202) return receipt(start);
  const approved = new Set(confirmedIds);
  const { drafts, state } = start.body;
  if (
    start.status !== 200 ||
    state !== "drafts" ||
    !Array.isArray(drafts) ||
    !drafts.length ||
    drafts.length > 50 ||
    drafts.length !== approved.size ||
    !drafts.every(
      (d) =>
        approved.delete(d.entryId) &&
        Number.isSafeInteger(d.expectedRevision) &&
        d.expectedRevision > 0,
    )
  )
    throw new Error("Refresh usage and review the current drafts");
  for (const { entryId, expectedRevision } of drafts) {
    const ack = await send({ step: "entry", entryId, expectedRevision: String(expectedRevision) });
    if (ack.status !== 200 || ack.body.state !== "entry-complete" || ack.body.entryId !== entryId)
      throw new Error("Unexpected draft acknowledgment");
  }
  return receipt(await send({ step: "finish" }));
}
```

If a response is lost, fetch the media details. For active media, replay
the uncertain entry at its original revision or retry finish. A pending,
failed or missing item ends the saved plan. A `409 MEDIA_IN_USE` means
published usage, more than 50 owners, or a remaining reference at finish.
A `409 CONTENT_REVISION_CONFLICT` requires review of the changed draft.
Previously acknowledged saves remain committed. A missing or inactive item
returns `422 CONTENT_INVALID_STATE`. Invalid or repeated query parameters
return `422 VALIDATION_FAILED`. An expired session returns `401` and missing
write permission returns `403 AUTHORIZATION_DENIED`.

### Builds and tokens

| Method | Path                                    | Purpose                                                                        | Credential        |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------ | ----------------- |
| GET    | `/api/v1/admin/build-site`              | Read the configured build site identity; not proof of a deployment.            | `content:read`    |
| GET    | `/api/v1/admin/site-builds`             | Page through persisted site builds, newest first.                              | `content:read`    |
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

| Method | Path                                              | Purpose                                                          | Credential        |
| ------ | ------------------------------------------------- | ---------------------------------------------------------------- | ----------------- |
| GET    | `/api/v1/admin/users`                             | Page through users and return total and disabled account counts. | `users:manage`    |
| PATCH  | `/api/v1/admin/users/{userId}`                    | Change a user's role or disable or enable the account.           | `users:manage`    |
| POST   | `/api/v1/admin/users/{userId}/password-reset`     | Send a password reset to a user.                                 | `users:manage`    |
| POST   | `/api/v1/admin/users/{userId}/sessions/revoke`    | Sign a user out everywhere.                                      | `users:manage`    |
| GET    | `/api/v1/admin/invitations`                       | Page through pending and expired invitations.                    | `users:manage`    |
| POST   | `/api/v1/admin/invitations`                       | Invite an email address with a role.                             | `users:manage`    |
| POST   | `/api/v1/admin/invitations/{invitationId}/resend` | Resend an invitation with a new link.                            | `users:manage`    |
| DELETE | `/api/v1/admin/invitations/{invitationId}`        | Revoke an invitation.                                            | `users:manage`    |
| GET    | `/api/v1/admin/settings/status`                   | Read engine version, readiness, email and MCP status.            | `settings:manage` |
| POST   | `/api/v1/admin/settings/email-test`               | Send a test email to the signed-in administrator.                | `settings:manage` |

Outside `/api/v1`, `/health/live` and `/health/ready` report liveness and readiness, `/api/v1/openapi.json` serves the contract and `/api/docs` the optional interactive reference.

## Draft revision preconditions

Copy the entry detail response's `ETag`, including quotes, into `If-Match`
when saving, publishing, reverting or deleting an entry. A JSON
`expectedRevision` also supplies the precondition. When both are present,
they must agree. Duplicate accepts either or both as an optional guard.
A stale revision returns `409 CONTENT_REVISION_CONFLICT` unless a valid
idempotent replay already applies.

The tag identifies the draft revision. Entry detail is served with
`Cache-Control: no-store` and returns the current entry with `200` even
when the request includes `If-None-Match`. Unpublish uses the JSON
`expectedPublishedSnapshotId`. Media metadata writes use the tag from
the media detail response.

## Page through protected lists

Users, invitations, site builds and MCP connections return `items` and
a `nextCursor` when another page is available. Pass the cursor unchanged
as `after` on the same list. The last page omits `nextCursor`.
Each user page reports `total` and `disabledCount` for all accounts,
including those outside the page. OAuth connection cursors belong to
the signed-in owner.

For these lists and the admin entry and media lists, `limit` is decimal
text from 1 to 100, with a default of 50. An invalid limit returns
`422 VALIDATION_FAILED` at `/limit`. If the API returns that error at
`/after`, retry from the first page without `after`. This includes
connection cursors issued as raw grant IDs before the pagination update.
Older clients that validated the former exact list shapes need the updated
schemas. Update the API and bundled Admin together.

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
