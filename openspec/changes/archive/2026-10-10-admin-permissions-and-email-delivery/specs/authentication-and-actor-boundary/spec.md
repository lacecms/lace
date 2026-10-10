## ADDED Requirements

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
