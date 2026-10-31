## Context

See proposal.md for motivation. Current state (MCP1–MCP3):

- `packages/auth/src/mcp-oauth.ts`: `MCP_OAUTH_SCOPES` is
  `content:read`, `content:write`, `offline_access`; `normalizeMcpScopes`
  adds `content:read` to write requests; discovery metadata advertises the list.
- `packages/auth/src/mcp-consent.ts`: consent details return `scopes` and
  `canWrite`; approval with `content:write` by a user without that permission
  throws `access_denied`.
- `packages/auth/src/mcp-actor.ts`: `resolve(request, requiredScope)` checks
  token/grant scopes, then attenuates the actor to permissions
  `content:read`(+`content:write`) and operations
  `discoverModels, list, load`(+`create, save`).
- `packages/server/src/app.ts`: the `/mcp` route peeks at `tools/call` names to
  require `content:write` for `create_entry`/`save_draft`, so a missing scope
  returns the OAuth `insufficient_scope` challenge rather than a tool error.
- `packages/application/src/content-authority.ts`: `publish` already maps to
  `content:publish` (admin-only in `defaultRolePermissions`);
  `delegatedContentOperations` caps delegated actors at five operations.
- `packages/mcp/src/index.ts`: a static tool table filtered per request by
  `canContentOperation`; arguments come from `mcpToolArgumentSchemas` in
  `packages/contracts`.
- REST publish (`POST /api/v1/admin/entries/:entryId/publish`) takes the
  revision and an optional `Idempotency-Key` and returns
  `publishContentEntryResultSchema`.
- Admin: `McpConsentForm` offers read/write radios (read default, write
  disabled without permission); `connection-examples.ts` has
  `McpAccess = "read" | "write"`; `McpConnections` labels granted scopes.

## Goals / Non-Goals

**Goals:**

- One new scope and one new tool, wired through the same authority layers as
  draft writes, so each layer (scope, consent ceiling, role, operation
  allowlist) independently blocks publication.
- REST and MCP publication are behaviorally identical.

**Non-Goals:**

- Changing role policy, publication semantics, idempotency storage or the
  build outbox.
- Public documentation site updates (next release preparation).

## Decisions

### D1. Scope hierarchy publish ⊃ write ⊃ read

`MCP_OAUTH_SCOPES` becomes `content:read, content:write, content:publish,
offline_access` (order defines normalized output). Normalization adds
`content:write` and `content:read` when `content:publish` is requested. A
separate publish-only scope without write was rejected: publishing requires a
saved draft revision, and an agent that cannot fix a failing draft would be a
confusing, rarely useful grant.

### D2. Consent: third radio, server-side guard

Consent details gain `canPublish` (current role has `content:publish`). The
form adds a third radio "Read, edit and publish" shown only when the request
includes `content:publish`, disabled with an explanation when `canPublish` is
false. Read remains the default. The submitted scope filters out unchosen
levels as today. The server repeats the existing `canWrite` guard for
publication: an approval containing `content:publish` by a user without the
permission throws `access_denied`. The ban text changes to "Unpublishing,
deleting content and media administration are never allowed"; when the
publish option is shown, its description says publication reaches the site on
the next build.

### D3. Actor attenuation and operation allowlist

`mcp-actor.ts` accepts `requiredScope` `content:publish` and, when the token
scopes include it, adds permission `content:publish` and operation `publish`.
`delegatedContentOperations` gains `publish` only. Because
`canContentOperation` also checks the current role's permission, a demoted
administrator loses publication on the next request without token changes.
`unpublish`, `delete`, `revertDraft`, `duplicate` stay out of the allowlist, so
direct use-case calls by any delegated actor keep failing.

### D4. Scope selection at the HTTP boundary

The `/mcp` route maps `tools/call` name `publish_entry` to required scope
`content:publish`, alongside the existing write mapping. A token without the
scope therefore receives HTTP 403 `insufficient_scope` with
`scope="content:publish"`, matching how missing write scope behaves, and the
client can re-run authorization. A token with the scope whose user lost the
role permission passes the scope check and is refused by the application
(`AUTHORIZATION_DENIED` as an MCP tool error), mirroring draft-write demotion.

### D5. Tool contract reuses REST contracts

`mcpToolArgumentSchemas.publish_entry` is a strict object of `entryId`
(`identifierSchema`), `expectedRevision` (`expectedRevisionSchema`) and
optional `idempotencyKey` (`idempotencyKeySchema`, the REST header schema).
The tool calls `content.publish({actor, entryId, expectedRevision,
idempotencyKey?})` and returns `toPublishContentEntryResultDto` validated by
`publishContentEntryResultSchema`, enriched with `seo` and `updatedBy`
exactly as the REST handler does; that enrichment moves into one shared
helper used by both transports so the results cannot drift. Tool description:
"Publish the saved draft at the expected revision. Requires content:publish.
Retry with the same idempotencyKey after an uncertain outcome."

Alternative rejected: a separate MCP result shape. It would duplicate
publication DTO rules that `rest-contracts` already requires to be shared.

### D6. Admin setup and connections

`McpAccess` becomes `"read" | "write" | "publish"`; the Settings card adds a
"Publishing" option producing `content:read,content:write,content:publish,
offline_access` in Codex CLI, TOML, Claude Code and Gemini recipes, with the
administrator-only and next-build notes. The Account connections list shows
"Publish" when the grant includes the scope.

### D7. Documentation and ADR

ADR 0015 records: publication through MCP behind an explicit admin-only scope;
unpublish/delete remain banned because they are destructive to the public site
and to internal links (CE10 confirmation flows require a human). Architecture
§3 and §5, and `docs/mcp.md`, are updated in the same change.

## Risks / Trade-offs

- [A leaked publish-scoped token changes the public site] → admin-only consent,
  15-minute access tokens, refresh rotation with reuse revocation, per-user
  revocation in Account, unchanged publication guards; published content can
  be corrected by a human.
- [Agents publish many entries quickly] → existing 60 requests/minute MCP
  limit and outbox coalescing keep builds bounded.
- [Clients cache old tool lists] → `tools/list` is computed per request; a
  re-consented client sees the new tool on its next list.
- [Wording drift between consent, Settings and docs] → tests assert the ban
  text and scope strings in each surface.

## Migration Plan

No database migration: grants already store scope strings. Deploy API, admin
and MCP packages together. Existing connections keep their scopes and cannot
publish; administrators who want publication re-run client authorization with
the publishing scopes. Rollback to the previous release makes stored
`content:publish` grants unusable for publication because the older allowlist
denies it; affected users should revoke and reconnect after rollback.
