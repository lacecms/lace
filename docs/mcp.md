# Optional OAuth content assistant

Lace can serve a stateless Streamable HTTP MCP endpoint from its existing Node
or Cloudflare deployment. It is disabled by default. This release's tested
baseline is MCP `2025-11-25`, official TypeScript client/server `2.4.0`, Better
Auth and OAuth Provider `1.7.3`. This is a tool-call baseline; persistent MCP
sessions, subscriptions, sampling, background tasks and CIMD are not exposed.

## Enable and connect

1. Apply the release's checked-in migrations on the existing SQLite/D1 database,
   including `0012_oauth_mcp.sql` and `0013_oauth_verification_indexes.sql`.
   Existing readiness requires these migrations even while MCP is disabled.
2. Set the canonical public origin in `LACE_PUBLIC_BASE_URL`. Production OAuth
   requires HTTPS. Local development permits loopback HTTP. Incoming Host and
   forwarding headers do not choose the issuer or resource.
3. Set `LACE_MCP_ENABLED=true` for the Node API or Worker and restart/redeploy.
   For local Worker development put it in `worker/.dev.vars`; for remote Workers
   use a string var. Missing or `false` disables; empty strings, `1`, `TRUE` and
   other values are invalid. No extra service, signing secret or Worker binding
   is needed. Existing `LACE_AUTH_SECRET` and durable database state are reused.
4. Configure an OAuth-capable Streamable HTTP client with the canonical
   `https://cms.example.com/mcp` endpoint. Discovery advertises the issuer
   `https://cms.example.com/api/auth`, the registration endpoint and S256 PKCE.
5. Sign in through the existing Lace form. Review the client name, callback host
   and read versus read/write request, then explicitly approve or deny.

The canonical metadata paths are
`/.well-known/oauth-protected-resource/mcp` and
`/.well-known/oauth-authorization-server/api/auth`. The authorization-server
metadata also has an explicit `/api/auth/.well-known/oauth-authorization-server`
alias. Public client registration is `POST /api/auth/oauth2/register`;
authorization, code/refresh exchange and standard revocation use
`/api/auth/oauth2/authorize`, `/api/auth/oauth2/token` and `/api/auth/oauth2/revoke`.

Registration accepts bounded public-client metadata and up to five redirect
URIs. The provider validates native/web callbacks. Wildcards, embedded
credentials, fragments, arbitrary non-loopback HTTP and unsupported metadata
URLs are refused. No client logos, metadata documents, JWKS URLs or software
statements are fetched. Client credentials and other grant types are disabled.
Lace binds pending authorization parameters to a short-lived opaque browser
handle; a caller cannot supply an arbitrary post-login redirect.

## Scope and content behavior

| Scope | Maximum authority |
| --- | --- |
| `content:read` | Model discovery, entry list and entry detail |
| `content:write` | Create an entry and save a complete draft; includes read |
| `offline_access` | Rotating refresh tokens; grants no content permission |

Only `list_content_models`, `list_entries`, `get_entry`, `create_entry` and
`save_draft` are exposed. Publishing, unpublishing, deletion, duplication,
reverting, media, users, settings and build administration are unavailable,
including for administrators. A viewer cannot approve write authority.

REST and MCP call the same application operations and use the same content
contracts, defaults, field/block metadata, query limits, attribution and error
paths. MCP filters are typed JSON. Saves require the complete draft and an
explicit `expectedRevision`; they never silently reload and overwrite another
writer's changes. Draft writes leave published snapshots, public version and
build outbox unchanged. Existing draft internal-link rules still apply: a
missing/unpublished destination can remain in a draft, but a global cannot be a
destination, and publishing requires available routable destinations.

After an uncertain create/save response, re-read content before deciding what
to do. Creation is not idempotent. Retrying a save must retain its original
revision; do not substitute the latest revision to force an overwrite.

## Connections, expiry and revocation

Account shows your own assistant connections while MCP is enabled. Review safe
client identity, scopes, creation/expiry and last-use date when available.
Revocation requires explicit confirmation and immediately prevents subsequent
access and renewal for that connection. Other connections and the browser
session remain independent. The endpoints are session-only
`GET /api/v1/account/mcp-connections` and
`POST /api/v1/account/mcp-connections/:connectionId/revoke`; account capabilities
are available at `GET /api/v1/account/capabilities`. Bearer tokens do not
authenticate these routes or other admin REST routes. Cookies and build tokens
do not authenticate MCP.

Codes expire within five minutes and are single-use. Access tokens expire
within fifteen minutes. Refresh tokens require `offline_access`, rotate on use
and never outlive their original thirty-day grant. Reusing a consumed refresh
token revokes that family, including its access-token authority; reconnect after
a lost refresh response. Independent grants for the same client/user retain
their own credentials. Tokens are hashed at rest; committed issuance bindings,
family generations and current enabled account/role are checked on requests.

Account disable, password reset, administrator sign-out-everywhere and password
change/revoke-others invalidate delegated authority alongside existing session
effects, even with MCP disabled. Re-enabling an account does not revive old
connections. Ordinary browser sign-out leaves independent OAuth grants intact.
Role demotion affects the next request; promotion cannot widen an existing
read-only consent. Revocation does not undo content writes already committed.

## Proxy, limits and observability

The maintained Nginx configs forward `/mcp` and canonical discovery to the API
before static-site fallback, preserve Host including its port, and disable
response buffering for MCP. Apply corresponding changes to an operator-owned
proxy. Keep its canonical origin aligned with `LACE_PUBLIC_BASE_URL`.

Use path-only access logs: do not log `$request`, `$request_uri`, `$args`,
referrers, Authorization headers, bodies or cookies. OAuth authorization URLs
can contain transaction data; callback URLs contain codes. The maintained
`lace_safe` format uses `$request_method $uri $server_protocol`. Apply equivalent
redaction to upstream ingress/APM logging. Application completion records contain
request ID, method/path, status/duration and resolved actor/tool/outcome when
available, without arguments, codes or tokens.

Limits use existing durable fixed-window counters and trusted client addresses:
registration 10 attempts/15 minutes per address; token exchange/refresh 60/minute
per client/address pair; MCP 60 requests/minute per user; owned revocation 20/hour
per user. Exhausted windows return `429` with `Retry-After`. OAuth bodies are
bounded to 8192 bytes; MCP uses the existing admin JSON ceiling. Host and supplied
Origin must match deployment policy; authenticated native clients can omit
Origin. Browser-cookie trusted origins are not widened.

## Disable and verify

Set `LACE_MCP_ENABLED=false` and restart/redeploy to close discovery, OAuth
issuance/refresh, MCP use, consent and connection endpoints. Keep additive
migrations and durable records; do not downgrade the schema. Re-enabling does
not restore revoked authority.

Local verification runs `pnpm compat:mcp` and the production bundle,
equivalence/lifecycle fixtures under `scripts/fixtures/oauth-mcp/`, plus admin
UI and existing auth/security suites. Real-browser login, consent approval and
denial, SDK calls and Account revocation are checked against disposable local
Node and D1 runtimes. These results do not claim a deployed Cloudflare/VPS or
third-party client application has been accepted. Before deployment acceptance,
repeat enable/disable, login/consent, allowed and forbidden operations, refresh,
connection revoke and account disable against the exact release on your host.
