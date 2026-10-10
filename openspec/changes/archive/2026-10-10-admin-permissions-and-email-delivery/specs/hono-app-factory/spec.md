## ADDED Requirements

### Requirement: Session-summary and email-test routes keep the actor boundary
`GET /api/v1/admin/session` SHALL resolve the actor through the protected
actor boundary, SHALL return the validated session summary for any
authenticated Lace role, and SHALL return the sanitized unauthenticated
envelope without a valid session. `POST /api/v1/admin/settings/email-test`
SHALL accept no request body fields. It SHALL require `settings:manage`
through the application use case, address the message only to the acting
user's persisted email, and return the validated email-test result with
status `200` for both `sent` and `failed` outcomes. It SHALL apply a portable
per-actor rate limit of at most 5 requests per hour, after which it SHALL return
the sanitized rate-limit envelope without contacting the provider.
`GET /api/v1/admin/settings/status` SHALL include the email status computed
from the composed provider without contacting it. Settings status, build-token
routes and build request/retry SHALL authorize `settings:manage`, the same
permission that gates the admin Settings and build actions. Both runtimes SHALL
expose identical routes and responses.

#### Scenario: Viewer requests a test email
- **WHEN** a viewer calls `POST /api/v1/admin/settings/email-test`
- **THEN** the response is the authorization-denied envelope and no message is
  sent

#### Scenario: Request names another recipient
- **WHEN** an administrator calls the email-test route with a body naming a
  recipient
- **THEN** the request is rejected by validation and no message is sent

#### Scenario: Test emails exceed the limit
- **WHEN** an administrator sends a sixth test email within one hour
- **THEN** the response is the rate-limit envelope and the provider is not
  contacted

#### Scenario: Editor requests settings administration
- **WHEN** an editor, who lacks `settings:manage`, requests settings status or
  creates a build token
- **THEN** each request receives the authorization-denied envelope

#### Scenario: Anonymous visitor requests the session summary
- **WHEN** a request without a session calls `GET /api/v1/admin/session`
- **THEN** the response is the unauthenticated envelope
