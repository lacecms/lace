## Why

The implemented MCP Settings card currently has dedicated Codex examples only. Administrators using Claude Code or Google Gemini CLI need equally actionable setup and sign-in instructions using their installation's canonical endpoint and selected content permissions.

## What Changes

- Deliver **MCP3**, one small follow-up session after MCP2, adding Claude Code and Gemini CLI choices to the existing **Settings → MCP** connection instructions.
- Provide copyable client-native configuration and the corresponding browser OAuth sign-in steps, driven by the existing read-only/draft-editing choice.
- Keep Codex CLI, Codex TOML and generic instructions available, with keyboard-accessible navigation that fits narrow screens.
- Document the new recipes and distinguish documented setup from verified third-party-client acceptance.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-users-and-settings`: add Claude Code and Gemini CLI setup/sign-in recipes to the enabled MCP Settings card.

## Impact

Targets `apps/admin/src/pages/settings/McpSettingsCard/`, its formatting/component tests, `docs/mcp.md`, and the contributor guide's setup summary. Architecture sections 14 and 17 constrain delegation and the Settings surface; no invariant changes. At apply, record MCP3 in `backlog.md` without changing unrelated work.

Depends on implemented `add-mcp-settings-and-local-enablement` (MCP2), which is complete but not yet synchronized/archived. Read that change alongside accepted specs; do not archive it implicitly or redefine its requirements in this change. Add a separate requirement with a unique name so synchronization order is straightforward.

Interpretation: the requested MCP "Sign in" area refers to the existing Settings card's connection/authentication instructions. The Admin sign-in form is not changed. Gemini means Google's Gemini CLI; no claim about the consumer Gemini web application is made.

Non-goals: changing OAuth routes/provider/security, client installation or automatic login, new MCP tools, external-account acceptance, backend/API changes, or stored credentials. No migrations or dependencies are required. This turn creates planning artifacts only.
