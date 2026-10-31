## ADDED Requirements

### Requirement: Import credentials are short-lived, attributable and revocable
An actor with `settings:manage` SHALL be able to issue an import credential
with a name of 1 to 120 characters, a required lifetime of 1 to 7 whole days
and an optional publish permission. The credential SHALL be an opaque value of
32 cryptographically random bytes encoded as base64url, returned in plaintext
exactly once; the system SHALL persist only its SHA-256 verifier, a display
prefix, its capabilities, its creating user, its creation and expiry times and
its use and revocation times. Its capabilities SHALL be `content:import`, plus
`content:publish` only when publishing was requested and the creating actor
currently holds `content:publish`; a publish request by an actor without it
SHALL fail with the shared authorization denial and issue nothing. Verification
SHALL compare without secret-dependent timing and SHALL refuse a credential
that is unknown, revoked, expired at the request time or not an import
credential. Revocation SHALL be idempotent and SHALL keep the record listed as
revoked. Successful use SHALL record `last_used_at`, written at most once per
minute per credential. Issuance and revocation SHALL count against the
existing token-management limit of 20 per hour per administrator.

#### Scenario: Administrator issues a publishing import credential
- **WHEN** an administrator issues an import credential named `Framer` for 7 days with publishing
- **THEN** the response contains the plaintext once, the capabilities `content:import` and `content:publish`, the administrator as creator and an expiry 7 days after creation, and later listings contain only metadata and the prefix

#### Scenario: Lifetime outside the bounds is refused
- **WHEN** an administrator requests a lifetime of 0 or 8 days, or omits it
- **THEN** the request fails validation and no credential is stored

#### Scenario: Expired credential is presented
- **WHEN** a caller presents an import credential one millisecond after its expiry
- **THEN** authentication fails and `last_used_at` is unchanged

#### Scenario: Revoked credential is presented
- **WHEN** an administrator revokes an import credential and a caller then presents it
- **THEN** authentication fails, and revoking it again returns the same revoked record

### Requirement: Account security events revoke the creator's import credentials
Disabling a user, confirming a password reset for a user, an administrator
ending all of a user's sessions, and a password change that ends the user's
other sessions SHALL revoke every unrevoked import credential that user
created, in the same operation as the session changes. Re-enabling the user
SHALL NOT restore a revoked credential. An ordinary sign-out, a role change and
another user's events SHALL NOT revoke it. The behavior SHALL be identical on
Node and D1.

#### Scenario: Disabled creator
- **WHEN** an administrator disables a user who created two active import credentials
- **THEN** both are revoked with the disable, and they stay revoked after the user is re-enabled

#### Scenario: Ordinary sign-out keeps credentials
- **WHEN** the creator signs out of the browser
- **THEN** their import credentials still authenticate until expiry or revocation

### Requirement: Build export accepts only build credentials
Build export SHALL authenticate only an unrevoked credential whose
capabilities are exactly `content:build:read`. An import credential, an MCP
access token and a browser session SHALL NOT authenticate build export, and a
refused credential's `last_used_at` SHALL NOT advance. Listing, issuing and
revoking build credentials SHALL ignore import credentials, so the build-token
list and the active build-token count never include them.

#### Scenario: Import credential at build export
- **WHEN** a caller presents a valid import credential to the build export
- **THEN** the request is denied and the credential's `last_used_at` is unchanged

#### Scenario: Build-token routes ignore import credentials
- **WHEN** an administrator lists build credentials while an import credential exists, or revokes it through the build-credential route
- **THEN** the list omits it and the build-credential revocation returns not found
