# authentication-and-actor-boundary Specification

## Purpose

Defines secure browser-session authentication and its narrow conversion into
Lace actors, so every protected operation receives a validated identity and
role without duplicating authorization policy in HTTP handlers.

## Requirements

### Requirement: Email/password authentication is closed to public enrollment
The system SHALL provide email/password browser authentication at `/api/auth/*`
and SHALL reject public sign-up attempts. It SHALL create no user, account, or
session as a result of a rejected public sign-up. Session and credential
material SHALL be managed by the authentication provider and SHALL not be
included in Lace API logs or error responses.

#### Scenario: Public sign-up is attempted
- **WHEN** an unauthenticated client calls the provider's email sign-up route
- **THEN** the request is rejected and no new user, credential account, or
  authenticated session is created

#### Scenario: Existing user signs in
- **WHEN** a user with a valid email/password credential calls the provider's
  sign-in route from a trusted origin
- **THEN** the response establishes the provider session according to its
  cookie policy without exposing the credential verifier

### Requirement: A validated session supplies the complete application actor
The system SHALL resolve a protected request's actor only from a validated,
unexpired session whose user record contains a valid Lace role. It SHALL map
the persisted user identifier and role to the application actor and SHALL deny
the protected request when the session is absent, invalid, expired, or joined
to an invalid role. A newly created provider user SHALL receive the `viewer`
role unless an authorized future workflow changes it.

#### Scenario: Session resolves as viewer
- **WHEN** a valid authenticated session belongs to a user persisted with the
  `viewer` role
- **THEN** a protected use case receives an actor with that user identifier and
  the `viewer` role

#### Scenario: Invalid session or role is presented
- **WHEN** a protected request has no valid session or its resolved user role is
  absent or outside `admin`, `editor`, and `viewer`
- **THEN** the request is denied before application content work runs

### Requirement: Same-origin browser session protections are explicit
The authentication boundary SHALL use the configured canonical public origin as
its trusted origin and SHALL reject untrusted browser origins for
cookie-authenticated mutations. In local development only, when that origin
uses `localhost` or `127.0.0.1`, the boundary SHALL also trust the other
loopback hostname with the same scheme and port. It SHALL retain CSRF and
origin protection, use same-origin session cookies, and mark session cookies
`Secure` in production. It SHALL not disable the provider's CSRF or origin
checks or extend loopback aliases to production or non-loopback origins.

#### Scenario: Cross-origin browser mutation is attempted
- **WHEN** a browser-originated authentication mutation names an origin outside
  the configured trusted origin set
- **THEN** the request is rejected before it can create or alter authentication
  state

#### Scenario: Production session is created
- **WHEN** production configuration establishes an authentication session
- **THEN** its session cookie is marked `Secure` and remains scoped to the
  configured same-origin deployment

#### Scenario: Local admin uses the alternate loopback hostname
- **WHEN** local development is configured for `127.0.0.1` and a valid user
  signs in through `localhost` on the same scheme and port, or vice versa
- **THEN** the provider accepts the request and establishes a browser session

#### Scenario: A production or remote origin uses a loopback alias
- **WHEN** a production deployment or a non-loopback development deployment
  receives an authentication mutation from an unconfigured loopback hostname
- **THEN** the provider rejects the origin

### Requirement: Disabled accounts fail closed at actor resolution
The authentication boundary SHALL refuse to resolve an actor from a valid
provider session when its persisted user account has been disabled. It SHALL
not disclose the disabled state through a session or actor response.

#### Scenario: Disabled user presents a valid session
- **WHEN** a session belonging to a disabled user reaches a protected route
- **THEN** actor resolution fails and the route returns the standard
authorization denial before application work runs

### Requirement: The authenticated session summary exposes server-derived permissions
The system SHALL provide an authenticated session summary for the signed-in
browser user containing the user identifier, email, an optional display name,
the Lace role, and the complete permission list that the installation's domain
role policy grants to that role. The permission list SHALL be computed on the
server from the same policy that authorizes application use cases and SHALL
NOT be accepted from or stored by the client. The summary SHALL be resolved
through the same actor boundary as other protected requests, so an absent,
expired, disabled, or invalid-role session SHALL receive the unauthenticated
response and no summary. The summary SHALL contain no session token, credential
material, or provider-internal fields.

#### Scenario: Editor reads the session summary
- **WHEN** a valid session belonging to an `editor` requests the session summary
- **THEN** the response contains that user's identifier, email and role
  `editor`, and exactly the permissions `content:read`, `content:write`, and
  `media:write`

#### Scenario: Disabled user reads the session summary
- **WHEN** a session belonging to a disabled user requests the session summary
- **THEN** the response is the unauthenticated error and contains no user data

#### Scenario: Role policy changes
- **WHEN** the domain role policy grants an additional permission to a role
- **THEN** the session summary for that role includes the new permission, and
  protected use cases and the summary agree on the grant
