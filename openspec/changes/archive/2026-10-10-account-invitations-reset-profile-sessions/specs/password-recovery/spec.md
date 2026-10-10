## Purpose

Lets users who forget their password regain access through a short-lived
emailed link, and lets administrators send such a link, without revealing
which email addresses have accounts.

## ADDED Requirements

### Requirement: Reset requests never reveal account existence
The public reset-request flow SHALL accept an email address and SHALL always
return the same accepted response, body and status, whether the address belongs
to an enabled account, a disabled account, or no account. For an enabled
account it SHALL issue a reset token and send a reset email containing a link of
the form `<public base>/admin/reset-password#token=<token>`; for any other
address it SHALL send nothing. Email delivery SHALL NOT delay the response.
Requests SHALL be limited per client and per normalized email address, at most
3 per hour per address, and an exhausted limit SHALL return the shared
rate-limit envelope.

#### Scenario: Unknown address
- **WHEN** a client requests a reset for an address without an account
- **THEN** the response equals the response for an existing account and no
  email is sent

#### Scenario: Disabled account
- **WHEN** a client requests a reset for a disabled account
- **THEN** the response is the uniform accepted response and no token or email
  is created

#### Scenario: Repeated requests for one address
- **WHEN** a fourth reset is requested for one address within an hour
- **THEN** the response is the rate-limit envelope and no email is sent

### Requirement: Reset tokens are short-lived, single-use and superseded
A reset token SHALL contain 32 cryptographically random bytes, be stored only
as its SHA-256 digest, expire one hour after issuance, and be consumed by its
first successful use. Issuing a new token for an account SHALL invalidate that
account's earlier unconsumed tokens. Confirming a token with a new password of
12 to 1024 characters SHALL replace the credential, consume the token, and
delete every session of the account. An unknown, expired, consumed or
superseded token, or a token of an account disabled after issuance, SHALL fail
with one indistinguishable invalid-reset outcome and change nothing.

#### Scenario: User resets their password
- **WHEN** a client confirms a valid token with a valid new password
- **THEN** signing in with the new password succeeds, the old password fails,
  and every previously existing session of that account is rejected

#### Scenario: Older link after a newer request
- **WHEN** a user requests two resets and opens the first link
- **THEN** confirmation fails with the invalid-reset outcome

#### Scenario: Expired link
- **WHEN** a token is confirmed more than one hour after issuance
- **THEN** confirmation fails and the password is unchanged

### Requirement: Administrators can send a password reset
An actor with `users:manage` SHALL issue a reset for an enabled user. The
response SHALL report the closed delivery outcome and, when it is not `sent`,
SHALL contain the reset link exactly once. Issuing a reset for a disabled or
unknown user SHALL fail without creating a token. Administrator resets SHALL
share the per-administrator invitation limit.

#### Scenario: Reset without email
- **WHEN** an administrator issues a reset for a user while the email provider
  is `none`
- **THEN** the response reports `not_configured` and contains the reset link once

#### Scenario: Viewer attempts an administrator reset
- **WHEN** an actor without `users:manage` issues a reset for another user
- **THEN** the request is denied and no token exists
