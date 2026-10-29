## Context

See `proposal.md` for motivation and scope. The owner's current `docker-compose.dev.yml` diff already adds `LACE_MCP_ENABLED: ${LACE_MCP_ENABLED:-false}` to `api.environment`; preserve it and verify it during apply. Compose's `--env-file` interpolates values but does not automatically export arbitrary keys into containers. `scripts/dev-stack.mjs` creates local and isolated acceptance environments and invokes the same Compose file.

`packages/contracts/src/index.ts` defines a strict `adminSettingsStatusSchema` with model count, email, version and readiness. `packages/server/src/app.ts` projects it at the existing session-protected Settings endpoint, and already receives `mcpEnabled` and `publicBaseUrl`. Both platforms supply canonical configuration. `SettingsPage` owns the status query; `SiteStatusCards` supplies Refresh and stale/error handling. `EmailDeliveryCard` is an adjacent component pattern. Account owns `McpConnections` and hides it while MCP is disabled.

Accepted MCP specifications keep discovery, OAuth and connection routes closed when disabled. Settings is an ordinary admin route, so returning safe disabled configuration there does not change this boundary. No architecture invariant needs relaxation.

## Goals / Non-Goals

**Goals:** one server-owned MCP configuration summary, consistent Node/Worker behavior, discoverable disabled state, and setup examples tied to canonical configuration and explicit permission selection.

**Non-Goals:** health probing, automated CLI execution, browser environment editing, new provider routes, cross-user connection listings, additional tools, or changes to grants and their persistence lifecycle.

## Decisions

### 1. Extend the existing Settings response

Add a required strict `mcp: { enabled: boolean; endpoint: string }` field to `adminSettingsStatusSchema` and its DTO. Validate endpoint as an absolute HTTP(S) URL with the supported `/mcp` path and no credentials/query/fragment. Project `enabled` from parsed runtime settings, and construct `new URL('/mcp', publicBaseUrl).href` using validated configuration. Do not fall back to request origin if canonical configuration is missing; retain a safe unavailable/configuration failure. Real deployments already require that configuration; update test fixtures explicitly.

The server only projects configuration. It does not import MCP SDK or provider types; `application` and database boundaries remain unchanged. Use the existing session and `settings:manage` checks. Update any documented/generated status representation that exists; do not expand unrelated OpenAPI coverage solely for this change.

Rejected: a new public status endpoint, widening account capabilities into deployment metadata, probing `/mcp` in the browser, or reporting Ready/Connected based on an environment boolean. These either duplicate transport state or confuse configuration with connectivity.

### 2. Add a Settings-local MCP section

Use a page-local `McpSettingsCard` (or equivalent established Settings component structure), supplied by the existing status query and rendered near Site status before Build tokens. Reuse shared Badge, Button, accessible selection and copy feedback patterns. Keep current refresh/stale/error/session recovery behavior and avoid a second status query. Long endpoints and examples wrap or scroll within their section on narrow viewports.

Always show the section shell; no confirmed data means loading/unavailable. Disabled configuration shows endpoint and activation/recreate guidance. Enabled configuration shows setup examples and a router link to the current user's `/account`. It does not embed or fetch connection lists. No configuration toggle is added.

### 3. Keep setup examples small and deterministic

Default to read-only; offer an explicit read/write-drafts choice. Render Codex CLI add plus login with DCR and the selected scopes, and a TOML alternative with URL and scopes. Use stable server name `lace`. Explain that a pre-existing `lace` configuration must be updated rather than blindly added again. Generic client instructions give transport, endpoint, OAuth/PKCE/DCR, and browser consent requirements; no unverified client-specific recipes are added.

Build snippets as pure UI formatting functions from the validated endpoint and a closed scope choice. Shell-quote the URL as data (including apostrophes); TOML-escape strings rather than interpolating raw text. The add command uses `codex mcp add lace --url <quoted-endpoint>`; login uses `codex mcp login lace --oauth-client-registration dcr --scopes <closed-scope-list>`. TOML includes `[mcp_servers.lace]`, `url`, and `scopes`, followed by the necessary login instruction. Do not execute snippets or mint credentials. Copy operations require a successful clipboard promise before success feedback and leave selectable text on failure.

Current CLI options were checked during the preceding troubleshooting session. At apply, confirm examples against the available Codex CLI help/official documentation if its interface changes; this does not require changing Lace OAuth. Clarify that account roles and explicit consent still bound permissions, and only five draft-oriented operations exist.

### 4. Treat Compose interpolation and runtime parsing as separate layers

Retain the owner's forwarding line: Compose missing/empty values default to `false`; non-empty invalid strings pass through to the strict parser. The direct Node/Worker parser still rejects empty strings; this proposal does not change it. Add explicit `LACE_MCP_ENABLED=false` to generated local environment defaults and the example for discoverability.

Use an isolated synthetic environment for Compose assertions rather than printing a real resolved environment with secrets. Verify absent, empty, false, true and invalid non-empty input. A focused disposable Compose activation check must exercise the actual container environment and HTTP discovery/challenge, not only a string match in YAML. Keep the existing default-off smoke behavior and data preservation.

### 4a. Preserve MCP routing through the local development gateway

The disposable Compose check during apply found a second activation defect:
`apps/api/src/node-server.ts` keeps only `/api` and `/health` namespaces local,
so `/mcp` and canonical root discovery are sent to Astro even when the API is
correctly configured. This is required remediation for the already specified
local enablement scenario, not a new OAuth surface. Keep `/mcp` and its child
paths and both MCP discovery namespaces local, alongside the existing API paths;
the portable API remains responsible for exact route/method allowlists and
returning disabled `404`. Do not proxy their WebSocket upgrades to frontends.
Verify gateway routing with recording handlers and actual Compose HTTP checks.
No new capability or authority is introduced.

### 5. Portability, security, and failure behavior

The same server projection and UI run on both platforms; SQLite/D1 and grant transaction semantics are untouched. Extend existing OAuth Node/D1 runtime fixtures to cover enabled/disabled settings metadata and authentication rejection. Canonical-URL tests use non-default ports and misleading forwarding headers. Shared contract tests reject malformed metadata.

No schema migrations or new dependencies are needed. Existing request completion logging remains sufficient and must not gain response bodies, tokens, or environment dumps. Concurrent status reads have no mutations; stale query state is explicitly marked and later successful refresh replaces it. No new optimistic updates or account-wide effects occur.

## Risks / Trade-offs

- **Enabled can be mistaken for reachable** → label it as configuration and keep generic API readiness separate; external client acceptance is not claimed.
- **Strict response contract changes** → update server, contract, admin fixtures and status consumers together; ship matching API/Admin assets and fail visibly on incompatible responses.
- **Snippets drift or become unsafe** → closed choices, escaped values, focused formatting/copy tests, and CLI/documentation verification.
- **Compose regression hidden by API unit tests** → verify actual Compose forwarding and isolated HTTP behavior, in addition to portable runtime fixtures.
- **An existing connection has fewer scopes** → explain that selecting a snippet grants nothing and new write consent is necessary; keep Account revoke/reconnect guidance.

## Migration Plan

On explicit apply, select MCP2 in `backlog.md` without changing unrelated ordering and clarify architecture section 17's Settings surface. Verify the existing user Compose edit, add defaults/documentation and focused regression coverage, then implement contract/server/UI and run checks. Recreate only the API container to apply environment changes; never reset development volumes. Deploy API and Admin from the same build. Roll back matched code/assets if needed; disable MCP through deployment configuration and recreate/redeploy while retaining database state. No migration rollback is necessary.
