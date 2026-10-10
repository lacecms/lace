# admin-users-and-settings Specification

## Purpose

Defines the browser workflows administrators use to manage local accounts, inspect operational readiness, and issue or revoke narrowly scoped build credentials safely.

## Requirements

### Requirement: Administrator can manage users in the browser
The Users screen SHALL list users with email, role, and active or disabled
status, and SHALL mark the signed-in administrator's own row as "You". Role and
status SHALL be shown as labelled badges using the shared role vocabulary
(Admin, Editor, Viewer); raw user IDs SHALL never be shown. The screen SHALL
summarize how many accounts exist and how many are disabled.

An administrator SHALL create a user from a Create user dialog that collects
email, password (at least 12 characters, stated beside the field), and role;
the role picker SHALL describe what each role can do. Each active row SHALL
offer Change role, which opens a dialog preselecting the confirmed role and
submitting only a different role, and Disable, which opens a confirmation
dialog. Each disabled row SHALL offer Enable, which opens a confirmation
dialog, and SHALL offer no role change. The signed-in administrator's own row
SHALL offer no Disable action, and changing the administrator's own role away
from Admin SHALL warn in the dialog that they will lose access to Users and
Settings.

A mutation SHALL appear successful only after API confirmation: the dialog
closes, a notification names the affected account and change, and the list
refreshes from remote state. A failed mutation SHALL keep its dialog open,
show the error inside it, and leave the listed role and status at their last
confirmed values; a final-administrator rejection SHALL be explained as "The
final active administrator cannot be disabled or demoted." Cancelling a dialog
SHALL issue no request and return focus to the control that opened it.

#### Scenario: Administrator creates a user
- **WHEN** an administrator opens Create user and submits a valid email, password, and role
- **THEN** the screen submits the request, closes the dialog, announces the created account, and lists the new user after confirmation

#### Scenario: Create user fails
- **WHEN** the API rejects a Create user submission
- **THEN** the dialog stays open with the entered email and role, shows the error, and the list is unchanged

#### Scenario: Administrator changes a role
- **WHEN** an administrator opens Change role for an active user, picks a different role, and saves
- **THEN** the screen sends only the role change and shows the new role badge after confirmation

#### Scenario: Final administrator change is rejected
- **WHEN** the API rejects a role change or disable action that would remove the final active administrator
- **THEN** the dialog shows the final-administrator explanation and the row retains its previously confirmed role and active status

#### Scenario: Administrator disables and re-enables a user
- **WHEN** an administrator confirms Disable for another active user and later confirms Enable for that user
- **THEN** the screen sends `disabled: true` and then `disabled: false`, and the row shows Disabled and then Active after each confirmation

#### Scenario: Administrator views their own row
- **WHEN** the signed-in administrator's account is listed
- **THEN** the row is marked "You", offers Change role, and offers no Disable action

#### Scenario: Administrator demotes themselves
- **WHEN** the signed-in administrator picks a non-admin role for their own account in Change role
- **THEN** the dialog warns that they will lose access to Users and Settings before they save

#### Scenario: A dialog is cancelled
- **WHEN** an administrator cancels a Create user, Change role, Disable, or Enable dialog
- **THEN** no user request is sent and focus returns to the control that opened the dialog

#### Scenario: Users cannot be loaded
- **WHEN** the user-list request fails for a reason other than an expired session
- **THEN** the screen shows the error with a Try again action that repeats the request

#### Scenario: Editor opens Users directly
- **WHEN** an editor opens `/users`
- **THEN** the screen shows access denied and issues no user-list request

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
