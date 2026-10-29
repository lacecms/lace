## Context

See `proposal.md`. MCP2's existing Settings-local formatter provides Codex CLI,
login and TOML strings. Its card already owns the access choice and copy feedback;
the tab list currently has three choices. Five unwrapped tabs would overflow a
narrow screen. Node/Worker use the same Admin assets and status DTO.

MCP2 is implemented but not yet synchronized/archived. Its unique requirements
remain the baseline; this change adds one uniquely named requirement to the same
capability without modifying or archiving MCP2.

## Goals / Non-Goals

**Goals:** client-correct scope syntax, copyable setup and explicit sign-in steps,
with the existing canonical endpoint and permission state.

**Non-Goals:** new auth behavior, client installers, automatic configuration
writes, browser sign-in-form changes, or external-client acceptance claims.

## Decisions

### 1. Extend the existing Settings formatter and card

Keep formatting pure in `connection-examples.ts`, taking only validated endpoint
and the closed `McpAccess` choice. Reuse a single scopes array, existing shell
quoting and JSON serialization for new formats. No imports into server/auth,
no backend contract changes, new persistence, migration, or dependencies.
Copy controls keep their current success/failure behavior and reset feedback
when formatted values change.

Add Claude Code and Gemini CLI panels to the same card. Retain existing Codex
CLI/TOML and Other clients panels. Make the tab list wrap within its container
on narrow screens; use the existing accessible Tabs primitives. Do not build a
second Settings query or move instructions to the sign-in page. Keep the current
access value while switching panels.

### 2. Claude Code recipe

Generate a server object containing `type: "http"`, `url: endpoint`, and
`oauth: { scopes: scopes.join(" ") }`. Show a copyable command that installs this
definition with `claude mcp add-json --scope user lace <shell-quoted-json>`.
Explain that `user` controls where the client stores configuration, not Lace
permissions. Then use `/mcp` inside Claude Code, select `lace` and authenticate
through the browser. This broadly documented interactive path avoids requiring
the newer optional `claude mcp login` command. Explain updating an existing
entry and re-authenticating after changing scopes; never delete user settings.

Rejected: a bare HTTP add command without scope configuration, invented scope
flags, hard-coded OAuth endpoints, or client secrets. A bare add command would
not preserve the UI's explicitly selected scope ceiling.

### 3. Gemini CLI recipe

Show mergeable JSON for `~/.gemini/settings.json`:
`mcpServers.lace` has `httpUrl: endpoint` and
`oauth: { enabled: true, scopes }`. Do not specify `clientId`, issuer or auth/token
URLs: use OAuth discovery and DCR. Follow it with `/mcp auth lace`, explicitly
labelled as a command inside an interactive Gemini CLI session. Explain that
this authenticates the existing Lace account, independently of the CLI's own
model-provider sign-in. Do not use Google credentials or disable tool approval.

Rejected: generic consumer Gemini instructions, an SSE `url` entry, or a CLI add
command alone that omits selected OAuth scopes. JSON gives an explicit,
reviewable permission ceiling without relying on undocumented flags.

### 4. Verification and operational boundaries

Focused formatter tests parse generated JSON, exercise both scope choices,
non-default ports and shell metacharacters, and check that a harmless shell
substitute receives a single intact Claude JSON argument. Component tests cover
panel changes, scopes, copy feedback and no mutation requests. Use real-browser
keyboard and 320px checks for the expanded tab list; reuse Settings regression
tests for disabled/error/auth states. Do not repeat provider/database lifecycle
suites for this UI-only change without a new failure suggesting a need.

Documentation links and installed CLI help are syntax evidence, not acceptance
of a particular external client against Lace. A compatibility problem requiring
provider changes is outside this UI scope and must be replanned, not fixed by
weakening authorization. No account data or logs need new fields. Rollback is
the matching previous Admin build and documentation; there is no data rollback.

## Risks / Trade-offs

- **Client versions differ** → cite official docs and retain generic fallback;
  record exact acceptance limits without claiming an actual login was tested.
- **Scope syntax differs** → generate a space-separated string for Claude and an
  array for Gemini from one closed scope selection; test both modes.
- **More tabs overflow** → wrap the list and verify at 320px with keyboard.
- **Existing configuration gets replaced** → explicitly instruct merge/update of
  the named entry; copy operations never touch files automatically.

## Reference basis

Retrieved 2026-10-29. These describe client features, not completed Lace tests:

- [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp): HTTP,
  `add-json`, interactive authentication and `oauth.scopes` string. Local
  `claude mcp add-json --help` confirms the command and user configuration scope.
- [Gemini CLI MCP documentation](https://geminicli.com/docs/tools/mcp-server/):
  `httpUrl`, OAuth configuration/scopes, automatic discovery/DCR, and
  `/mcp auth <serverName>`. Gemini CLI is not installed on this host.
