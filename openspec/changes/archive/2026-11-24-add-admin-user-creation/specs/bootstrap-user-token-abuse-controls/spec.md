## ADDED Requirements

### Requirement: Administrators can create an active account before first sign-in
The system SHALL let an authorized administrator create an enabled account with
a required email address and a selected role of `admin`, `editor` or `viewer`.
It SHALL trim and lowercase the address, validate it using the shared account
email rules, and reject a conflict with an existing account, including a
disabled account, or an unaccepted, unrevoked and unexpired invitation for
that normalized address. Creation SHALL leave existing invitations unchanged.

On Node and Cloudflare, the system SHALL atomically store the enabled user,
the credential record awaiting its first password, and an initial password-reset
token verifier attributed to the acting administrator. Creation SHALL issue no
session and establish no mailbox verification. The user SHALL appear as
Active immediately. Password sign-in SHALL require the user to set their own
password through the existing password-reset confirmation flow. The initial
link SHALL follow the existing reset lifecycle, including the one-hour expiry,
single use and supersession by a newer reset. An administrator SHALL be able to
issue a fresh link with **Send password reset**.

#### Scenario: An administrator creates an account before the recipient acts
- **WHEN** an authorized administrator creates `New@Example.com` as an editor
- **THEN** Users lists one enabled editor at `new@example.com` before any link is opened, no session exists for the new user, and password sign-in succeeds only after the recipient sets a password

#### Scenario: An account or an unexpired invitation owns the address
- **WHEN** direct creation is requested for an address used by an active or disabled account or an unexpired pending invitation
- **THEN** the request returns a conflict and creates no new account, credential, reset token or email

#### Scenario: An invitation has expired or was revoked
- **WHEN** direct creation is requested for an address with only expired or revoked invitations and no account
- **THEN** creation succeeds and the old tokens stay unusable

#### Scenario: Creation races a competing account operation
- **WHEN** two direct creates or a direct create and an invitation create, resend or acceptance compete for the same normalized address
- **THEN** no execution leaves a directly created account and a competing active invitation, at most one account and one credential exist, and a refused direct create sends no email

#### Scenario: A write fails during creation
- **WHEN** storing the credential or token verifier fails
- **THEN** account creation rolls back and no access email is attempted

#### Scenario: The first link expires or is replaced
- **WHEN** the first link expires, or an administrator issues a newer reset for the enabled account
- **THEN** the old link fails through the existing invalid-reset outcome, the account remains enabled, and the recipient can set their password through a valid replacement link

### Requirement: Direct creation hands off first access through the configured email provider
After the account write commits, the system SHALL use the existing email
capability to send the new user an access notification containing the
installation URL, role, first-password link and expiry. The system SHALL
derive the link from the configured public base URL and place the token in
the fragment of `/admin/reset-password`. The creation result SHALL report
the closed delivery outcome. If no provider is configured or delivery fails,
it SHALL disclose the private first-password link once to the acting
administrator. A `sent` result SHALL omit the link. Delivery outcomes SHALL
leave the account enabled. Later reads, logs and error responses SHALL omit
the link and all credential material.

#### Scenario: The configured provider accepts the email
- **WHEN** a user is created and the configured provider accepts the access notification
- **THEN** the email contains the first-password link and the successful creation response reports `sent` with no link

#### Scenario: Delivery is absent or unavailable
- **WHEN** a user is created with provider `none` or the provider rejects, times out or fails
- **THEN** creation succeeds, reports the corresponding closed failure reason and returns a first-password link that the administrator can pass privately to the user

## MODIFIED Requirements

### Requirement: Administrators manage users without removing the final administrator
The system SHALL allow only an actor with `users:manage` to list users, create
a user with a selected valid role, disable a user, or change a user's role.
Disabled users SHALL not resolve to authenticated actors. The system SHALL
reject a disable or demotion that would remove the last enabled `admin` with
an established sign-in password, including concurrent competing requests, and
SHALL leave the protected administrator active with its role unchanged.

#### Scenario: An administrator changes a user role
- **WHEN** an authenticated administrator requests a valid role change for an
  active user and another enabled administrator with a password remains if needed
- **THEN** the user record has the requested valid role and subsequent sessions
  resolve with that role

#### Scenario: Final administrator is protected
- **WHEN** a request would disable or demote the only enabled administrator
  who has set a password
- **THEN** the request is rejected and that user remains active with the
  `admin` role

#### Scenario: A newly created administrator still needs a password
- **WHEN** the only administrator who can sign in attempts to disable or demote
  their own account while every other enabled administrator awaits a first password
- **THEN** the mutation fails with `LAST_ADMIN_PROTECTED`, and the other administrator can satisfy the guard after setting their password

#### Scenario: A non-administrator manages users
- **WHEN** an authenticated editor or viewer requests user list or mutation
- **THEN** the request receives the standard authorization denial and performs
  no user read or mutation
