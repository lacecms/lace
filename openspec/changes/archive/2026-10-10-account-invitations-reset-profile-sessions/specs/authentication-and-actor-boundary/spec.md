## MODIFIED Requirements

### Requirement: Email/password authentication is closed to public enrollment
The system SHALL provide email/password browser authentication at `/api/auth/*`
and SHALL reject public sign-up attempts. It SHALL create no user, account, or
session as a result of a rejected public sign-up. Only the provider's email
sign-in, sign-out and get-session routes SHALL be reachable; every other
`/api/auth/*` path, including provider sign-up, password-change, password-reset,
user-update and session-listing routes, SHALL return `404` without reaching the
provider, so account changes happen only through Lace routes. Session and
credential material SHALL be managed by the authentication provider and SHALL
not be included in Lace API logs or error responses.

#### Scenario: Public sign-up is attempted
- **WHEN** an unauthenticated client calls the provider's email sign-up route
- **THEN** the request is rejected and no new user, credential account, or
  authenticated session is created

#### Scenario: Existing user signs in
- **WHEN** a user with a valid email/password credential calls the provider's
  sign-in route from a trusted origin
- **THEN** the response establishes the provider session according to its
  cookie policy without exposing the credential verifier

#### Scenario: Provider account route is called directly
- **WHEN** a signed-in client calls the provider's change-password or
  list-sessions route
- **THEN** the response is `404` and neither the credential nor any session
  token is exposed or changed

#### Scenario: First administrator setup is unchanged
- **WHEN** setup is incomplete and a client submits the one-time setup token,
  email and password to the setup route
- **THEN** the first administrator is created exactly as before and can sign in

### Requirement: Disabled accounts fail closed at actor resolution
The authentication boundary SHALL refuse to resolve an actor from a valid
provider session when its persisted user account has been disabled. It SHALL
not disclose the disabled state through a session or actor response. Disabling
an account SHALL additionally delete its sessions, so the refusal also holds
if the account is later re-enabled.

#### Scenario: Disabled user presents a valid session
- **WHEN** a session belonging to a disabled user reaches a protected route
- **THEN** actor resolution fails and the route returns the standard
authorization denial before application work runs

#### Scenario: Re-enabled account does not revive old sessions
- **WHEN** an administrator disables and then re-enables a user
- **THEN** sessions created before the disable remain rejected and the user
  must sign in again

## ADDED Requirements

### Requirement: Protected requests can identify their current session
The authentication boundary SHALL expose, for a protected request, the opaque
identifier of the provider session that authenticated it, without exposing the
session token. Session-listing and session-revocation use cases SHALL use this
identifier to mark and protect the current session.

#### Scenario: Current session is marked
- **WHEN** a user lists their sessions from one browser
- **THEN** exactly the session authenticating that request is marked current
