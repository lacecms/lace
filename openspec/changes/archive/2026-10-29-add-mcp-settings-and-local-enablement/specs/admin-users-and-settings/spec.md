## ADDED Requirements

### Requirement: Settings explains MCP configuration in both states
Settings SHALL contain an MCP section for users with `settings:manage`, visible for both Enabled and Disabled configurations. It SHALL use the authenticated settings status response for its state and canonical endpoint and refresh through the existing Refresh status action. It SHALL label the value as deployment configuration rather than a connectivity test. The canonical endpoint SHALL be displayed with Copy and accessible success/failure feedback. The UI SHALL retain existing loading, error, retry, stale-value, and expired-session recovery behavior; absent status SHALL NOT display Disabled. A failed refresh SHALL identify retained values as stale.

Disabled state SHALL explain that the operator must set `LACE_MCP_ENABLED=true` and restart/redeploy; local Compose guidance SHALL mention recreating the API container and passing the flag into it. The section SHALL provide no browser enable/disable mutation. Enabled state SHALL offer setup instructions and an internal link to the current user's Account connections. Existing Account visibility, ownership, and revoke behavior SHALL remain unchanged. Users without Settings access SHALL see access denied and issue no settings requests.

#### Scenario: MCP is disabled
- **WHEN** an administrator opens Settings and confirmed status reports disabled MCP
- **THEN** the MCP section remains visible with Disabled, the canonical endpoint, and operator activation guidance

#### Scenario: MCP is enabled
- **WHEN** confirmed status reports enabled MCP
- **THEN** the section shows Enabled, the endpoint, client setup instructions, and the Account connections link without claiming a successful client connection

#### Scenario: Refresh fails after a successful load
- **WHEN** Refresh status fails after the MCP summary was loaded
- **THEN** the section retains the last confirmed values with the existing stale indication and retry action

#### Scenario: No successful status response exists
- **WHEN** the initial settings request is pending or fails
- **THEN** the section shows loading or unavailable state and does not infer that MCP is disabled

#### Scenario: Non-administrator opens Settings
- **WHEN** a viewer or editor opens Settings directly
- **THEN** access is denied and neither status nor client setup metadata is requested

### Requirement: MCP connection instructions are copyable and permission-aware
Enabled MCP setup SHALL provide copyable Codex CLI commands to add the canonical endpoint and authorize through public-client DCR. A permission choice SHALL default to read-only (`content:read,offline_access`); choosing draft editing SHALL use `content:read,content:write,offline_access`. An alternative Codex TOML example SHALL describe the same endpoint and selected scopes and SHALL explain that configuration still requires OAuth login. Generic client guidance SHALL identify Streamable HTTP, OAuth authorization code with PKCE, and dynamic client registration, without implying that arbitrary clients are verified.

Examples SHALL use the exact canonical endpoint and syntactically safe quoting for the target shell/TOML format. Copy SHALL copy the displayed text with accessible feedback; a denied clipboard write SHALL report failure and retain manually selectable text. Instructions SHALL explain browser sign-in and explicit consent, that viewers cannot grant write access, that publishing/unpublishing/deletion are unavailable, and that a client may need restart/reload to pick up configuration. They SHALL NOT contain passwords, cookies, build tokens, or generated OAuth credentials. Rendering or copying SHALL NOT register a client, initiate login, or mutate CMS state.

#### Scenario: Administrator copies read-only instructions
- **WHEN** an administrator opens enabled MCP setup without changing the permission choice and copies the Codex commands
- **THEN** the copied commands use the returned endpoint, DCR login, and read-only plus offline scopes, with success feedback only after clipboard success

#### Scenario: Administrator selects draft editing
- **WHEN** the permission choice changes to draft editing
- **THEN** both CLI and TOML examples include write and read scopes, explain the consent and role limits, and confer no authority merely by being shown

#### Scenario: Configured endpoint differs from browser location
- **WHEN** Settings is viewed through a development frontend or the deployment uses a non-default port
- **THEN** displayed and copied examples use the server-returned canonical endpoint and port rather than the browser origin or a hard-coded localhost value

#### Scenario: Clipboard access fails
- **WHEN** copying the endpoint or example fails
- **THEN** the UI announces failure and leaves the complete text available for manual selection without claiming success
