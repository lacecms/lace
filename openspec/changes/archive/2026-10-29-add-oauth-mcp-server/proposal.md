## Why

Lace users need to let an MCP client inspect content and prepare drafts using
their existing account, on either Node or Cloudflare. The admin API and MCP
must share content operations, authorization, validation and projections so a
future business-rule change is implemented once.

## Roadmap unit

**MCP1 Optional OAuth content assistant**, selected by the owner on 2026-10-28.
One end-to-end unit covers the shared content boundary, OAuth delegation and
five draft-oriented tools on both runtimes. These pieces cannot be accepted
independently as a usable authenticated integration. Media tools and wider CMS
administration are deferred; this does not select the pending video changes.

## What Changes

- Add an opt-in `/mcp` endpoint in the existing CMS deployment. The exact string
  `LACE_MCP_ENABLED=true` enables it; absent or `false` leaves it disabled.
- Reuse Better Auth accounts and the current admin sign-in form for OAuth
  authorization code with PKCE, explicit client consent, expiring access tokens,
  rotating refresh tokens and revocable connections.
- Inherit the current user's role permissions, bounded by the granted scopes
  and a server-owned operation allowlist. Publication, unpublication and all
  deletion remain forbidden to MCP, including when the user is an administrator.
- Expose only `list_content_models`, `list_entries`, `get_entry`, `create_entry`
  and `save_draft`. Reuse complete-draft semantics and revision guards.
- Make REST admin handlers and MCP tools call the same portable application
  operations. Extract currently HTTP-local metadata/detail orchestration into
  shared application code and DTO preparation into contracts. Do not create a
  parallel MCP service implementation or call the REST API over loopback HTTP.
- Enforce delegated operation restrictions inside the shared application
  boundary as well as tool discovery; an omitted tool is not the authorization
  mechanism. Browser permissions and existing REST contracts remain unchanged.
- Add portable OAuth persistence/migrations and minimal consent/connection
  management UI. Use the existing SQLite/D1 database and platform adapters;
  no extra service, Durable Object, KV requirement or Node-only server is needed.

## Dependencies and non-goals

Depends on accepted authentication, accounts, content use cases, contracts,
collection queries and Node/Cloudflare compositions. The SDK and Better Auth
OAuth extension must be pinned and verified together on both runtimes.

Compatibility acceptance also compiles production provider composition. The
owner-selected resolution for the pinned provider's optional OpenAPI metadata
declarations is to disable only `exactOptionalPropertyTypes` in the auth package
and its OAuth type-compatibility fixture. `strict: true` and the other checks
remain enabled; the shared compiler baseline and other packages retain their
settings. Do not patch dependency declarations or runtime code for this issue.

No publication, unpublication, deletion (including unpublished entries/media),
media tools/uploads, revert/duplicate tools, user/settings/build management,
configuration/source editing, CLI/stdio server, separate deployment, anonymous
content access, personal API tokens, external identity provider, multi-tenancy,
per-entry ACLs, MCP subscriptions/sampling or autonomous approval workflow.
OAuth connection revocation is credential management, not a content-delete tool.

## Capabilities

### New Capabilities

- `mcp-content-server`: optional endpoint, five tools, shared content contracts,
  bounded transport behavior, errors and Node/Cloudflare parity.
- `mcp-oauth-delegation`: discovery, registration, login/consent, resource-bound
  tokens, current-account resolution, connection revocation and lifecycle.

### Modified Capabilities

- `content-use-cases`: shared operation-aware delegated authority, metadata and
  admin read orchestration, with transport-independent enforcement.
- `authentication-and-actor-boundary`: explicitly narrow the current
  session-only actor rule and closed provider-route allowlist for MCP OAuth,
  while preserving browser-session and account-management protections.
- `hono-app-factory`: compose the optional MCP boundary before asset fallback
  and route supported admin content operations through the shared boundary.
- `rest-contracts`: reuse content schemas/projections from both adapters,
  retaining the existing REST wire contract.
- `workspace-governance`: declare and enforce the portable MCP package edges.

## Impact

Governing architecture: sections 3–6 (scope, portability and package graph),
12 (API), 14 (auth), 15–16 (ports, database atomicity), 17 (admin), 19–20
(dependencies and verification). Section 14 currently allows only three provider
routes and session-derived content actors. This proposal deliberately extends
those rules for resource-bound MCP tokens; it does not silently reinterpret
them. The first apply task updates architecture and backlog before code changes.
Accepted main specs are synchronized only after implementation is verified.

Affected packages: domain/application, contracts, auth/db, server, a new
`@lacecms/mcp`, both platform packages, admin, generated-project templates,
boundary/release tooling and maintained docs. OAuth tables require additive
checked-in migrations; runtime schema generation is forbidden. MCP is a new
opt-in surface; existing REST consumers, browser sessions and build-token
capabilities retain their behavior.
