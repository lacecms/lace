## MODIFIED Requirements

### Requirement: Account routes keep their actor, token and rate-limit boundaries
The HTTP application SHALL expose these routes on both runtimes with identical
responses.

- **Public, without a session**
  - `POST /api/v1/invitations/inspect` and `POST /api/v1/invitations/accept`.
  - `POST /api/v1/password-reset/request`, which always returns `202` with an
    empty accepted body and schedules delivery without awaiting it.
  - `POST /api/v1/password-reset/confirm`, which returns `204`.
- **Any authenticated actor**
  - `PATCH /api/v1/account` and `POST /api/v1/account/password`.
  - `GET /api/v1/account/sessions` and `DELETE /api/v1/account/sessions/:sessionId`.
  - `POST /api/v1/account/sessions/revoke-others`.
- **Requiring `users:manage` through the use cases**
  - `POST /api/v1/admin/users` with a browser session.
  - `GET` and `POST /api/v1/admin/invitations`.
  - `POST /api/v1/admin/invitations/:invitationId/resend` and
    `DELETE /api/v1/admin/invitations/:invitationId`.
  - `POST /api/v1/admin/users/:userId/password-reset` and
    `POST /api/v1/admin/users/:userId/sessions/revoke`.

The direct creation route SHALL enforce the shared origin and credential
policy for session mutations. It SHALL return `201` with the shared creation
result and `Cache-Control: no-store`, the shared `422 VALIDATION_FAILED` envelope for
invalid requests, and `409 CONFLICT` for an address already used by an account
or a pending invitation. It SHALL share the existing per-administrator
invitation and administrative reset budget of at most 20 requests per hour.
An exhausted budget SHALL return `429 RATE_LIMITED` with `Retry-After` before
creation work or email delivery.

The HTTP application SHALL accept invitation and reset tokens only in JSON
bodies and SHALL omit them from paths, queries and request logs. Invalid
invitation and reset tokens SHALL return a single `410` invalid envelope
without distinguishing unknown, expired, consumed or revoked tokens.
Rate-limit checks SHALL run before token lookups and email delivery.

#### Scenario: Removed creation route
- **WHEN** an administrator posts an email, password and role to
  `/api/v1/admin/users`
- **THEN** the response is `422 VALIDATION_FAILED` because the restored route rejects the removed password-bearing request shape, and no user is created

#### Scenario: Direct creation requires session authority
- **WHEN** a caller without a session, an editor, a viewer, a bearer-token client or a request with an untrusted origin attempts direct creation
- **THEN** the route returns the existing authentication or authorization denial without creating an account or sending email

#### Scenario: The shared account-management budget is exhausted
- **WHEN** an administrator exhausts the existing budget through invitation or admin reset operations and then attempts direct creation
- **THEN** the route returns `429` with `Retry-After` and creates nothing

#### Scenario: Anonymous account request
- **WHEN** a request without a session calls `GET /api/v1/account/sessions`
- **THEN** the response is the unauthenticated envelope

#### Scenario: Reset request response is immediate
- **WHEN** a reset is requested for an existing account and the email provider
  is slow
- **THEN** the `202` response is returned without waiting for delivery
