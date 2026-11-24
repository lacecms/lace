## MODIFIED Requirements

### Requirement: Build credentials remain narrowly scoped and revocable
The system SHALL issue an opaque randomly generated build credential with only
the `content:build:read` capability, display its plaintext value exactly once,
and persist only a non-reversible verifier, display prefix, metadata, and
lifecycle timestamps. It SHALL compare presented credentials without
secret-dependent timing, reject an expired-or-revoked credential, and update
`last_used_at` only after successful authorization for a build export or published-media thumbnail.
Browser sessions and credentials with any other capability SHALL not
authenticate either operation through this mechanism.

#### Scenario: Build credential is issued
- **WHEN** an authorized administrator creates a build credential
- **THEN** the response is the only time its plaintext value is returned and
  all later token listings expose only metadata and its display prefix

#### Scenario: Revoked credential is presented
- **WHEN** a caller presents a formerly valid credential after it is revoked
- **THEN** build export is denied and its `last_used_at` value is not advanced

#### Scenario: Valid credential reads an export
- **WHEN** a caller presents a valid active build credential to build export
- **THEN** the endpoint returns only published build data and records its use
