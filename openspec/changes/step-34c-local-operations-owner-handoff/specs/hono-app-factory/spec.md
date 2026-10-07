## MODIFIED Requirements

### Requirement: Administrator can read a small operational status
The server SHALL expose `GET /api/v1/admin/settings/status` to an authorized administrator. Its validated response SHALL report readiness, the number of configured content models, and `engineVersion`, the complete running CMS release supplied by the runtime composition. It SHALL reveal no connection string, credential, or private configuration value. An editor or viewer SHALL receive the standard authorization denial. Build credentials and anonymous callers SHALL NOT gain access to this response. Existing readiness semantics SHALL remain unchanged; the version SHALL NOT imply successful publication or deployment.

#### Scenario: Administrator reads status
- **WHEN** an authenticated administrator requests settings status
- **THEN** the response reports current readiness, configured-model count and the complete running CMS release, including its prerelease suffix

#### Scenario: Editor requests status
- **WHEN** an authenticated editor requests settings status
- **THEN** the response denies access without returning operational status

#### Scenario: Non-administrator credentials request status
- **WHEN** a viewer, anonymous caller or build credential requests settings status
- **THEN** the standard authorization boundary rejects the request without returning operational status
