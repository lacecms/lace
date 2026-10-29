# MCP3 verification — 2026-10-29

## Delivered

Added Claude Code and Gemini CLI panels to Settings → MCP using the existing
canonical endpoint and access selection. Claude's HTTP/add-json configuration
uses a space-separated `oauth.scopes` string; Gemini's mergeable settings JSON
uses `httpUrl` and an OAuth scope array. Client sign-in commands are labelled as
interactive client commands rather than terminal commands. Codex CLI/TOML and
generic instructions remain available. No API, provider, grant, schema, or
external-client configuration was changed.

The tab list wraps on small screens. Real-browser inspection found that the
shared trigger's percentage height caused wrapped rows to overlap the panel;
Settings-local fixed trigger heights resolve this without changing shared Tabs.

## Checks

- Focused Settings, formatting and shared admin client suites: **62 passed** in
  seven files. Includes JSON parsing, intact shell argument handling, selected
  read/write scopes, client switching, clipboard success/failure, and absence of
  mutation requests; existing disabled/error/session/access regressions pass.
- Root `pnpm typecheck`: passed, including configuration typecheck.
- Root `pnpm lint`: passed with existing unrelated warnings and no new warnings.
- Root `pnpm format:check`: passed.
- Strict `openspec validate add-claude-and-gemini-mcp-guides --type change --strict`:
  passed.
- `git diff --check`: passed.

Used project-pinned pnpm through Corepack; the same temporary PATH shim from
MCP2 ensured nested pnpm invocations used the pinned version. No global runtime
or client configuration was modified.

## Browser verification

Ran the existing disposable `scripts/fixtures/oauth-mcp/ui-server.mjs SQLite`
fixture with the built Admin bundle and a separate temporary database/account.
Verified all five tabs, Home/End/Arrow keyboard navigation, read-only → draft
editing → read-only scope changes, and actual clipboard contents for Claude,
Gemini, Codex CLI/TOML and interactive sign-in commands. Claude was inspected at
desktop width and both new panels at 320×844. At 320px, page scroll width equalled
viewport width; three tab rows fit entirely above the panel with no overlap.

Saved local screenshots outside the repository, reset the viewport override,
closed the browser tab, and stopped the fixture server (which removes its
temporary database). Existing CMS data, including the user's test post and MCP
connection, were untouched.

## Client acceptance limits

Recipes were checked against the official Claude Code and Gemini CLI MCP guides
linked in `design.md`; installed `claude mcp add-json --help` also confirmed the
command syntax. Neither an actual Claude Code OAuth login nor a Gemini CLI login
was performed. Gemini CLI is not installed on this host. Documentation-based
configuration examples do not claim acceptance of either third-party client.
