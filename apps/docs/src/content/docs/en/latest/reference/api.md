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
