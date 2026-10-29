# admin-users-and-settings Specification

## Purpose

Defines the browser workflows administrators use to manage local accounts, inspect operational readiness, and issue or revoke narrowly scoped build credentials safely.

## Requirements

### Requirement: Administrator manages users and invitations in the browser
The Users screen SHALL list users with email, role, and active or disabled
status, and SHALL mark the signed-in administrator's own row as "You". Role and
status SHALL be shown as labelled badges using the shared role vocabulary
(Admin, Editor, Viewer); raw user IDs SHALL never be shown. The screen SHALL
summarize how many accounts exist and how many are disabled.

An administrator SHALL add people from an Invite user dialog that collects
email and role; the role picker SHALL describe what each role can do. No admin
screen SHALL collect a password for another person. After the API confirms the
invitation, the dialog SHALL either announce that the invitation email was sent
or, when delivery was not `sent`, explain the closed reason and show the accept
link once with Copy, copy feedback and Done, stating that it cannot be shown
again; that link SHALL exist only in the dialog's transient state. A Pending
invitations list SHALL show each invitation's email, role, inviter, relative
expiry and state (Pending or Expired) with Resend and Revoke actions, the
latter behind a confirmation; Resend SHALL follow the same sent-or-link rules.

Each active row SHALL offer Change role, which opens a dialog preselecting the
confirmed role and submitting only a different role; Disable, which opens a
confirmation dialog stating that the user's sessions end; Send password reset,
which follows the sent-or-link rules; and Sign out everywhere, behind a
confirmation. Each disabled row SHALL offer Enable, which opens a confirmation
dialog, and SHALL offer no role change, reset or sign-out. The signed-in
administrator's own row SHALL offer no Disable, Send password reset or Sign out
everywhere action, and changing the administrator's own role away from Admin
SHALL warn in the dialog that they will lose access to Users and Settings.

A mutation SHALL appear successful only after API confirmation: the dialog
closes, a notification names the affected account and change, and the lists
refresh from remote state. A failed mutation SHALL keep its dialog open, show
the error inside it, and leave the listed role, status and invitations at their
last confirmed values; a final-administrator rejection SHALL be explained as
"The final active administrator cannot be disabled or demoted." Cancelling a
dialog SHALL issue no request and return focus to the control that opened it.

#### Scenario: Administrator invites a user with email delivery
- **WHEN** an administrator submits Invite user with a valid email and role and
  the provider accepts the email
- **THEN** the dialog closes, a notification says the invitation was sent, and
  the pending invitation is listed

#### Scenario: Administrator invites a user without email
- **WHEN** an administrator invites a user while email is not configured
- **THEN** the dialog shows the accept link once with Copy and explains that
  email is not configured, and the link is absent after Done

#### Scenario: Invitation conflicts
- **WHEN** the API rejects an invitation because the address already has an
  account or an active invitation
- **THEN** the dialog stays open with the entered email and role and shows the
  conflict

#### Scenario: Administrator changes a role
- **WHEN** an administrator opens Change role for an active user, picks a different role, and saves
- **THEN** the screen sends only the role change and shows the new role badge after confirmation

#### Scenario: Final administrator change is rejected
- **WHEN** the API rejects a role change or disable action that would remove the final active administrator
- **THEN** the dialog shows the final-administrator explanation and the row retains its previously confirmed role and active status

#### Scenario: Administrator disables and re-enables a user
- **WHEN** an administrator confirms Disable for another active user and later confirms Enable for that user
- **THEN** the screen sends `disabled: true` and then `disabled: false`, and the row shows Disabled and then Active after each confirmation

#### Scenario: Administrator sends a password reset
- **WHEN** an administrator confirms Send password reset for another active user
  and the provider accepts the email
- **THEN** a notification says the reset email was sent and no link is shown

#### Scenario: Administrator signs a user out everywhere
- **WHEN** an administrator confirms Sign out everywhere for another user
- **THEN** a notification names the user and the number of ended sessions

#### Scenario: Administrator views their own row
- **WHEN** the signed-in administrator's account is listed
- **THEN** the row is marked "You", offers Change role, and offers no Disable, Send password reset or Sign out everywhere action

#### Scenario: Administrator demotes themselves
- **WHEN** the signed-in administrator picks a non-admin role for their own account in Change role
- **THEN** the dialog warns that they will lose access to Users and Settings before they save

#### Scenario: A dialog is cancelled
- **WHEN** an administrator cancels an Invite user, Change role, Disable, Enable, Revoke, Send password reset or Sign out everywhere dialog
- **THEN** no request is sent and focus returns to the control that opened the dialog

#### Scenario: Users cannot be loaded
- **WHEN** the user-list request fails for a reason other than an expired session
- **THEN** the screen shows the error with a Try again action that repeats the request

#### Scenario: Editor opens Users directly
- **WHEN** an editor opens `/users`
- **THEN** the screen shows access denied and issues no user-list or invitation-list request

### Requirement: Administrator can inspect local settings and manage build tokens
The Settings screen SHALL show status cards for API readiness (Ready or Not
ready), the configured-model count, and the number of active build tokens,
with a Refresh status action that repeats the readiness request. It SHALL list
build-token metadata without plaintext credentials: name, token prefix,
created time, last-used time or "Never", and an Active or Revoked badge. Times
SHALL be shown relative to now with the absolute local time available on hover
and never as raw ISO timestamps.

An administrator SHALL create a build token from a dialog that collects its
name. After the API confirms creation, the same dialog SHALL show the plaintext
token once with a Copy action, copy feedback, and a Done action, and SHALL
state that the value cannot be shown again. Pointer interaction outside the
dialog SHALL not dismiss it while the plaintext is shown. The plaintext SHALL
exist only in that dialog's transient state and SHALL be cleared when the
dialog closes or Settings unmounts; it SHALL never enter the URL, a query
cache, or browser storage. Each active token SHALL offer Revoke, which opens a
confirmation dialog naming the token and its effect. Failed operations SHALL
keep their dialog open with the error and leave confirmed token metadata
unchanged.

#### Scenario: Token is issued
- **WHEN** an administrator creates a named build token
- **THEN** the dialog displays the token plaintext once with Copy and Done, and the metadata list refreshes to include the new active token

#### Scenario: Token is dismissed
- **WHEN** the administrator selects Done, presses Escape, or leaves Settings while the token is shown
- **THEN** the plaintext is removed from the browser component state and is absent from later token listings and dialog openings

#### Scenario: Token creation fails
- **WHEN** the API rejects build-token creation
- **THEN** the dialog stays on the name step with the error and no plaintext is shown

#### Scenario: Administrator revokes a token
- **WHEN** an administrator confirms Revoke for an active token
- **THEN** the token is revoked, a notification names it, and the list shows it as Revoked without a Revoke action

#### Scenario: Token revocation fails
- **WHEN** the API rejects revocation
- **THEN** the token remains listed according to confirmed API state and the confirmation dialog shows the failure

#### Scenario: Token times are shown
- **WHEN** a token was created two hours ago and never used
- **THEN** its row reads "2 hours ago" for Created with the absolute time on hover, and "Never" for Last used

#### Scenario: Viewer opens Settings directly
- **WHEN** a viewer opens `/settings`
- **THEN** the screen shows access denied and issues no settings or token request

### Requirement: Protected management requests recover expired sessions
User, status, and token requests SHALL use the same credentialed, validated admin transport and expired-session recovery as content requests.

#### Scenario: Session expires while loading users
- **WHEN** a user-list request establishes that the browser session is no longer valid
- **THEN** the admin clears protected state and sends the visitor to sign-in without showing stale users

### Requirement: Settings displays the running CMS release
Settings → Site status SHALL show a read-only card labelled "CMS version" using `engineVersion` from the validated authenticated status response. It SHALL preserve the full release string including prerelease suffixes, remain readable on narrow screens and use the existing UI tokens. It SHALL NOT substitute the Astro, generator, ownership-template, database migration or browser asset version. Refresh status SHALL refresh this value with the other status data. Initial loading SHALL use the existing loading pattern; unavailable data SHALL show an unavailable value with the existing retry/error behavior, never a guessed release or `0.0.0` fallback. A previously confirmed value retained after a refresh failure SHALL be identified as stale. Session expiry SHALL clear protected status through the existing recovery flow; editors/viewers SHALL retain their existing access-denied behavior.

#### Scenario: Administrator identifies a prerelease
- **WHEN** the API confirms `engineVersion` equal to `0.1.0-alpha.4`
- **THEN** the CMS version card displays `0.1.0-alpha.4` without shortening or substituting it

#### Scenario: Status cannot be loaded
- **WHEN** no confirmed status exists and the status request fails
- **THEN** no release number is invented and the administrator can retry through the existing error action

#### Scenario: Refresh fails after a successful read
- **WHEN** a refresh fails while a previously confirmed CMS version remains visible
- **THEN** the UI identifies that value as stale and offers retry

#### Scenario: Updated runtime is refreshed
- **WHEN** the administrator refreshes status after replacing the runtime with another release
- **THEN** the displayed version updates to the new server-confirmed value

#### Scenario: Session expires
- **WHEN** the status request establishes that the administrator session expired
- **THEN** protected status is cleared and the existing sign-in recovery runs

### Requirement: Settings shows email delivery and sends a self-addressed test email
Settings → Site status SHALL show a read-only "Email delivery" card from the
validated authenticated status response. The card SHALL name the configured
provider: "Not configured" for `none`, "Development log" for `log`, "SMTP",
"Resend", or "Cloudflare Email Service". For every provider other than `none`
it SHALL also show the sender address. It SHALL never show hosts, ports,
usernames, keys, or other provider settings. Refresh status SHALL refresh the
card with the other status data, and unavailable status SHALL reuse the existing
loading, error, retry, and stale-value behavior.

When a provider other than `none` is configured, the card SHALL offer **Send test
email**. The action SHALL send a fixed test message to the signed-in
administrator's own account address. The recipient SHALL never be entered or
chosen in the browser. While the request is pending the action SHALL be
disabled. On `sent` the admin SHALL announce that the provider accepted the
message for the administrator's address. On `failed` it SHALL show a
reason-specific explanation for `not_configured`, `invalid_message`,
`rejected`, `rate_limited` and `unavailable`, without provider error text. A
rate-limited request SHALL show the closed rate-limit message. The action SHALL
be unavailable to sessions without `settings:manage`, consistent with the
existing Settings access-denied behavior.

#### Scenario: Delivery is not configured
- **WHEN** an administrator opens Settings and the status reports provider `none`
- **THEN** the Email delivery card reads "Not configured" and offers no Send test
  email action

#### Scenario: Administrator sends a test email through SMTP
- **WHEN** an administrator with provider `smtp` selects Send test email and the
  provider accepts the message
- **THEN** a notification states that the test message was accepted for the
  administrator's own address

#### Scenario: Provider rejects the sender
- **WHEN** the test request returns `failed` with reason `rejected`
- **THEN** the card explains that the provider rejected the sender or recipient
  and suggests checking the sender domain, without showing provider error text

#### Scenario: Editor opens Settings
- **WHEN** an editor opens `/settings`
- **THEN** the screen shows access denied and issues no status or test-email
  request

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

### Requirement: MCP setup includes Claude Code and Gemini CLI recipes
The enabled Settings MCP section SHALL offer dedicated choices labelled **Claude Code** and **Gemini CLI**, alongside the existing Codex and generic setup choices. Each SHALL provide copyable client-native setup using the server-returned canonical endpoint and the existing selected content access. Read-only SHALL request `content:read` and `offline_access`; draft editing SHALL additionally request `content:write`. Changing clients SHALL preserve the selected access and SHALL NOT silently broaden it. Client installation/configuration scope SHALL NOT be presented as OAuth content permission.

Claude Code guidance SHALL include an HTTP server definition with explicitly constrained OAuth scopes and a supported way to install that definition, followed by sign-in through the client's MCP authentication flow. Gemini CLI guidance SHALL include a Streamable HTTP definition with explicit OAuth scopes in its settings file, followed by its interactive MCP authentication command. The UI SHALL distinguish terminal commands, configuration text, and commands typed inside a client session. It SHALL instruct users to merge/update the `lace` entry in existing configuration instead of replacing unrelated settings or blindly adding duplicates.

Both guides SHALL retain browser Lace sign-in, explicit consent, current-role limits, the publication/unpublication/deletion ban, and restart/reload guidance. They SHALL use supported discovery and public-client registration without embedded credentials, client secrets, Google service credentials, or manually entered bearer tokens. Opening a guide, changing access or copying text SHALL issue no client-registration/authentication/mutation request. Documentation-based recipes SHALL NOT be labelled as tested client connections without actual acceptance evidence.

Client choices SHALL remain reachable by keyboard and usable at 320px viewport width without horizontal page overflow. Existing disabled/unavailable/stale/session-recovery states and administrator-only Settings access SHALL remain unchanged.

#### Scenario: Claude Code read-only setup
- **WHEN** an administrator opens Claude Code instructions with the default access choice
- **THEN** the displayed/copied HTTP configuration uses the canonical endpoint and only read/offline scopes, with a correctly quoted setup command and instructions for browser authentication in Claude Code

#### Scenario: Gemini CLI draft setup
- **WHEN** an administrator selects draft editing and opens Gemini CLI instructions
- **THEN** its settings JSON includes the canonical HTTP endpoint and read/write/offline scopes, and the guide identifies the authentication command as an interactive Gemini CLI command

#### Scenario: Switching clients retains the permission choice
- **WHEN** an administrator switches among Codex, Claude Code and Gemini CLI after selecting read-only or draft access
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
