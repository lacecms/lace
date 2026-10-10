# account-self-service Specification

## Purpose

Lets every signed-in user maintain their own account (display name, password
and sessions) and lets administrators end another user's sessions, with the
same behavior on Node and Cloudflare.

## Requirements

### Requirement: Users change their own display name
Any authenticated actor SHALL change their own display name to 1 to 120
characters after trimming; control characters SHALL be rejected. The new name
SHALL appear in the session summary and in editor attributions that read the
account name. No actor SHALL change another user's name through this flow.

#### Scenario: Editor renames themselves
- **WHEN** an editor sets their display name to `Ada Lovelace`
- **THEN** their session summary's display name is `Ada Lovelace`

#### Scenario: Empty name
- **WHEN** a user submits a display name containing only spaces
- **THEN** the request fails validation and the name is unchanged

### Requirement: Users change their own password with the current password
Any authenticated actor SHALL change their password by supplying the current
password and a new password of 12 to 1024 characters. A wrong current password
SHALL fail with an invalid-credentials outcome and count against the per-actor
sensitive authentication limit. On success the credential SHALL be replaced and,
when requested, every other session of the actor SHALL be deleted while the
current session remains valid. When email delivery is configured, a
password-changed notice SHALL be sent to the account address without delaying
the response.

#### Scenario: Password change signs out other devices
- **WHEN** a user with two sessions changes their password and asks to sign out
  other sessions
- **THEN** the current session remains valid and the other session is rejected

#### Scenario: Wrong current password
- **WHEN** a user submits an incorrect current password
- **THEN** the request fails with the invalid-credentials outcome and the
  password is unchanged

### Requirement: Users list and end their own sessions
Any authenticated actor SHALL list their own unexpired sessions with an opaque
session identifier, creation time, last-refresh time, a browser and operating
system summary derived from the stored user agent, and whether the session is
the one making the request. The listing SHALL NOT expose session tokens or IP
addresses. The actor SHALL delete any of their other sessions by identifier and
SHALL delete all their other sessions at once; deleting the current session
through these operations SHALL be refused in favor of sign-out. Identifiers of
another user's sessions SHALL behave as not found.

#### Scenario: User ends a session on another device
- **WHEN** a user deletes another of their sessions by identifier
- **THEN** that session is rejected on its next request and the current one
  remains valid

#### Scenario: Sign out everywhere else
- **WHEN** a user signs out all other sessions
- **THEN** only the current session remains listed

#### Scenario: Foreign session identifier
- **WHEN** a user deletes a session identifier belonging to another user
- **THEN** the response is not found and that session remains valid

### Requirement: Administrators sign users out and disabling ends sessions
An actor with `users:manage` SHALL delete every session of another user. When
an administrator disables an account, the system SHALL delete that account's
sessions in the same operation. Sessions SHALL also remain rejected at actor
resolution for disabled accounts.

#### Scenario: Administrator signs a user out everywhere
- **WHEN** an administrator signs out an editor everywhere
- **THEN** all of the editor's sessions are rejected and the editor can sign in
  again

#### Scenario: Disabled account has no sessions
- **WHEN** an administrator disables a user with active sessions
- **THEN** the user's sessions no longer exist
