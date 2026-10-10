## MODIFIED Requirements

### Requirement: Security administration contracts reveal secrets only once
The shared REST contracts SHALL validate setup-admin, user list/update,
invitation, password-reset and build-token lifecycle requests and responses.
They SHALL NOT define a request that creates a user with an administrator-chosen
password. A token-creation response SHALL contain the plaintext credential
exactly once; all later representations SHALL exclude it and contain only safe
token metadata. An invitation or administrator password-reset response SHALL
contain its link only when the delivery outcome is not `sent`, and invitation
listings SHALL never contain tokens or links. Rate-limit responses SHALL use the
shared error envelope with code `RATE_LIMITED` and a positive integer
`Retry-After` header.

#### Scenario: Token metadata is listed
- **WHEN** a client validates a build-token list or revocation response
- **THEN** the representation contains its identifier, name, prefix,
capabilities, lifecycle timestamps, and never the plaintext credential or its
stored verifier

#### Scenario: Sent invitation carries no link
- **WHEN** an invitation response reports delivery `sent` and includes a link
- **THEN** contract validation rejects the payload

## ADDED Requirements

### Requirement: Account lifecycle DTOs are closed and validated
The shared contracts SHALL define strict DTOs for:

- invitation create (`email`, `role`) and resend requests;
- invitation records (`id`, `email`, `role`, `invitedBy` display name,
  `createdAt`, `expiresAt`, `state` from `pending`, `expired`);
- the invitation issue result (the record, the delivery outcome, and an
  optional `link`);
- public invitation inspect (`token`) and accept (`token`, `password`, optional
  `displayName`) requests, and their results;
- password-reset request (`email`) and confirm (`token`, `password`) requests;
- the administrator reset result (delivery outcome and optional `link`);
- the account profile update (`displayName`) and password change
  (`currentPassword`, `newPassword`, `signOutOtherSessions`) requests;
- session records (`id`, `createdAt`, `lastActiveAt`, `browser`, `os`,
  `current`) and the revocation result (`revoked` count).

Tokens SHALL be 43-character base64url strings, passwords 12 to 1024
characters, and display names 1 to 120 characters. Session records SHALL never
contain a token or IP address. The generated OpenAPI document SHALL include
these DTOs.

#### Scenario: Session record carries a token
- **WHEN** a session payload includes a `token` field
- **THEN** contract validation rejects it

#### Scenario: Short password
- **WHEN** an accept or reset-confirm request carries an 11-character password
- **THEN** validation fails with a field-level issue
