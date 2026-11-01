## Why

MCP clients can prepare drafts but a person must open the admin to publish
each one. Migrating a site through an agent (the motivating case is moving
tatianae.com and its ~65 projects) or keeping content current with an agent
needs publication as well. The owner selected publication through a separate,
explicitly granted access level, while unpublication and deletion stay
forbidden.

## Roadmap unit

Step **SM2** of [`docs/site-migration-roadmap.md`](../../../docs/site-migration-roadmap.md),
a single session (size S). Depends on MCP1–MCP3 (archived 2026-10-29).

## What Changes

- New OAuth scope `content:publish`, advertised in discovery metadata. A
  request for it implies `content:read` and `content:write`.
- Consent shows publication as a third access choice next to read and draft
  editing, available only when the user's current role has `content:publish`
  (today: administrators). Read stays the default; the user can explicitly
  choose narrower access, and an approval that includes publication by any
  other user is refused like a viewer's write approval, without promoting the
  user. The page states that published content reaches the site on the next
  build and keeps the permanent ban on unpublishing and deleting.
- Effective authority adds the `publish` operation only when the token, the
  consented ceiling and the current role all allow it. Demotion takes effect on
  the next request; promotion never widens an existing grant.
- New MCP tool `publish_entry` with `entryId`, required `expectedRevision` and
  an optional `idempotencyKey`, running the shared publication use case and
  returning the shared publication result. Validation, route, singleton,
  internal-link and stale-revision guards, idempotent replay and coalesced
  build queueing are unchanged.
- **Breaking for the MCP authority contract:** publication through MCP becomes
  possible for grants that include the new scope; every existing grant keeps
  its scopes and stays unable to publish. A missing scope fails with the OAuth
  `insufficient_scope` challenge naming `content:publish`.
- Admin Settings MCP instructions offer a third access choice "Publishing"
  (read, write, publish, offline) for every client recipe; Account connections
  show the granted scope; the repository MCP guide documents the change.

## Scope, Dependencies and Non-goals

Uses the existing OAuth provider, consent page, delegated actor attenuation,
publication use case, idempotency storage and outbox on Node and Cloudflare. No
database migration and no new REST endpoint. Non-goals: unpublish, delete,
revert, duplicate, media upload or build tools through MCP; granting
`content:publish` to editors (a role-policy change); bulk publication;
updating the versioned public documentation site, which happens with the next
release preparation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-content-server`: the closed tool set gains `publish_entry` under the
  publish permission; a new requirement defines its behavior.
- `mcp-oauth-delegation`: supported scopes, consent display and refusal, and
  grantable operations include publication.
- `content-use-cases`: delegated authority may include publication;
  unpublication and deletion stay denied to delegated actors.
- `authentication-and-actor-boundary`: the MCP actor's restriction scenario
  reflects publish-scoped grants.
- `admin-users-and-settings`: MCP setup instructions gain the publishing
  access choice across all client recipes.

## Impact

- Architecture §3 *Included* (the MCP bullet) and the MCP paragraph of §5;
  ADR 0015 records the decision and the retained unpublish/delete ban.
- Code: `packages/auth` (scopes, normalization, consent data, actor mapping),
  `packages/application` (delegated operation allowlist), `packages/contracts`
  (tool argument schema), `packages/mcp` (tool), `apps/admin` (consent form,
  Settings card examples, connections labels), tests on Node and Worker,
  `docs/mcp.md`, the managed generated-project MCP guide and template 0.41.0.
- Security: a compromised publish-scoped token can change public content;
  mitigations are explicit admin-only consent, 15-minute access tokens,
  revocation and unchanged publication guards.
