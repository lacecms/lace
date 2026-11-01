## MODIFIED Requirements

### Requirement: MCP connection instructions are copyable and permission-aware
Enabled MCP setup SHALL provide copyable Codex CLI commands to add the canonical endpoint and authorize through public-client DCR. A permission choice SHALL default to read-only (`content:read,offline_access`); choosing draft editing SHALL use `content:read,content:write,offline_access`; choosing publishing SHALL use `content:read,content:write,content:publish,offline_access`. An alternative Codex TOML example SHALL describe the same endpoint and selected scopes and SHALL explain that configuration still requires OAuth login. Generic client guidance SHALL identify Streamable HTTP, OAuth authorization code with PKCE, and dynamic client registration, without implying that arbitrary clients are verified.

Examples SHALL use the exact canonical endpoint and syntactically safe quoting for the target shell/TOML format. Copy SHALL copy the displayed text with accessible feedback; a denied clipboard write SHALL report failure and retain manually selectable text. Instructions SHALL explain browser sign-in and explicit consent, that viewers cannot grant write access, that only administrators can grant publishing, that published content reaches the site with the next build, that unpublishing/deletion are unavailable, and that a client may need restart/reload to pick up configuration. They SHALL NOT contain passwords, cookies, build tokens, or generated OAuth credentials. Rendering or copying SHALL NOT register a client, initiate login, or mutate CMS state.

#### Scenario: Administrator copies read-only instructions
- **WHEN** an administrator opens enabled MCP setup without changing the permission choice and copies the Codex commands
- **THEN** the copied commands use the returned endpoint, DCR login, and read-only plus offline scopes, with success feedback only after clipboard success

#### Scenario: Administrator selects draft editing
- **WHEN** the permission choice changes to draft editing
- **THEN** both CLI and TOML examples include write and read scopes, explain the consent and role limits, and confer no authority merely by being shown

#### Scenario: Administrator selects publishing
- **WHEN** the permission choice changes to publishing
- **THEN** both CLI and TOML examples include read, write, publish and offline scopes, state the administrator-only consent and the unpublish/delete ban, and confer no authority merely by being shown

#### Scenario: Configured endpoint differs from browser location
- **WHEN** Settings is viewed through a development frontend or the deployment uses a non-default port
- **THEN** displayed and copied examples use the server-returned canonical endpoint and port rather than the browser origin or a hard-coded localhost value

#### Scenario: Clipboard access fails
- **WHEN** copying the endpoint or example fails
- **THEN** the UI announces failure and leaves the complete text available for manual selection without claiming success

### Requirement: MCP setup includes Claude Code and Gemini CLI recipes
The enabled Settings MCP section SHALL offer dedicated choices labelled **Claude Code** and **Gemini CLI**, alongside the existing Codex and generic setup choices. Each SHALL provide copyable client-native setup using the server-returned canonical endpoint and the existing selected content access. Read-only SHALL request `content:read` and `offline_access`; draft editing SHALL additionally request `content:write`; publishing SHALL additionally request `content:write` and `content:publish`. Changing clients SHALL preserve the selected access and SHALL NOT silently broaden it. Client installation/configuration scope SHALL NOT be presented as OAuth content permission.

Claude Code guidance SHALL include an HTTP server definition with explicitly constrained OAuth scopes and a supported way to install that definition, followed by sign-in through the client's MCP authentication flow. Gemini CLI guidance SHALL include a Streamable HTTP definition with explicit OAuth scopes in its settings file, followed by its interactive MCP authentication command. The UI SHALL distinguish terminal commands, configuration text, and commands typed inside a client session. It SHALL instruct users to merge/update the `lace` entry in existing configuration instead of replacing unrelated settings or blindly adding duplicates.

Both guides SHALL retain browser Lace sign-in, explicit consent, current-role limits, the administrator-only publishing consent, the unpublication/deletion ban, and restart/reload guidance. They SHALL use supported discovery and public-client registration without embedded credentials, client secrets, Google service credentials, or manually entered bearer tokens. Opening a guide, changing access or copying text SHALL issue no client-registration/authentication/mutation request. Documentation-based recipes SHALL NOT be labelled as tested client connections without actual acceptance evidence.

Client choices SHALL remain reachable by keyboard and usable at 320px viewport width without horizontal page overflow. Existing disabled/unavailable/stale/session-recovery states and administrator-only Settings access SHALL remain unchanged.

#### Scenario: Claude Code read-only setup
- **WHEN** an administrator opens Claude Code instructions with the default access choice
- **THEN** the displayed/copied HTTP configuration uses the canonical endpoint and only read/offline scopes, with a correctly quoted setup command and instructions for browser authentication in Claude Code

#### Scenario: Gemini CLI draft setup
- **WHEN** an administrator selects draft editing and opens Gemini CLI instructions
- **THEN** its settings JSON includes the canonical HTTP endpoint and read/write/offline scopes, and the guide identifies the authentication command as an interactive Gemini CLI command

#### Scenario: Switching clients retains the permission choice
- **WHEN** an administrator switches among Codex, Claude Code and Gemini CLI after selecting read-only, draft or publishing access
- **THEN** every recipe reflects that same access and no network operation or grant change occurs

#### Scenario: Copy succeeds or fails
- **WHEN** the administrator copies a new client configuration or command
- **THEN** the clipboard receives exactly the displayed text on success, or accessible failure feedback leaves manually selectable text without reporting success

#### Scenario: Existing client configuration and unusual endpoint
- **WHEN** the installation uses a non-default port or an endpoint requiring shell/JSON escaping and the client already has settings
- **THEN** the examples preserve the exact server endpoint safely and instruct updating/merging the `lace` entry without deleting other configuration

#### Scenario: Narrow screen and keyboard navigation
- **WHEN** the MCP section is used at 320px width or solely by keyboard
- **THEN** all client choices and copy controls remain reachable, examples remain readable, and the page does not overflow horizontally
