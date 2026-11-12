---
title: Connect an AI assistant (MCP)
description: Enable the optional MCP endpoint, connect Codex, Claude Code or Gemini CLI, and control what an assistant may do.
kind: guide
verifiedAgainst: 0.1.0-rc2
---

Lace can serve an optional [Model Context Protocol](https://modelcontextprotocol.io/) endpoint from your existing Node or Cloudflare deployment. An assistant connected to it signs in as an existing Lace user, through OAuth, and can read models and entries, create entries and save complete drafts. With a separately consented publishing permission, an administrator's assistant can also publish saved drafts. No assistant can unpublish or delete content. MCP is disabled by default; this guide enables it, connects a client and explains how to review, revoke and disable access.

## Before you start

- A running installation whose database has the release's migrations applied (`lace db migrate` for your target). The baseline migration creates the OAuth tables that readiness checks even while MCP is disabled.
- `LACE_PUBLIC_BASE_URL` set to the canonical public origin of the CMS, with a trailing slash. Production OAuth requires HTTPS; local development may use loopback HTTP such as `http://127.0.0.1:3000/`.
- A Lace account. Viewers can grant read access, editors read and draft editing, and only administrators can grant publication.
- An MCP client that supports Streamable HTTP and OAuth. This guide gives recipes for Codex CLI, Claude Code and Gemini CLI. They follow each client's documented configuration; they do not certify a particular client release.

## Enable MCP

Set `LACE_MCP_ENABLED` to the exact string `true`. Missing or `false` disables MCP; empty strings, `1`, `TRUE` and every other value are invalid and stop the runtime with a configuration error that names only the setting. No extra service, signing secret or Cloudflare binding is needed: MCP reuses `LACE_AUTH_SECRET` and the database.

- **Docker Compose or Node:** add `LACE_MCP_ENABLED=true` to `.env`. The generated `docker-compose.yml` forwards it to the API service. Recreate the API so it reads the new environment (`docker compose up -d --force-recreate api`); restarting an existing container does not change its environment.
- **Cloudflare Worker:** set the string var `"LACE_MCP_ENABLED": "true"` in `worker/wrangler.jsonc` and redeploy with `pnpm exec wrangler deploy --config worker/wrangler.jsonc`. For local `pnpm cf:dev`, set `LACE_MCP_ENABLED=true` in `worker/.dev.vars` and restart it.

Open Admin **Settings → MCP**. It shows the server-confirmed Enabled or Disabled state and the canonical endpoint, for example `https://cms.example.com/mcp`, even while MCP is disabled. **Refresh status** reloads it; a failed refresh marks the last values as stale. Enabled means the deployment serves MCP, not that a client has connected.

Check the endpoint from a terminal, replacing the origin with yours:

```sh
curl -i https://cms.example.com/.well-known/oauth-protected-resource/mcp
curl -i https://cms.example.com/mcp
```

When enabled, discovery returns `200` with metadata and the unauthenticated `/mcp` request returns `401` with an OAuth challenge. When disabled, both return `404`. A `404` while Admin works usually means the runtime never received the setting.

## Route the canonical origin through your proxy

The issuer and the protected resource come only from `LACE_PUBLIC_BASE_URL`; incoming `Host` and forwarding headers never choose them. Keep your reverse proxy, DNS and that setting on the same origin.

Your proxy must send these paths to the API before any static-site fallback:

- `/mcp` (and `/mcp/`);
- `/.well-known/oauth-protected-resource/mcp`;
- `/.well-known/oauth-authorization-server/api/auth`;
- `/api/auth/oauth2/*` and `/api/v1/account/mcp-connections*`, which the generated proxy already routes with the rest of `/api/`.

Preserve `Host` including its port and disable response buffering for MCP and discovery. The generated `deploy/nginx.conf` contains these rules; apply equivalent changes to a proxy you own. On Cloudflare, the Worker receives every path.

Log paths only. OAuth authorization URLs carry transaction data and callback URLs carry codes, so do not log the request line with its query (`$request`, `$request_uri`, `$args`), referrers, `Authorization` headers, cookies or bodies. The generated Nginx `lace_safe` log format records `$request_method $uri $server_protocol`. Apply the same redaction to upstream ingress and monitoring. Lace's own completion records contain request ID, method, path, status, duration and, when available, the resolved actor, tool and outcome, never arguments, codes or tokens.

## Choose the access to grant

An assistant's access is the intersection of the scopes you consent to, your current role and the fixed MCP tool set.

| Scope             | Grants                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `content:read`    | Model discovery, entry lists and entry details                                            |
| `content:write`   | Creating entries and saving complete drafts; includes read                                |
| `content:publish` | Publishing saved drafts; includes read and write; requires a role that may publish        |
| `offline_access`  | Rotating refresh tokens so the client stays connected; grants no content access by itself |

Read only is the default everywhere. **Settings → MCP** lets you select Read only, Draft editing or Publishing and generates the matching client configuration. Selecting an option there grants nothing: access is granted only on the consent page. Unpublishing, deletion, duplication, reverting, media, users, settings and build administration are unavailable through MCP for every role and scope. The [MCP reference](../../reference/mcp/) lists each tool with its required scope.

## Connect Codex

Run these commands on the computer that runs Codex. Use the endpoint from Settings; the example is the default local Node endpoint.

```sh
codex mcp add lace --url 'http://127.0.0.1:3000/mcp'
codex mcp login lace --oauth-client-registration dcr --scopes content:read,offline_access
```

For draft editing, log in with `--scopes content:read,content:write,offline_access`. For publication, as an administrator, use `--scopes content:read,content:write,content:publish,offline_access`.

Alternatively, configure `~/.codex/config.toml` and then run the login command:

```toml
[mcp_servers.lace]
url = "http://127.0.0.1:3000/mcp"
scopes = ["content:read", "offline_access"]
```

For draft editing add `"content:write"`; for publication add `"content:write"` and `"content:publish"`. If a `lace` entry already exists, update it instead of adding a duplicate. Restart or reload the client after configuration changes.

## Connect Claude Code

```sh
claude mcp add-json --scope user lace '{"type":"http","url":"http://127.0.0.1:3000/mcp","oauth":{"scopes":"content:read offline_access"}}'
```

`--scope user` selects user-level client configuration; it is not a Lace permission. Inside Claude Code, run `/mcp`, select `lace` and authenticate with your Lace account in the browser. Claude Code takes scopes as one space-separated string: use `"content:read content:write offline_access"` for draft editing and `"content:read content:write content:publish offline_access"` for publication. If `lace` already exists, update its configuration rather than running `add-json` again. See the [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp).

## Connect Gemini CLI

Merge this entry into `~/.gemini/settings.json`, keeping your other settings and updating an existing `lace` entry instead of duplicating it:

```json
{
  "mcpServers": {
    "lace": {
      "httpUrl": "http://127.0.0.1:3000/mcp",
      "oauth": {
        "enabled": true,
        "scopes": ["content:read", "offline_access"]
      }
    }
  }
}
```

In an interactive Gemini CLI session, run `/mcp auth lace` and sign in with your Lace account in the browser; this is separate from signing in to the CLI's model provider. Gemini CLI takes scopes as an array: add `"content:write"` for draft editing, and also `"content:publish"` for publication. These recipes follow the [Gemini CLI MCP documentation](https://geminicli.com/docs/tools/mcp-server/) and do not apply to the Gemini web app.

Every client uses discovery and public-client registration: no client secret or manual bearer token is needed. Other Streamable HTTP clients with OAuth authorization code and S256 PKCE can use the same endpoint; Settings shows generic instructions.

## Sign in and approve access

When the client starts authorization, Lace shows its existing sign-in form if you are not signed in, then a consent page. An existing browser session identifies you but never replaces consent. The consent page shows the client name, its callback host, the requested access and that unpublishing and deletion are never available through MCP.

- Read only is preselected. You can approve narrower access than the client requested.
- Publication is a separate choice. It is unavailable, with an explanation, when your current role cannot publish; an approval that still includes `content:publish` is refused.
- A viewer cannot approve write access.
- Denying issues no tokens.

To change access later, update the client's scopes and authorize again. Configuration alone never widens a grant, and refreshing tokens never widens it either. To replace a connection, revoke it under **Account** and log in again.

Client registration accepts bounded public-client metadata with up to five exact redirect URIs. Wildcards, credentials, fragments and non-loopback HTTP callbacks are refused, and Lace never fetches client logos, metadata documents or other client-supplied URLs.

## Publish through an assistant

Publication needs three things at once: the `content:publish` scope in the grant, explicit consent from an administrator and the user's current permission to publish. A connection created without the scope receives HTTP `403` `insufficient_scope` naming `content:publish`; authorize again with publishing scopes. If an administrator is demoted, publication stops on the next request even with an unexpired token; promotion never widens an existing consent.

`publish_entry` publishes the stored draft of an entry. It takes the entry ID, the draft revision the assistant read (`expectedRevision`) and an optional idempotency key with the same syntax as the REST `Idempotency-Key` header. Content, author and publication time cannot be supplied. The same validation, route, singleton, internal-link and revision checks as in Admin apply. To retry an uncertain publication, reuse the same key with the same entry and revision: a replay reports `replayed` and does not publish or queue a build again.

Published content reaches your site with the next successful build, exactly as an Admin publication does; nearby publications coalesce into one build. A leaked publish-scoped token can change your public site: grant publication only to trusted clients and revoke connections you no longer use.

## Understand tool behavior

Tools use the same content rules, defaults, limits and error codes as the Admin API. An assistant sees only the tools its effective access allows, and every call is authorized again.

- Saves replace the complete draft and require the revision the assistant read. A concurrent edit in Admin produces the usual revision conflict; nothing silently reloads and overwrites another writer's work.
- Saving a draft never publishes, changes public content or requests a build.
- Creating entries is not idempotent. After an uncertain create or save response, re-read the content before deciding what to do, and retry a save only with its original revision.
- Model discovery includes each model's [conditional field](../../content-modeling/conditional-fields/) rules. Hidden field values stay in the draft and are never published.
- Internal links follow the draft rules: a missing or unpublished destination can stay in a draft, but publication requires available destinations.

## Manage connections, expiry and revocation

While MCP is enabled, every user can review their own assistant connections under **Account**: client name, granted scopes, creation and expiry dates and last use when available. Revoking requires confirmation and immediately stops further access and token renewal for that connection; your browser session and other connections are unaffected. Revocation does not undo content changes already saved or published. See [account connections](../../editing-content/accounts/) for the editor's view.

- Authorization codes expire within five minutes and work once.
- Access tokens expire within fifteen minutes.
- Refresh tokens require `offline_access`, rotate on every use and never outlive the original thirty-day grant. Reusing a consumed refresh token revokes the whole connection; reconnect after a lost refresh response.
- Disabling an account, resetting its password, signing out everywhere and changing a password with "revoke other sessions" also revoke its connections. Re-enabling the account does not revive them. Ordinary browser sign-out leaves connections intact.

Connection management is session-only: MCP tokens never authenticate Admin or account API routes, and browser cookies or build tokens never authenticate MCP.

## Know the limits

Lace counts requests in durable fixed windows. An exhausted window returns `429` with `Retry-After`.

| Operation                     | Limit                                     |
| ----------------------------- | ----------------------------------------- |
| Client registration           | 10 attempts per 15 minutes per address    |
| Token exchange and refresh    | 60 per minute per client and address pair |
| MCP requests                  | 60 per minute per user                    |
| Revoking your own connections | 20 per hour per user                      |

Client addresses are resolved as for the rest of the API; behind a reverse proxy, configure the trusted proxy as described in [Deploy on Docker or a VPS](../../deployment/node/). OAuth request bodies are limited to 8192 bytes, and MCP requests use the Admin JSON size limit. `Host` and any browser `Origin` must match the deployment; native clients without an `Origin` header are supported.

The server supports stateless tool calls over Streamable HTTP with the protocol version listed in the [MCP reference](../../reference/mcp/). Persistent sessions, subscriptions, sampling and background tasks are not offered.

## Disable MCP and verify your deployment

Set `LACE_MCP_ENABLED=false` (or remove it) and recreate the API or redeploy the Worker. Discovery, OAuth issuance and refresh, MCP calls, consent and connection management then return `404`. Keep the database migrations and stored connection records; do not downgrade the schema. Re-enabling MCP does not restore connections that were revoked meanwhile.

Lace's own tests run against local Node and Cloudflare simulations. Before relying on MCP in production, repeat these checks against the exact release on your host: enable and disable, sign-in and consent (approve and deny), an allowed and a forbidden tool call, token refresh, revoking a connection and disabling an account.

## Reference

- [MCP reference](../../reference/mcp/): endpoints, discovery URLs, protocol version, scopes and tools.
- [CLI and environment](../../reference/cli-environment/): `LACE_MCP_ENABLED`, `LACE_PUBLIC_BASE_URL` and related settings.
- [API documentation](../../reference/api/): the session-only connection list and revoke endpoints.
