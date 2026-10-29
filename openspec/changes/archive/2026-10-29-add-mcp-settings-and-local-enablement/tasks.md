## 1. Align scope and preserve the local fix

- [x] 1.1 Select MCP2 in `backlog.md` and clarify architecture section 17's read-only MCP Settings surface; verify both name this change, preserve unrelated roadmap ordering, and retain the disabled MCP/Account boundary.
- [x] 1.2 Preserve and verify the owner's Compose forwarding line; add disabled MCP defaults to `.env.example` and `scripts/dev-stack.mjs` environment generation. Verify resolved API environment using synthetic Compose inputs for absent, empty, false, true and unsupported non-empty flags without printing real secrets (`local-node-development`).

- [x] 1.3 Keep MCP and discovery namespaces local in the Node development gateway, including rejection of frontend WebSocket forwarding. Verify recording-handler gateway tests and the disposable Compose discovery/challenge scenarios (`local-node-development`).

## 2. Expose canonical settings metadata

- [x] 2.1 Extend the strict shared settings DTO with required MCP enabled/endpoint metadata and update affected status fixtures/representations. Verify focused contract tests accept both states and canonical non-default ports and reject malformed endpoint/metadata (`rest-contracts`).
- [x] 2.2 Project MCP metadata in the existing Settings endpoint from runtime configuration and canonical public URL, preserving session and `settings:manage` checks and safe failure for missing canonical configuration. Verify focused server tests cover both states, hostile forwarding headers, and rejection of anonymous, non-admin and bearer-only callers (`rest-contracts`).
- [x] 2.3 Extend existing OAuth runtime fixtures on Node/SQLite and local Worker/D1 to assert equivalent enabled/disabled Settings summaries while MCP-only endpoints retain their existing gating. Verify the focused runtime fixture cases pass without new persistence or provider changes (`rest-contracts`, `local-node-development`).

## 3. Add MCP Settings and connection examples

- [x] 3.1 Add the Settings-local MCP section backed by the existing status query, including Enabled/Disabled, canonical endpoint copy, activation/recreate guidance, Account link, refresh/loading/error/stale states, and session recovery. Verify focused route/component tests cover both states, initial failure, failed refresh and non-admin access denial (`admin-users-and-settings`).
- [x] 3.2 Add read-only default and draft-editing scope choices, copyable Codex CLI and TOML examples, and generic Streamable HTTP/OAuth instructions. Verify focused tests cover exact endpoint/port, scope changes, shell/TOML escaping, clipboard success/failure and no network mutations from render/copy; confirm current CLI syntax against help or official docs (`admin-users-and-settings`).
- [x] 3.3 Verify the Settings section in a real local browser at desktop and narrow widths, including keyboard selection/copy feedback and no page overflow from examples; confirm existing build-token dialogs and Account connections remain usable (`admin-users-and-settings`).

## 4. Document and verify the complete setup path

- [x] 4.1 Update `docs/mcp.md` and the relevant contributor/local setup guide with Settings guidance, Compose flag forwarding/container recreation, discovery `200` versus disabled `404` and enabled unauthenticated `/mcp` `401`, and OAuth connect/reconnect commands. Verify commands match the shipped snippets and document the absence of new migrations/dependencies (`local-node-development`, `admin-users-and-settings`).
- [x] 4.2 Run a disposable local Compose check with MCP enabled and disabled: assert actual API-container flag values, discovery/challenge/registration routing, authenticated Settings metadata and retained data across API recreation. Verify default-off smoke still passes and cleanup removes only disposable resources (`local-node-development`, `rest-contracts`).
- [x] 4.3 Run focused contracts/server/admin and affected Node/D1 fixture suites, then root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm exec openspec validate add-mcp-settings-and-local-enablement --type change --strict`. Record results and remaining deployment-acceptance limits; verify no provider/tool authority or production schema changes.
