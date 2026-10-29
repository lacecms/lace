---
title: API documentation
description: Read the OpenAPI contract or inspect your own running installation.
---

The public REST contract is versioned under `/api/v1`. Admin/account operations require the appropriate session and permission; public build export reads use their documented credential boundary. Runtime validation, revisions and concurrency checks apply to direct requests too.

[Download the OpenAPI JSON](/lace/reference/openapi.json). This is copied from the repository's committed API contract at docs build time. It can be read without a running CMS. A particular installation can be older than the latest docs; inspect its own contract before sending requests.

## Enable an installation's interactive reference

Set `LACE_API_DOCS_ENABLED=true` and restart the Node runtime, or set the Worker var to the exact string `true` and redeploy. Visit `/api/docs` at your installation's API origin. Omit the variable or set `false` to disable; empty strings and other values are invalid (Node rejects startup; Worker uses its sanitized invalid-environment 503 boundary).

The reference loads `/api/v1/openapi.json` from the same origin; that JSON endpoint remains available when the UI is disabled. The UI is anonymously reachable when enabled, while executed requests retain normal authentication, permissions, validation and concurrency rules. Existing same-origin sessions apply. No server secrets or prefilled/persisted credentials are included. Browser access to the pinned Scalar script at `cdn.jsdelivr.net` is required, so this interactive page is not an offline viewer.

## Consume exports safely

Alpha.6 exports are paginated and tied to a published-state version. Follow continuation/version rules or use the matching SDK, which assembles them. Do not mix pages from different versions. Optional transport keys can be added within the versioned contract; block schema versions and rich-text grammar remain strict. Handle authentication failures and revision conflicts explicitly rather than silently using incomplete content.

## Internal URL destinations

Ordinary URL content fields support **Manual URL** and **CMS entry** modes,
including nested model/global fields and block data. Choosing a published page
stores its ID, so its link follows later slug changes. Settings, rich-text links,
video provider URLs and SEO canonical URLs keep their existing grammar.
Missing destinations keep their IDs for repair; publishing requires valid
visible destinations. Delete/unpublish reviews incoming links and requires an
extra acknowledgment when published-visible links would stop navigating.

Use `site.link(value)`, `entry.link(value)` or a published global's `link(value)`
before generating an href. Only `state === "resolved"` provides `href`;
`unavailable` retains its label/image without navigation, and `empty` has no
value. The Link block supports button/text appearances and optional new-tab
navigation. Updated Hero/CTA/navigation/image/gallery sources use this helper.

Build export format 2 requires local `internalLinks` manifests and a compatible
SDK; format-1-only SDKs fail with upgrade guidance. Upgrade packages and installed
sources before authoring ID targets. Migration 0010 adds indexed projections;
back up first and roll back with matching artifacts and the matching database.
The loader reports bounded `linkDiagnostics` once per assembled view and performs
no per-link network requests. Manual URLs and anchors retain their limitations.

## Configured Admin collection queries

`GET /api/v1/admin/models/:modelKey/entries` retains `q`, `status`, `limit` and
`after`, and accepts `sort=field:year` or `sort=-field:year` plus one JSON-encoded
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

## Optional MCP content API

`LACE_MCP_ENABLED=true` enables `/mcp` with OAuth code/S256, public client
registration and explicit account consent. Discovery is at
`/.well-known/oauth-protected-resource/mcp` and
`/.well-known/oauth-authorization-server/api/auth`. Only model/list/get/create/save
draft tools are available. Publishing, unpublishing and deletion are unavailable.
Use an OAuth-capable Streamable HTTP client; the tested protocol is `2025-11-25`.
Scopes are `content:read`, `content:write` (including read) and `offline_access`
for refresh. Follow the client prompts through the existing sign-in form.
