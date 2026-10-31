## ADDED Requirements

### Requirement: Import-token contracts reveal the secret only once
The shared contracts SHALL define a strict import-token DTO with `id`, `name`,
`tokenPrefix`, `capabilities` (`["content:import"]` or
`["content:import", "content:publish"]`), `createdAt`, `expiresAt`, optional
`lastUsedAt` and `revokedAt`, and `createdBy` with the creator's `id`, `email`
and optional `displayName`. A creation request SHALL be a strict object with
`name` (1 to 120 characters), `expiresInDays` (an integer from 1 to 7) and
optional boolean `allowPublish` defaulting to `false`. The creation response
SHALL be the DTO plus `token`; list and revocation responses SHALL never
contain the plaintext or its verifier. The list SHALL be `{items}` ordered by
creation time, newest first. Timestamps SHALL use the shared ISO
representation. Build-token DTOs SHALL be unchanged.

#### Scenario: Creation request with an out-of-range lifetime
- **WHEN** a client submits `{"name": "Import", "expiresInDays": 30}`
- **THEN** the API returns `422` `VALIDATION_FAILED` with the pointer `/expiresInDays`

#### Scenario: Listed token carries no secret
- **WHEN** a client validates an import-token list response that includes a `token` property
- **THEN** contract validation rejects the payload

### Requirement: The import-credential description is closed and validated
`GET /api/v1/admin/import-credential` SHALL return a strict object with
`token`, the import-token DTO of the presented credential without plaintext,
and `permissions`, the actor's effective permissions after attenuation and the
current role, in the domain's permission order. The response SHALL carry
`cache-control: no-store`.

#### Scenario: Publishing credential of an administrator
- **WHEN** an administrator's publishing import credential reads its description
- **THEN** `permissions` is `content:read`, `content:write`, `content:publish` and `media:write` and the response is not cacheable

### Requirement: Admin entry lists accept an exact slug parameter
The admin entry-list route SHALL accept an optional `slug` parameter. It SHALL
be a slug of at most 100 characters matching `^[a-z0-9]+(?:-[a-z0-9]+)*$` and
SHALL be accepted only for collection models. It SHALL restrict the page and
the per-status totals to entries whose current draft slug equals the value
exactly, combined with every other list parameter by AND; a published slug
that differs from the current draft slug SHALL NOT match. An invalid value, or
any `slug` for a page or global model, SHALL return `422` `VALIDATION_FAILED`
with the pointer `/slug` and no list content. A continuation cursor SHALL be
accepted only with the same `slug` that produced it. The generated OpenAPI
document SHALL describe the parameter.

#### Scenario: Look up a collection entry by slug
- **WHEN** a client requests `GET /api/v1/admin/models/posts/entries?slug=hello-world`
- **THEN** the page contains exactly the entries whose current draft slug is `hello-world`, and a draft with slug `hello-world-2` or a title containing `hello world` is excluded

#### Scenario: Slug on a page model
- **WHEN** a client requests `?slug=home` for a page model
- **THEN** the API returns `422` with the pointer `/slug`

### Requirement: Admin media lists accept a content-hash parameter
The admin media-list route SHALL accept an optional `sha256` parameter of
exactly 64 lowercase hexadecimal characters. It SHALL restrict the page to
`active` items whose recorded hash equals the value, combined with every other
media-list parameter by AND; items without a recorded hash SHALL never match.
An invalid value SHALL return `422` `VALIDATION_FAILED` with the pointer
`/sha256`. A continuation cursor SHALL be accepted only with the same `sha256`
that produced it. Admin media DTOs SHALL carry optional `sha256`, absent when
no hash is recorded. Public media DTOs, media usage DTOs and the build export
SHALL NOT carry it. The generated OpenAPI document SHALL describe the
parameter and field.

#### Scenario: Find an uploaded file by hash
- **WHEN** a client requests `GET /api/v1/admin/media?sha256=<hash of an uploaded file>`
- **THEN** the page contains the active items with that hash, each DTO carrying the same `sha256`

#### Scenario: Uppercase hash is refused
- **WHEN** a client sends a 64-character hash with uppercase letters
- **THEN** the API returns `422` with the pointer `/sha256`

#### Scenario: Public delivery is unchanged
- **WHEN** a public reader or a build reads a published entry that references hashed media
- **THEN** the media representation carries no `sha256`
