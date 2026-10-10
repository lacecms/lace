# account-invitations Specification

## Purpose

Lets administrators add people to a Lace installation by inviting an email
address with a role, so each invitee chooses their own password and no account
exists before the invitation is accepted.

## Requirements

### Requirement: Administrators invite an email address with a role
An actor with `users:manage` SHALL create an invitation from an email address
and a Lace role. The system SHALL normalize the address to lower case, SHALL
reject an address that already belongs to an account, and SHALL reject a second
invitation while an active (unaccepted, unrevoked, unexpired) invitation exists
for the same address. Each invitation SHALL carry a single-use token of 32
cryptographically random bytes, stored only as its SHA-256 digest, that expires
72 hours after issuance. Creating an invitation SHALL create no user, credential
account, or session.

#### Scenario: Administrator invites a new editor
- **WHEN** an administrator invites `new@example.com` as `editor`
- **THEN** an active invitation exists for that address and role, and no user
  record exists for it

#### Scenario: Address already has an account
- **WHEN** an administrator invites the address of an existing user
- **THEN** the request fails with a conflict and no invitation is stored

#### Scenario: Duplicate active invitation
- **WHEN** an active invitation exists for an address and another is requested
- **THEN** the request fails with a conflict and the existing invitation is
  unchanged

#### Scenario: Editor attempts to invite
- **WHEN** an actor without `users:manage` creates an invitation
- **THEN** the request is denied and nothing is stored

### Requirement: Invitation links are delivered by email or handed to the administrator once
Creating or resending an invitation SHALL send an invitation email containing
the site's public base URL, the role label, the expiry, and
an accept link of the form `<public base>/admin/accept-invite#token=<token>`.
The response SHALL report the closed delivery outcome. When the outcome is not
`sent`, the response SHALL also contain the accept link exactly once so the
administrator can deliver it another way; later representations SHALL never
contain the token or link. The token SHALL never appear in a URL path or query,
in logs, or in error responses.

#### Scenario: Email is delivered
- **WHEN** an invitation is created and the provider accepts the message
- **THEN** the response reports `sent` and contains no link

#### Scenario: Email is not configured
- **WHEN** an invitation is created while the email provider is `none`
- **THEN** the response reports `failed` with `not_configured` and contains the
  accept link once

#### Scenario: Invitations are listed
- **WHEN** an administrator lists invitations after creating one
- **THEN** the listed invitation shows its email, role, inviter, creation and
  expiry times and state, and contains no token or link

### Requirement: Invitees accept by choosing their own password
The public accept flow SHALL let a client inspect a token, receiving only the
invited email, role and expiry, and SHALL accept a token with a password of 12
to 1024 characters and an optional display name. Acceptance SHALL atomically
create the user with the invited role and an email/password credential, mark the
invitation accepted, and return the created account's email so the client can
sign in; it SHALL NOT itself create a session. An unknown, expired, revoked or
already accepted token SHALL fail with one indistinguishable invalid-invitation
outcome. If an account for the address was created after the invitation, the
acceptance SHALL fail with a conflict and create nothing.

#### Scenario: Invitee accepts
- **WHEN** a client accepts a valid token with a valid password
- **THEN** a user with the invited email and role exists, the invitation is
  accepted, and signing in with that email and password succeeds

#### Scenario: Token is reused
- **WHEN** a client accepts an already accepted token
- **THEN** the request fails with the invalid-invitation outcome and no second
  account is created

#### Scenario: Token has expired
- **WHEN** a client inspects or accepts a token more than 72 hours after issuance
- **THEN** both fail with the invalid-invitation outcome

### Requirement: Administrators resend and revoke invitations
An actor with `users:manage` SHALL resend an unaccepted, unrevoked invitation,
which SHALL replace its token, restart its 72-hour expiry, invalidate the
previous link, and follow the same delivery and link rules as creation. The
actor SHALL revoke an unaccepted invitation, after which its link SHALL be
invalid. Resending or revoking an accepted invitation SHALL fail without
changing it.

#### Scenario: Resent invitation invalidates the old link
- **WHEN** an administrator resends an invitation and the invitee opens the
  previous link
- **THEN** the previous link fails with the invalid-invitation outcome and the
  new link can be accepted

#### Scenario: Revoked invitation
- **WHEN** an administrator revokes an invitation and the invitee tries to accept
- **THEN** acceptance fails and no account is created

### Requirement: Invitation operations are rate limited
Invitation creation, resend and revocation SHALL be limited per administrator
to at most 20 requests per hour. Public inspection and acceptance SHALL count
against the per-client sensitive authentication limit. An exhausted limit SHALL
return the shared rate-limit envelope before any token lookup or email delivery.

#### Scenario: Acceptance attempts are exhausted
- **WHEN** a client exceeds the authentication limit while guessing tokens
- **THEN** further attempts return the rate-limit envelope without looking up
  any token
