## ADDED Requirements

### Requirement: Account routes keep their actor, token and rate-limit boundaries
The HTTP application SHALL expose these routes on both runtimes with identical
responses:

- **Public, without a session:**
  - `POST /api/v1/invitations/inspect` and `POST /api/v1/invitations/accept`;
  - `POST /api/v1/password-reset/request`, which always returns `202` with an
    empty accepted body and schedules delivery without awaiting it;
  - `POST /api/v1/password-reset/confirm`, which returns `204`.
- **Any authenticated actor:**
  - `PATCH /api/v1/account` and `POST /api/v1/account/password`;
  - `GET /api/v1/account/sessions` and `DELETE /api/v1/account/sessions/:sessionId`;
  - `POST /api/v1/account/sessions/revoke-others`.
- **Requiring `users:manage` through the use cases:**
  - `GET` and `POST /api/v1/admin/invitations`;
  - `POST /api/v1/admin/invitations/:invitationId/resend` and
    `DELETE /api/v1/admin/invitations/:invitationId`;
  - `POST /api/v1/admin/users/:userId/password-reset` and
    `POST /api/v1/admin/users/:userId/sessions/revoke`.

`POST /api/v1/admin/users` SHALL no longer exist. Tokens SHALL be accepted only
in JSON bodies, never in paths or queries, and request logs SHALL contain no
token. Invalid invitation and reset tokens SHALL return a single `410` invalid
envelope without distinguishing unknown, expired, consumed or revoked tokens.
Rate-limit checks SHALL run before token lookups and email delivery.

#### Scenario: Removed creation route
- **WHEN** an administrator posts an email, password and role to
  `/api/v1/admin/users`
- **THEN** the response is `404` and no user is created

#### Scenario: Anonymous account request
- **WHEN** a request without a session calls `GET /api/v1/account/sessions`
- **THEN** the response is the unauthenticated envelope

#### Scenario: Reset request response is immediate
- **WHEN** a reset is requested for an existing account and the email provider
  is slow
- **THEN** the `202` response is returned without waiting for delivery
