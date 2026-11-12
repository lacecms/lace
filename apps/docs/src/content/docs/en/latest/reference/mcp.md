---
title: MCP reference
description: The optional MCP content server's endpoints, OAuth discovery, scopes, tools and limits.
kind: reference
verifiedAgainst: 0.1.0-rc2
---

Lace can serve a stateless Streamable HTTP MCP endpoint from the same Node or Cloudflare installation, so an OAuth-capable assistant client can read and edit content on behalf of a signed-in user. It is disabled by default. To enable it and connect Codex, Claude Code or Gemini CLI, follow the [MCP setup guide](../../operations/mcp/).

## Endpoints

| Path                                               | Method    | Purpose                                                                                                        |
| -------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| `/mcp`                                             | POST      | The MCP endpoint: stateless Streamable HTTP tool calls, protocol `2025-11-25`; requires an OAuth access token. |
| `/.well-known/oauth-protected-resource/mcp`        | GET       | Protected resource metadata naming the authorization server.                                                   |
| `/.well-known/oauth-authorization-server/api/auth` | GET       | Authorization server metadata; issuer `<origin>/api/auth`.                                                     |
| `/api/auth/.well-known/oauth-authorization-server` | GET       | Alias of the authorization server metadata.                                                                    |
| `/api/auth/oauth2/register`                        | POST      | Public client registration: up to five redirect URIs, no client secret, at most 8192 bytes.                    |
| `/api/auth/oauth2/authorize`                       | GET, POST | Authorization code flow with S256 PKCE, through the Lace sign-in form and an explicit consent screen.          |
| `/api/auth/oauth2/token`                           | POST      | Exchange a code or rotate a refresh token.                                                                     |
| `/api/auth/oauth2/revoke`                          | POST      | Revoke a token.                                                                                                |

The paths are relative to the origin of `LACE_PUBLIC_BASE_URL`. With MCP enabled, that setting must be an origin without a path: HTTPS, or loopback HTTP during development. Incoming `Host` and forwarding headers never choose the issuer or resource. Users list and revoke their own connections through the [account endpoints](../api/#account-endpoints).

## Settings

| Setting                | Purpose                                                                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LACE_MCP_ENABLED`     | The exact string `true` enables MCP; absent or `false` disables it, and other values fail configuration. Disabled installations return `404` for every path above and for the connection endpoints, and keep existing connections stored. |
| `LACE_PUBLIC_BASE_URL` | Canonical origin of the endpoint, the issuer and the resource.                                                                                                                                                                            |

Apply the release's database migrations before enabling MCP. No other service, secret or Worker binding is needed. See [CLI and environment](../cli-environment/).

## Scopes

| Scope             | Grants                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `content:read`    | Model discovery, entry lists and entry details.                                                                |
| `content:write`   | Creating entries and saving complete drafts; includes `content:read`.                                          |
| `content:publish` | Publishing saved drafts; includes `content:write` and `content:read`. Only an administrator can consent to it. |
| `offline_access`  | Rotating refresh tokens; grants no content permission.                                                         |

A request needs at least one content scope. The effective authority is the intersection of the consented scopes and the user's current role: a viewer cannot consent to write, an editor cannot consent to publish, and a demoted user loses authority on the next request. Refreshing a token never widens its consent.

## Tools

The tool list shows only the tools the effective authority permits, and every call is authorized again.

| Tool                  | Required scope    | Arguments                                                                                           | Behavior                                                                                                                                                                                   |
| --------------------- | ----------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_content_models` | `content:read`    | None                                                                                                | Return the models with fields, allowed blocks, SEO, layout, `visibility` rules and query limits, as `GET /api/v1/admin/content-models` does.                                               |
| `list_entries`        | `content:read`    | `modelKey`; optional `q`, `slug`, `status`, `sort`, `filters`, `after`, `limit` (1–100, default 50) | List draft entries of one model. `filters` is a JSON array with the grammar of the [admin collection queries](../api/#configured-admin-collection-queries).                                |
| `get_entry`           | `content:read`    | `entryId`                                                                                           | Read an entry, its draft revision and its published snapshot.                                                                                                                              |
| `create_entry`        | `content:write`   | `modelKey`, `title`, `fields`, `blocks`; optional `slug`, `seo`                                     | Create an unpublished entry from a complete draft. Not idempotent: re-read after an uncertain outcome.                                                                                     |
| `save_draft`          | `content:write`   | `entryId`, `expectedRevision`, `title`, `fields`, `blocks`; optional `slug`, `seo`                  | Replace the complete draft at the expected revision. Never publishes or requests a build; a stale revision fails instead of overwriting.                                                   |
| `publish_entry`       | `content:publish` | `entryId`, `expectedRevision`; optional `idempotencyKey`                                            | Publish the saved draft at that revision, with the same checks as Admin. Retry an uncertain call with the same key; a replay returns `publication: "replayed"` and does not publish again. |

Hidden conditional fields keep their draft values, are not required for publication and are never published. Unpublishing, deletion, revert, duplication, media, users, settings and builds are not available through MCP for any role. Published content reaches the site with the next successful build.

## Responses and limits

| Item                     | Value                                                                                                                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Successful tool result   | Validated JSON in `structuredContent` plus the same result as text.                                                                                                                                                                 |
| Tool error               | The REST error code and issue paths, inside an MCP tool error.                                                                                                                                                                      |
| Missing or invalid token | HTTP `401` with an OAuth challenge.                                                                                                                                                                                                 |
| Missing scope            | HTTP `403` `insufficient_scope` naming the required scope.                                                                                                                                                                          |
| Authorization code       | Single use, expires after 5 minutes.                                                                                                                                                                                                |
| Access token             | Expires after 15 minutes.                                                                                                                                                                                                           |
| Refresh token            | Requires `offline_access`; rotates on use and never outlives the 30-day grant. Reusing a consumed token revokes its family.                                                                                                         |
| Rate limits              | MCP 60 requests per minute per user; registration 10 per 15 minutes per address; token requests 60 per minute per client and address; connection revocation 20 per hour per user. Exhausted limits return `429` with `Retry-After`. |
