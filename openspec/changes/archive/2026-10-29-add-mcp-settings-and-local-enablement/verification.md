# MCP2 verification — 2026-10-29

## Result

Implemented the read-only Settings MCP summary, safe canonical endpoint, Codex
CLI/TOML and generic client guidance with read-only access selected by default.
Preserved the owner's Compose forwarding fix and documented recreation. The
actual Compose check exposed a second development-only routing defect: root MCP
and discovery requests went to Astro. Planning artifacts were reconciled with
this required local-activation remediation; the gateway now keeps those routes
local and rejects their frontend WebSocket upgrades. OAuth/provider behavior,
tool authority and database schema were not changed.

## Automated checks

- Focused contracts, server, lifecycle Node/SQLite and Worker/D1, Compose
  interpolation, and Node HTTP/gateway suites: **234 passed**, six files.
- Settings components and shared admin client: **57 passed**, seven files.
- Root `pnpm typecheck`: passed, including configuration typecheck.
- Root `pnpm lint`: passed; existing warnings in unrelated code remain (including
  the pre-existing unused import/provider UI spread in server).
- Root `pnpm format:check`: passed.
- `pnpm exec openspec validate add-mcp-settings-and-local-enablement --type change --strict`: passed.
- `git diff --check`: passed.

The host's fallback pnpm was 11; commands used Corepack with project-pinned pnpm
12.3.4. A temporary PATH shim ensured nested pnpm scripts used that same version;
no global runtime configuration was changed. D1 and HTTP-listener checks ran
outside the filesystem sandbox because Miniflare needs loopback listeners.

## Disposable Docker and browser acceptance

Used a separate random Compose project, dedicated environment, ports, SQLite and
MinIO volumes; existing local/acceptance stacks and credentials were untouched.
Verified actual API-container flag values, authenticated Settings summaries,
canonical discovery (`200` enabled / `404` disabled), unauthenticated `/mcp`
(`401` challenge enabled / `404` disabled), and public client registration
(`201` enabled / `404` disabled). Switched off → on → off → on through API-only
container recreation. The original authenticated session and complete model
metadata survived those recreations.

Real in-app browser verification covered Enabled and Disabled Settings, Refresh
status replacing the confirmed configuration, keyboard arrow selection of access,
clipboard contents and success feedback, CLI/TOML tabs, Account's existing
Assistant connections section, and opening/cancelling the build-token dialog.
At 390×844, the page scroll width equalled the 390px viewport, with readable
wrapping and no horizontal page overflow. The viewport override was reset and
the test browser tab closed. A local screenshot was saved separately from source.

The standard default-off `dev:smoke` passed and cleaned its own resources. The
additional disposable acceptance project and volumes were also removed after
verification. The existing untracked `packages/platform-node/lace.sqlite` was
left untouched.

## Limits

No production VPS/Cloudflare deployment or interactive third-party Codex login
was accepted by these checks. CLI flags were checked against installed Codex
help; full OAuth lifecycle authority was exercised by the existing official-SDK
fixtures on Node/D1. API and Admin must run the matching updated build. No new
migration or dependency is required; MCP1 migrations remain prerequisites.
