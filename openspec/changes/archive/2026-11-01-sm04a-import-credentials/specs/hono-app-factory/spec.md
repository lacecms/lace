## ADDED Requirements

### Requirement: Import credentials reach only a fixed admin route allowlist
The HTTP application SHALL accept an import credential only on these method and
path pairs, matched literally after routing:

- `GET /api/v1/admin/content-models`
- `GET /api/v1/admin/models/:modelKey/entries`
- `POST /api/v1/admin/models/:modelKey/entries`
- `GET /api/v1/admin/entries/:entryId`
- `PUT /api/v1/admin/entries/:entryId/draft`
- `POST /api/v1/admin/entries/:entryId/publish`
- `GET /api/v1/admin/media`
- `POST /api/v1/admin/media`
- `GET /api/v1/admin/media/:mediaId`
- `PATCH /api/v1/admin/media/:mediaId`
- `GET /api/v1/admin/import-credential`

Every other route below `/api/v1/admin/` or `/api/v1/account/`, including
unpublish, revert, duplicate, delete, link targets and impact, media deletion,
retry and preview, media tags, builds, session, users, invitations, settings,
build tokens and import tokens, SHALL deny a request
that carries a Bearer credential with the standard authorization denial and
SHALL NOT resolve a session for it. Allowlisted routes SHALL keep their
existing contracts, body limits, idempotency, preconditions, rate limits and
use-case authorization; uploads SHALL count against the 30-per-minute upload
limit of the creating user. Adding a route to the allowlist SHALL be an
explicit, tested change.

#### Scenario: Allowed draft save
- **WHEN** an import client saves a draft with the current revision through `PUT /api/v1/admin/entries/:entryId/draft`
- **THEN** the response matches a session save by the creating administrator

#### Scenario: Destructive route is closed
- **WHEN** an import client calls `DELETE /api/v1/admin/entries/:entryId`, `POST /api/v1/admin/entries/:entryId/unpublish` or `DELETE /api/v1/admin/media/:mediaId`
- **THEN** each request is denied and nothing changes

#### Scenario: Administration routes are closed
- **WHEN** an import client calls `GET /api/v1/admin/users`, `POST /api/v1/admin/import-tokens` or `GET /api/v1/admin/session`
- **THEN** each request is denied

#### Scenario: Publication without the publish capability
- **WHEN** a client with an import credential lacking `content:publish` calls the publish route
- **THEN** the shared authorization denial is returned and the entry is unchanged

### Requirement: Import-token administration and description routes have separate boundaries
`GET /api/v1/admin/import-tokens`, `POST /api/v1/admin/import-tokens` and
`DELETE /api/v1/admin/import-tokens/:tokenId` SHALL require a browser session
actor with `settings:manage`, SHALL apply the token-management rate limit
before issuance or revocation work, and SHALL reject build, MCP and import
credentials. `GET /api/v1/admin/import-credential` SHALL accept only an import
credential and SHALL describe that credential and the actor's effective
permissions; a session request to it SHALL be denied. The generated OpenAPI
document SHALL describe these routes.

#### Scenario: Editor attempts to issue an import credential
- **WHEN** an editor posts to `/api/v1/admin/import-tokens`
- **THEN** the shared authorization denial is returned and nothing is issued

#### Scenario: Import client describes its credential
- **WHEN** an import client without publishing calls `GET /api/v1/admin/import-credential`
- **THEN** the response names the credential, its expiry and the permissions `content:read`, `content:write` and `media:write`
