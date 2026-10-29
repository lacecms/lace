## Context

See `proposal.md` for motivation and the seven delta specs for acceptance.

Observed implementation:

- `packages/application/src/content-use-cases.ts` already owns draft validation,
  role checks, collection-query budgets, reference projections and guarded
  lifecycle commands. Both platforms construct this class.
- `packages/server/src/app.ts` still owns `modelDto`, `adminEntryDto`, model
  selection for metadata, and some editor-attribution orchestration. Copying
  those functions into MCP would create the duplication the owner rejected.
- `packages/contracts` owns Valibot schemas, JSON DTO projections and error
  classification; the application deliberately cannot import it.
- `Actor` currently contains only `id` and `role`. `hasPermission` derives
  permissions from the role. Deletion of an unpublished collection entry needs
  only `content:write`, so excluding `content:publish` does not block deletion.
- `packages/auth/src/index.ts` instantiates Better Auth with a SQLite Drizzle
  adapter (also used for D1) and a three-route provider allowlist. Better Auth
  is catalog-pinned to `1.7.3`. The OAuth extension is currently installed only
  as a root development dependency for the compatibility fixture.
- Cloudflare uses `createCloudflareWorker`, D1, R2 and `nodejs_compat`; Node
  composes the same Hono app. Neither needs a second process for MCP.

At proposal time architecture section 14 allowed only session-derived content
actors and three provider routes, and section 6 had no MCP package. Apply task
1.1 has now explicitly aligned architecture/backlog with MCP1. Accepted main
specs remain unchanged until verified implementation is synchronized.

The 2026-10-29 compatibility fixture pins `@better-auth/oauth-provider` `1.7.3`
and official MCP server/client `2.4.0`. Password login and ordinary opaque
refresh pass on SQLite and local D1; the SDK's `2025-11-25` initialize/list/call
baseline also passes. The fixture reproduces the same refresh-family race on
both databases: A marks the old refresh token rotated and pauses, B replays it
and invalidates the family, then A inserts a child that remains renewable.
See `verification.md` for evidence and its limits. This is a failed dependency
gate, not permission to weaken the revocation contract or enable OAuth.

The owner approved the corresponding design/task revision on 2026-10-29.
Provider persistence remediation now precedes final compatibility acceptance;
public routing and production OAuth/MCP composition still wait for that gate.

## Goals / Non-Goals

**Goals:** one implementation of content behavior and its JSON projections;
request-scoped delegated authority enforced at the same application boundary as
browser operations; a portable OAuth implementation; an optional deployment
surface with a small, testable client-compatibility baseline.

**Non-Goals:** a generic command bus, auto-export of every REST route as a tool,
a framework abstraction over Hono/the MCP SDK, or moving transport schemas into
application. Existing content/media repositories are reused unchanged unless
shared application tests reveal a necessary correction.

## Decisions

### 1. Share existing use cases rather than implement a parallel MCP service

The dependency path is:

```text
REST handler --+--> application use cases --> existing ports
MCP adapter  --+           |
      |              domain authorization
      +--> shared contracts (validation and JSON projections)
```

Both adapters consume contracts; application never imports contracts. REST and
MCP receive the same composed content-use-case instances. Extend their
portable read surface to provide authorized model discovery and complete admin
read projections (content entry, safe last-editor summary, SEO-enabled flag).
An application result is a typed portable value, never a REST DTO or Response.
Create/save adapters obtain those read-projection inputs through one shared
application projection operation after the existing mutation, rather than
copying editor/model lookups. Keep public-read/build-export behavior intact.

Move metadata selection from `modelDto` into the shared application discovery
operation. Its result structurally contains normalized descriptors and allowed
block definitions. Move the remaining pure conversion into contracts, reusing
`toContentModelDto`. Move `adminEntryDto`'s identity lookup/SEO decision into the
application read projection and use `toAdminContentEntryDto` in one contract
projection helper. REST handlers and MCP tools call these same exports.

Keep existing `ContentUseCases` methods as the actual command implementation.
Do not add a new facade that duplicates validation, queries or mutations. A
small result/projection method is justified by currently HTTP-local behavior;
a second generic service layer containing only forwarding methods is not.

Existing create/save/list contracts are canonical. Generate MCP JSON Schema
from Valibot definitions with the already used `@valibot/to-json-schema`
converter, using a narrow adapter if the pinned SDK requires its own structural
schema wrapper. Validate actual arguments with Valibot regardless. Reuse body
schemas through composition; add only MCP envelope fields such as `entryId`,
`modelKey` and a mandatory `expectedRevision`. Typed filter JSON is normalized
once to the shared query input. No second definition of content constraints,
field descriptors or runtime search limits is permitted.

REST retains query-string parsing, `If-Match`, ETags, status codes and cookie
resolution. MCP retains tool registration, JSON-RPC and result envelopes. The
five tool names are an explicit adapter surface, so adding a future tool still
requires a deliberate registration and security decision. Updating an existing
content rule, metadata shape or projection requires no second implementation.

Rejected: MCP-to-REST loopback calls (cookie emulation, extra I/O and misleading
authority), direct database tools, copied `modelDto`/`adminEntryDto`, and making
application depend on contracts to avoid defining portable result types.

### 2. Put attenuation and operation authorization in the shared boundary

Add an optional immutable, provider-independent authority ceiling to `Actor`.
It contains allowed domain permissions and allowed content-operation identifiers;
it contains no token, OAuth scope syntax or transport/provider type. Actors
without a ceiling keep existing browser behavior. Role permission tables do
not change. Domain permission evaluation intersects the current role with the
ceiling when present; the application centralizes content operation checks in
one authorizer called by every public content operation before protected work.

The authorizer owns the operation-to-permission relationship. Preserve the
existing special deletion rule for ordinary browser actors after its initial
operation check; a delegated deletion is denied before reading the target.
New operations require an explicit entry in a delegated allowlist. Do not
sprinkle `isMcp` checks or role comparisons through handlers or use cases.
Private attribution helpers operate within an already-authorized read and
must not expose a separate user-directory tool.

The auth boundary creates the MCP actor after loading current user/role and
durable consent/token state. The maximum allowlist is model discovery, list,
load, create and complete-draft save. Token scopes further narrow it to reads
or reads/writes. OAuth `offline_access` grants renewal, never a CMS permission.
Unsupported permissions (media/users/settings/publication) never enter this
ceiling. A missing operation is denied, even if a future role gains permissions.

Tool discovery derives visibility from this same operation authorizer. Tool
calls still authorize independently inside application. The request parser
rejects client-supplied actor/authority fields. Audit persistence and DTOs retain
their existing identity/role representation; request authority is not persisted
as a credential or reconstructed from an entry's historical `updatedBy` actor.

Rejected: pretending every MCP actor is an editor (would still allow draft
deletion, lose actual identity/role semantics), removing publication scopes only,
or treating the tool catalogue as the authorization boundary.

### 3. Use portable SDK HTTP handling in a new MCP package

`@lacecms/mcp` owns a stateless Web Request/Response handler and the five tools,
using the official MCP TypeScript SDK's Web-standard server handling. Use the
SDK v2 compatibility path for ordinary `2025-11-25` Streamable HTTP tool calls;
test initialize/list/call against an actual client with that protocol pinned.
No sessionful elicitation, subscriptions, sampling or persistent GET stream is
promised. Auth context and server/tool closures are request-scoped. Do not put
one user's actor into a module singleton.

The SDK package/version and its schema adapter must be pinned in the catalog
and lockfile. The compatibility baseline records the client exchange, Worker
bundle without Node HTTP imports and any negative lifecycle evidence. The
final compatibility gate includes the guarded persistence from decision 6 and
must pass before public routing or production composition. Internal persistence
implementation and migrations are prerequisites, not an enabled OAuth surface.
If the SDK or guarded integration cannot meet the contract, stop and revise
these artifacts; do not silently require a newer client or add a protocol
session DO.

Cloudflare's `createMcpHandler` confirms the stateless deployment model, but its
Agents package is unnecessary when the upstream Web handler suffices. No
`McpAgent`, Durable Object, Workers AI or extra KV binding is introduced.

Package graph additions only:

```text
mcp        -> application, contracts, domain
platform-* -> mcp                      (in addition to existing edges)
```

The platform composes auth, MCP and the existing content use cases and injects
an optional structural handler into `createLaceApp`. Server does not import MCP;
MCP does not import server or auth. The composition root verifies OAuth once
per request and supplies the restricted actor to the adapter. HTTP middleware
routes `/mcp` and explicit discovery/provider paths before asset fallback and
preserves OAuth/MCP responses through existing request observability.

### 4. Extend Better Auth for OAuth while preserving Lace's account boundary

Use the portable `@better-auth/oauth-provider` extension with existing
email/password accounts, not a Cloudflare-only authorization service. Reuse
provider PKCE, code/token generation, redirect validation and OAuth error
behavior. Decision 6 supplies the persistence guards missing from the provider's
rotation/invalidation sequence. Do not implement cryptographic protocol
primitives in Lace. The
initial scope is authorization code, refresh and bounded public-client DCR;
CIMD and arbitrary client-controlled URL fetching are disabled. This avoids a
new cross-runtime DNS/SSRF transport and supports the baseline client flow.

The dependency baseline checks the extension's peer compatibility with pinned
Better Auth and inventories provider routes/schema. The selected candidates
are the versions recorded above; pinning or a passing ordinary exchange does
not establish lifecycle safety. The final gate tests the provider together with
the guarded SQLite/D1 integration, including the reproduced race. A required
Better Auth upgrade is confined to this change, with full existing auth
regressions; if it alters current account or session contracts, update the plan
before implementation proceeds.

Production plugin composition must also compile, rather than relying on the
JavaScript runtime fixture alone. The pinned provider `1.7.3` emits optional
OpenAPI metadata types that are incompatible with `better-call@1.4.0` under
`exactOptionalPropertyTypes: true`. The owner selected a compiler adjustment
instead of a dependency patch: override only `exactOptionalPropertyTypes` to
`false` in `packages/auth/tsconfig.json` and
`scripts/fixtures/oauth-mcp/tsconfig.json`. Keep `strict: true`, all other
compiler checks, the root baseline and other packages unchanged. Compile the
actual `betterAuth({ plugins: [createMcpOAuthProvider(...)] })` fixture in the
compatibility gate, then rerun the full guarded SQLite/D1/Worker fixture and
existing auth regressions before public composition. Do not patch vendor files,
cast away the plugin incompatibility or suppress the type-test error. This
adjustment changes compile-time optional-property assignment rules only; it does
not change runtime validation, consent, authority or persistence requirements.

Use opaque, database-backed access tokens where the provider supports them,
plus durable grant state checked per request. This avoids relying on a JWT
signature after revocation. If provider discovery needs signing keys, use its
durable key storage; no per-isolate generation. Lace's narrow OAuth authority
resolver also checks enabled state and persisted role, which token verification
alone cannot establish. Never cache positive role/grant checks across requests.

External routes, all conditional on MCP enablement:

| Surface | Responsibility |
| --- | --- |
| `/mcp` | Authenticated protocol endpoint |
| `/.well-known/oauth-protected-resource/mcp` | Canonical resource metadata; root alias if required by the pinned provider |
| `/.well-known/oauth-authorization-server/api/auth` | Canonical issuer metadata for `/api/auth`; explicitly routed provider alias if required |
| `/api/auth/oauth2/authorize` | Validated OAuth request and login/consent continuation |
| `/api/auth/oauth2/token` | Code exchange and refresh |
| `/api/auth/oauth2/register` | Bounded public-client registration |
| `/api/auth/oauth2/revoke` | Standard credential revocation |
| `/admin/mcp/consent` | Existing-session consent page |
| `/api/v1/account/mcp-connections` | Session-only connection listing |
| `/api/v1/account/mcp-connections/:connectionId/revoke` | Session-only `POST` revocation |

Keep a literal method/path allowlist, including only the provider's required
consent-submit endpoint and JWKS/discovery aliases when present. Confirm their
exact names from the pinned extension's exported endpoint definitions during
the compatibility gate and lock them with route tests; do not forward its
catch-all. Provider client CRUD, raw consent CRUD, userinfo and introspection
endpoints stay private; use server-side APIs for Lace connection management.
Existing three browser endpoints remain unchanged.

Canonical URLs derive from validated `LACE_PUBLIC_BASE_URL`, never incoming
Host/forwarded headers. Production OAuth uses HTTPS; local development permits
loopback HTTP under existing origin policy. Callback validation is delegated to
the provider's native/web client rules with exact registered matching. Client
names are escaped and external logos/documents are not fetched or rendered.

### 5. Login continuation and consent are small additions to the existing UI

The existing sign-in page receives an opaque transaction handle, not a raw
arbitrary return URL. Pending authorization parameters are server-bound,
short-lived and validated before resumption. Successful sign-in returns to the
authorization transaction and then the protected consent route. A pre-existing
session skips login but not first consent. Never create a separate MCP password
form or relax the existing trusted origins for remote clients.

Consent allows read access or read/write access supported by the current user
and requested scopes; write includes read. It states that publication,
unpublication and deletion are always unavailable. Scope increases require new
explicit consent. A prior grant can avoid repeating unchanged consent only
through the provider's validated same-user/client/resource behavior.

`/admin/account` adds a Connections section plus explicit revoke confirmation.
Use Lace session-only routes instead of exposing provider-wide consent/client
management. A server-derived feature-capability flag hides the section when
disabled; it need not modify the existing session summary contract. Listing
and revocation are restricted by user ownership, not admin role.

### 6. Guard issuance and revocation with durable family state

The released provider's separate refresh compare-and-swap, child insertion and
family deletion do not form one atomic lifecycle. A single-row CAS prevents
double consumption but does not prevent the demonstrated post-revocation child
insertion. Lace must therefore make durable authority publication, rather than
provider row existence, the atomic completion point. This is a persistence
integration around the provider; token generation, hashing/encryption, PKCE,
client/resource/redirect validation and OAuth responses remain provider-owned.

#### Durable records and ownership

Use provider OAuth tables through the existing Drizzle adapter. Add only the
Lace-owned records needed to bind provider state to consent and lifecycle:

- A grant/family identity bound to the user, client, resource, consented scope
  ceiling and absolute expiry, with an active/revoked state and monotonic
  generation. A fresh connection gets a new identity; revocation never changes
  back to active. Repeated consent cannot revive an old family.
- A per-user authority generation used as a durable account-wide invalidation
  barrier. Authorization transactions capture it when they start; continuation
  and grant creation compare that captured value and revalidate the initiating
  session. Never refresh an old transaction's generation to bypass invalidation.
  Every grant and issuance retains the captured generation, so invalidation
  also covers concurrent creation of a connection.
- An issuance attempt recording its grant/family and captured generations,
  provider parent identity, kind (code/refresh), input credential digest,
  bounded expiry and pending/committed/aborted state. A unique consumed-input
  claim permits one winner. Consumed-refresh tombstones survive provider row
  deletion, so replay can still identify and revoke the original family.
- Bindings from provider access/refresh records to their issuance and family.
  These hold identifiers and lifecycle metadata, not a second plaintext token
  store. Tokens from pending, aborted or unbound records never grant authority.

Grant/attempt/binding tables belong in shared SQL persistence, with narrow
portable capabilities consumed by the auth integration. Only owner-scoped
connection listing/revocation and account-wide invalidation are application
ports; provider schema and adapter types stay out of application. Platforms
supply SQLite/D1 implementations through existing package edges. Auth integration
state and adapter hooks are request-scoped; a process mutex, module singleton,
KV or Worker-local lock is not a persistence guard.

#### Claim, prepare and publish

Authorization binds the provider's code record to a validated consent
transaction and grant before returning the authorization response. For either
code exchange or refresh, use the following protocol:

1. Resolve and validate the provider credential and its server-owned bindings.
   Claim its consumption and create one pending attempt with captured family
   and user generations in a guarded atomic persistence operation. Couple the
   provider's consume/CAS operation to that claim through the request-scoped
   adapter integration; do not independently consume the same input twice.
   Claim predicates include active grant/account state and absolute expiry.
   An invalid credential cannot revoke a family chosen by client arguments.
2. Let the provider validate the remaining protocol input and prepare child
   provider records linked to that attempt. Guard these writes against the
   captured generations. Persisted child records remain tentative and cannot
   be used by the MCP resolver or another token request. Do not release a
   successful token response yet.
3. Publish authority in one guarded SQLite transaction or D1 batch: check the
   attempt's unique claim, active family, unchanged family/user generations,
   current enabled account, complete expected provider records and their bound
   client/resource/scopes. Atomically commit the attempt and activate its token
   bindings. Child expiry is capped by the original grant, not restarted by
   rotation. Only then may the response release the provider-generated tokens.

The commit in step 3 is the issuance linearization point. A competing consumer
cannot publish a second issuance. Refresh replay, explicit revoke and
account-wide invalidation share the durable guards below, so a successful CAS
in step 1 is never sufficient to publish after revocation. Raw provider token
routes remain behind this integration; no alternate verification/introspection
path may authenticate tentative records.

The integration must use explicit supported adapter/hooks with typed operation
context, not parse generated SQL or patch package internals. The compatibility
fixture must demonstrate these hook boundaries with the pinned provider. If
its API cannot support the protocol without a provider fork, cryptographic
reimplementation or a new service, stop and replan before exposing routes.

#### Revoke and recover

Revocation atomically marks the durable family revoked and advances its
generation. That commit is the revocation linearization point; provider token
cleanup is secondary and cannot be its only evidence. Refresh replay uses the
consumed-input record to revoke that family even if provider cleanup removed
the old refresh row. A replay concurrent with a pending rotation makes the
pending attempt's commit predicate fail. The pending request returns sanitized
`invalid_grant`, and its children cannot authenticate or refresh. If issuance
committed first, the later revocation invalidates all its bindings. Retain the
replayed-token tombstone through the family's authority lifetime.

Before every MCP request and token renewal, resolve provider validity plus the
committed binding, active unexpired family, captured family/user generations
and current persisted account/role. No positive result is cached across
requests. Provider row existence or a valid signature alone is insufficient.
The same checks apply to any child persisted after revocation, including a
write whose result arrives after the invalidation commit.

Interruption before publication leaves no usable new authority. Abort/expire
pending attempts and remove tentative provider rows through bounded indexed
maintenance. A consumed credential is never reset to reusable after a provider
or persistence failure; a refresh attempt interrupted after consumption revokes
its family and requires reconnection. Failure to commit or confirm commit
returns no tokens and fails closed. If publication committed but the response
was lost, reuse of the consumed refresh token revokes the family and requires
reconnection, as specified. Do not return a cached plaintext token response or
silently retry issuance. Retry of cleanup/invalidation is idempotent and cannot
restore authority. Keep generation/tombstone records until no associated code,
refresh token, access token or pending attempt can still be valid.

Disable/reset/sign-out-everywhere/revoke-others advance the user's durable
authority generation alongside the existing security orchestration. Its
invalidation commit must precede any reported account-security success and
cover grants/attempts racing that operation. Persist a resumable invalidation
marker where existing session/password effects cannot share the same atomic
unit; retries finish existing effects without reopening OAuth authority.
While MCP is disabled, account-security invalidation still runs. Re-enabling
a user or MCP never reactivates an old family. Ordinary browser sign-out is
independent. Revocation governs requests starting after commit, not undoing
already committed content writes.

Verify the reproduced CAS/replay/child-insert schedule, both possible
issuance/revoke commit orders, competing code/refresh claims, concurrent account
invalidation, and interruption at each persistence boundary on SQLite and D1.
Assert absence of usable partial authority and of successful token responses
for failed commits; do not weaken the tests to accept a renewable child.

Use indexed bounded token, family, attempt and user lookups. D1 uses guarded
batches/set-based statements, never interactive transactions around an async
provider callback. Cleanup is bounded through existing scheduled/startup
maintenance; OAuth records never enter content sync or request site builds.

Rejected: provider defaults or CAS alone; deleting provider rows as the sole
revocation mechanism; in-process serialization; a request-long D1 transaction;
releasing tokens before durable publication; and replacing provider protocol
primitives with a second OAuth implementation.

### 7. One configuration gate and existing operational infrastructure

Put strict parsing for `LACE_MCP_ENABLED` in a shared runtime-neutral settings
helper and call it from both platform parsers. Missing/`false` disables;
`true` enables; other values fail with names only. Parse once with the existing
runtime settings. The flag controls endpoint routing, provider registration,
discovery, token acceptance/renewal and UI capability together. It requires no
additional Cloudflare binding. Generated projects document an opt-in variable
and existing migrations, without an enabled-by-default template.

Reuse fixed-window limiter storage and trusted-client-address resolution for
the budgets in `mcp-oauth-delegation`/`mcp-content-server`. Keep provider limits
consistent with those advertised limits rather than accidentally counting all
OAuth traffic under Lace's browser-login bucket. Host/Origin checks use the
canonical deployment origin; absent Origin remains valid for native clients.
No wildcard change to browser-cookie origins is permitted.

Reuse shared error classification and DTO validation. Return known tool
failures with stable code/paths and `isError`, while OAuth errors remain HTTP
challenges and protocol parsing remains SDK-owned. Never blindly auto-retry
create/save on a lost response: creation has the existing non-idempotent
semantics, and save retries must retain the original revision. Document that a
client should re-read after an uncertain outcome, not create another entry.

## Risks / Trade-offs

- **Provider/SDK compatibility and D1 atomicity** → A concrete compatibility
  baseline precedes persistence remediation; final acceptance tests the guarded
  integration before public wiring. Record tested versions, route inventory,
  migrations and negative/positive evidence separately. Stop/replan if supported
  provider hooks cannot establish the durable protocol in decision 6.
- **Pending provider records and interrupted issuance** → Only committed
  bindings authenticate; durable generations block post-revocation publication.
  Keep consumed-input tombstones and bound cleanup, and fault-test every boundary
  on both databases. Extra SQL metadata is required by the reproduced race.
- **Authority lost in shared helper calls** → Carry the same immutable actor
  through all nested operations; test direct restricted use-case calls and
  inherited role changes, not just tool visibility.
- **Regression from extracting HTTP-local projections** → Keep existing REST
  tests and add cross-transport equivalence cases for metadata, attribution,
  defaults, filters, invalid input and concurrent saves.
- **More auth database reads** → Necessary for immediate revocation/current
  roles; indexed lookups and runtime query budgets, with no positive authority
  cache spanning requests.
- **DCR compatibility surface and persistent registration abuse** → Public
  clients only, bounded metadata/bodies, existing limiter storage, no URL fetch,
  and bounded expiry cleanup. CIMD is deferred rather than partially secured.
- **Protocol extensions are intentionally limited** → Document tool-call
  baseline and tested client versions. Do not imply full legacy sessions or all
  current SDK features from a successful list/call test.

## Migration Plan

1. On explicit apply, update architecture sections 3/5/6/12/14/17/19 and select
   MCP1 in backlog before any production edit, naming this change and its limits.
2. Establish the pinned provider/SDK baseline and retain the failed lifecycle
   regression as evidence, without treating pinning or happy-path tests as a
   passed gate. Record route/schema inventories and existing login behavior.
3. Before final compatibility acceptance, introduce reviewed additive provider
   and lifecycle migrations, then implement decision 6 through supported provider
   hooks on SQLite/D1. Keep all public OAuth/MCP routing disabled. Verify fresh
   and populated databases, crash recovery and the formerly failing race. Run
   the complete S256, code/refresh, SDK baseline and Worker-bundle fixture against
   this guarded integration; only all required passing cases close the gate.
   Do not rename migrations or generate schema at startup. Existing accounts,
   sessions, content and build tokens survive.
4. Refactor and verify shared content authorization/projections with MCP still
   off, then compose OAuth/MCP and UI on both platforms. No content migration is
   needed. Existing migrations remain required by readiness even when MCP is off.
5. Verify enabled and disabled Node/D1 flows, generated-project packaging,
   consent through the actual login form and connection/account revocation.
   Real-account remote deployment remains a documented owner check unless an
   authorized Cloudflare deployment is part of the apply session.
6. Roll back exposure by setting `LACE_MCP_ENABLED=false`. Keep additive tables;
   do not destructively downgrade the schema. Ordinary admin functionality stays
   available. Re-enabling still requires unexpired, unrevoked authority.

## Reference basis

Retrieved 2026-10-28; released package types and lockfile remain implementation
evidence. These sources describe library capabilities, not completed Lace work:

- [Better Auth OAuth Provider](https://better-auth.com/docs/plugins/oauth-provider)
- [Better Auth MCP integration](https://better-auth.com/docs/plugins/mcp)
- [Official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Cloudflare stateless MCP handling](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/)
- [MCP 2025-11-25 authorization baseline](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)

The MCP-specific Better Auth recipe currently recommends a newer protocol
profile and CIMD. This design instead composes the OAuth provider directly for
the selected compatibility baseline; it does not assume that recipe's defaults
or JWT signature verification alone meet Lace's revocation requirements.
