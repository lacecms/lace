## Why

The local `dev:node` stack reads `.env` for Compose interpolation but did not forward `LACE_MCP_ENABLED` into the API container, leaving OAuth registration at `404` while Admin worked. Settings also gives administrators no indication that MCP is disabled or how to connect a client.

## What Changes

- Deliver roadmap follow-up **MCP2**, one session unit for reliable MCP activation and its Settings guidance, following archived MCP1. The reported setup failure motivates verifying the configuration fix together with the UI that makes it visible; no other roadmap unit is included.
- Preserve and verify the owner's existing Compose forwarding fix, keep opt-in defaults, and document container recreation after environment changes. Keep MCP and discovery paths local to the Node development gateway so the existing activation acceptance scenario works end to end.
- Add a read-only MCP status section to Settings, visible when enabled and disabled, backed by the authenticated settings response on Node and Cloudflare.
- Show the canonical MCP endpoint, copyable Codex CLI read-only/read-write commands, a Codex TOML alternative, and generic Streamable HTTP/OAuth connection guidance. Explain draft-only authority and link to the user's Account connections.
- Preserve existing account connection management, consent, authorization, and all five MCP tools.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-node-development`: forward and verify optional MCP configuration through the documented Compose workflow.
- `rest-contracts`: expose a safe MCP configuration summary through the existing admin settings status contract, including when MCP is disabled.
- `admin-users-and-settings`: display MCP configuration state and actionable, copyable client setup instructions in Settings.

## Impact

Relevant architecture: `docs/mvp-architecture.md` sections 5 (deployment), 6 (package boundaries), 14 (authentication/delegation), and 17 (Admin). Accepted `mcp-content-server` and `mcp-oauth-delegation` remain constraints; their disabled endpoint rules and Account visibility rules are unchanged. Add a small architecture UI clarification and select MCP2 in `backlog.md` at apply time without reordering unrelated work.

Affected areas: root Compose/environment templates, `apps/api` development gateway, and contributor/MCP docs; `packages/contracts` status schemas and API documentation where represented; `packages/server` settings projection; platform wiring only if needed for the existing canonical URL; `apps/admin` Settings and focused cross-runtime fixtures. No new dependency, database migration, background probe, or service is required.

Non-goals: enabling MCP from the browser, editing deployment variables in Admin, probing external connectivity, token display/manual bearer-token setup, additional MCP tools, new OAuth flows, or claiming third-party client acceptance. Depends on completed MCP1 and its existing migrations. The owner's Compose edit is input to verify, not work performed by this proposal.
